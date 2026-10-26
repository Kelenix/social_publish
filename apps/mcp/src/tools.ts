import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiToken } from "@app/db";
import { prisma } from "@app/db";
import { connectorForPlatform, connectorState, listConnectors } from "@app/core/connectors";
import { SourceError } from "@app/core/media/sources";
import { getOperation, importInputSchema, requestImport } from "@app/core/operations";
import { PLATFORMS, REAL_PLATFORMS } from "@app/core/platforms";
import { createDraft, getPost, PostNotEditableError, toInput, UnknownMediaError, updateDraft } from "@app/core/posts";
import { postInputSchema, variantInputSchema } from "@app/core/posts/schema";
import { cancelSchedule, listAccounts, listDestinations, schedulePost, validatePostForAccounts } from "@app/core/scheduling";
import { prepareContent } from "@app/core/scheduling/content";
import type { TokenScope } from "@app/core/tokens";

type Result = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

const ok = (data: Record<string, unknown>): Result => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data });
const fail = (code: string, message: string, details?: unknown): Result => {
  const error = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(error, null, 2) }], structuredContent: error };
};

const uuid = z.uuid();
const variantShape = variantInputSchema.extend({
  platform: z.enum(PLATFORMS).describe("Plateforme de la variante (TEST = simulation)."),
});

const INSTRUCTIONS = `Serveur du Studio de publication (outil personnel).
Parcours type : import_media (fichier déposé dans le dossier inbox du projet, ou URL HTTPS) → get_operation jusqu'à SUCCEEDED → create_draft → preview_post → validate_post → schedule_post ou publish_now.
Règles :
- Créer ou modifier un brouillon ne publie jamais rien.
- schedule_post et publish_now valent autorisation de publier la version indiquée (expected_version) sur les comptes indiqués. Ne les appelle que si l'utilisateur l'a demandé explicitement pour ce contenu, ces comptes et cette date.
- Toute modification d'un brouillon incrémente sa version : il faut reprévisualiser avant d'autoriser.
- Les comptes « simulated » appartiennent au connecteur de test : ils ne publient sur aucun réseau réel.
- Dates : « AAAA-MM-JJTHH:mm » dans le fuseau de la publication (Europe/Rome par défaut).`;

function postSummary(post: NonNullable<Awaited<ReturnType<typeof getPost>>>) {
  return { post_id: post.id, title: post.title, status: post.status, version: post.version, timezone: post.timezone, scheduled_at: post.scheduledAt?.toISOString() ?? null };
}

async function destinationsOf(postId: string) {
  const rows = await listDestinations({ postId });
  return rows.map((d) => ({
    destination_id: d.id,
    account_id: d.accountId,
    account: d.account.displayName,
    platform: d.platform,
    simulated: d.account.connector === "test",
    status: d.status,
    scheduled_at: d.scheduledAt.toISOString(),
    next_attempt_at: d.nextAttemptAt.toISOString(),
    attempts: d.attempts,
    published_at: d.publishedAt?.toISOString() ?? null,
    remote_url: d.remoteUrl,
    error: d.lastError ? { code: d.lastErrorCode, message: d.lastError } : null,
  }));
}

/** Construit un serveur MCP dont chaque outil vérifie la portée du jeton appelant. */
export function buildServer(token: ApiToken): McpServer {
  const server = new McpServer({ name: "studio-publication", version: "0.3.0" }, { instructions: INSTRUCTIONS });
  const actor = `mcp:${token.name}`;

  function guarded<A>(scope: TokenScope, handler: (args: A) => Promise<Result>) {
    return async (args: A): Promise<Result> => {
      if (!token.scopes.includes(scope)) return fail("FORBIDDEN_SCOPE", `Ce jeton n'a pas la portée « ${scope} ».`);
      try {
        return await handler(args);
      } catch (error) {
        if (error instanceof SourceError || error instanceof PostNotEditableError || error instanceof UnknownMediaError) return fail("INVALID_REQUEST", error.message);
        if (error instanceof z.ZodError) return fail("VALIDATION", "Paramètres invalides.", error.issues);
        console.error(error);
        return fail("INTERNAL", "Erreur interne ; consulte les journaux du serveur MCP.");
      }
    };
  }

  server.registerTool(
    "list_accounts",
    { title: "Lister les comptes", description: "Comptes connectés, avec leur état (READY, RECONNECT_REQUIRED…) et s'ils sont simulés.", annotations: { readOnlyHint: true } },
    guarded("read", async () => {
      const accounts = await listAccounts();
      return ok({
        accounts: accounts.map((a) => ({
          account_id: a.id,
          name: a.displayName,
          platform: a.platform,
          connector: a.connector,
          simulated: a.connector === "test",
          status: a.status,
          status_detail: a.statusDetail,
          rate_limited_until: a.rateLimitedUntil?.toISOString() ?? null,
        })),
      });
    }),
  );

  server.registerTool(
    "list_capabilities",
    {
      title: "Capacités des connecteurs",
      description: "Pour chaque plateforme : état du connecteur, types de contenus, programmation native, suivi, limites (texte, médias, durées, ratios) et permissions.",
      annotations: { readOnlyHint: true },
    },
    guarded("read", async () => {
      const accounts = await listAccounts();
      const connectors = listConnectors().map((c) => ({
        connector: c.id,
        platform: c.platform,
        label: c.label,
        simulated: Boolean(c.simulated),
        state: connectorState(c, accounts.filter((a) => a.connector === c.id)),
        capabilities: c.capabilities(),
      }));
      const missing = REAL_PLATFORMS.filter((p) => !connectorForPlatform(p)).map((platform) => ({ platform, state: "NOT_CONFIGURED", note: "Connecteur pas encore disponible." }));
      return ok({ connectors, unavailable: missing });
    }),
  );

  server.registerTool(
    "list_media",
    { title: "Lister les médias", description: "Médias de la bibliothèque (identifiants à utiliser dans les brouillons).", inputSchema: { limit: z.number().int().min(1).max(200).default(50) }, annotations: { readOnlyHint: true } },
    guarded("read", async ({ limit }: { limit: number }) => {
      const media = await prisma.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, take: limit });
      return ok({
        media: media.map((m) => ({ media_id: m.id, name: m.originalName, kind: m.kind, mime_type: m.mimeType, size_bytes: Number(m.sizeBytes), width: m.width, height: m.height, duration_ms: m.durationMs, created_at: m.createdAt.toISOString() })),
      });
    }),
  );

  server.registerTool(
    "import_media",
    {
      title: "Importer un média",
      description:
        "Importe une image ou une vidéo. `path` : fichier du dossier inbox du projet (chemin relatif, ou absolu sous ce dossier). `url` : URL HTTPS publique. Renvoie immédiatement un identifiant d'opération à suivre avec get_operation.",
      inputSchema: { path: z.string().max(1024).optional(), url: z.url().max(2048).optional() },
    },
    guarded("write", async (args: { path?: string; url?: string }) => {
      const input = importInputSchema.safeParse(args.path ? { path: args.path } : args.url ? { url: args.url } : {});
      if (!input.success || (args.path && args.url)) return fail("VALIDATION", "Indique soit `path`, soit `url`.");
      const op = await requestImport(input.data, actor);
      return ok({ operation_id: op.id, status: op.status, next: "Appelle get_operation avec cet identifiant jusqu'à SUCCEEDED ou FAILED." });
    }),
  );

  server.registerTool(
    "get_operation",
    { title: "Suivre une opération", description: "État d'une opération longue (import).", inputSchema: { operation_id: uuid }, annotations: { readOnlyHint: true } },
    guarded("read", async ({ operation_id }: { operation_id: string }) => {
      const op = await getOperation(operation_id);
      if (!op) return fail("NOT_FOUND", "Opération introuvable.");
      return ok({ operation_id: op.id, kind: op.kind, status: op.status, result: op.result as Record<string, unknown> | null, error: op.error });
    }),
  );

  const draftFields = {
    title: z.string().min(1).max(200).describe("Titre (nom interne, titre par défaut)."),
    body: z.string().max(65_000).optional().describe("Texte principal."),
    hashtags: z.array(z.string()).max(100).optional(),
    media_ids: z.array(uuid).max(35).optional().describe("Médias principaux, dans l'ordre."),
    timezone: z.string().optional().describe("Fuseau IANA (défaut Europe/Rome)."),
    variants: z.array(variantShape).optional().describe("Une entrée par plateforme ciblée ; un champ absent hérite du contenu principal."),
  };

  server.registerTool(
    "create_draft",
    { title: "Créer un brouillon", description: "Crée un brouillon. Ne publie et ne programme rien.", inputSchema: draftFields },
    guarded("write", async (args: { title: string; body?: string; hashtags?: string[]; media_ids?: string[]; timezone?: string; variants?: z.input<typeof variantShape>[] }) => {
      const input = postInputSchema.parse({ title: args.title, body: args.body, hashtags: args.hashtags, mediaIds: args.media_ids, timezone: args.timezone, variants: args.variants });
      const post = await createDraft(input, actor);
      return ok(postSummary(post));
    }),
  );

  server.registerTool(
    "update_draft",
    {
      title: "Modifier un brouillon",
      description: "Modifie les champs fournis d'un brouillon (les autres sont conservés ; `variants` remplace toutes les variantes). `expected_version` évite d'écraser une modification concurrente.",
      inputSchema: { post_id: uuid, expected_version: z.number().int().positive().optional(), ...Object.fromEntries(Object.entries(draftFields).map(([k, v]) => [k, v.optional()])) },
    },
    guarded("write", async (args: Record<string, unknown> & { post_id: string; expected_version?: number }) => {
      const post = await getPost(args.post_id);
      if (!post) return fail("NOT_FOUND", "Publication introuvable.");
      if (args.expected_version !== undefined && args.expected_version !== post.version) return fail("VERSION_MISMATCH", `Version actuelle : ${post.version}.`);
      const current = toInput(post);
      const pick = <T>(key: string, fallback: T) => (args[key] === undefined ? fallback : (args[key] as T));
      const input = postInputSchema.parse({
        title: pick("title", current.title),
        body: pick("body", current.body),
        hashtags: pick("hashtags", current.hashtags),
        mediaIds: pick("media_ids", current.mediaIds),
        timezone: pick("timezone", current.timezone),
        variants: pick("variants", current.variants),
      });
      return ok(postSummary(await updateDraft(post.id, input, actor)));
    }),
  );

  server.registerTool(
    "preview_post",
    { title: "Prévisualiser", description: "Contenu final par plateforme (texte composé avec hashtags, titre, médias) tel qu'il serait publié.", inputSchema: { post_id: uuid }, annotations: { readOnlyHint: true } },
    guarded("read", async ({ post_id }: { post_id: string }) => {
      const post = await getPost(post_id);
      if (!post) return fail("NOT_FOUND", "Publication introuvable.");
      const accounts = await listAccounts();
      const previews = await Promise.all(
        post.variants
          .filter((v) => v.enabled)
          .map(async (v) => {
            // Compte fictif pour résoudre le contenu ; la validation réelle se fait par compte (validate_post).
            const sample = accounts.find((a) => a.platform === v.platform);
            if (!sample) return { platform: v.platform, note: "Aucun compte pour cette plateforme : aperçu indisponible." };
            const p = await prepareContent(post, sample);
            return {
              platform: v.platform,
              title: p.content.title,
              caption: p.caption,
              caption_length: p.caption.length,
              media: p.media.map((m) => ({ media_id: m.id, kind: m.kind, mime_type: m.mimeType, width: m.width, height: m.height, duration_ms: m.durationMs })),
              options: p.content.options,
            };
          }),
      );
      return ok({ ...postSummary(post), previews });
    }),
  );

  server.registerTool(
    "validate_post",
    { title: "Valider", description: "Vérifie le contenu contre les capacités réelles de chaque compte (limites, formats, durées, ratios).", inputSchema: { post_id: uuid, account_ids: z.array(uuid).min(1).max(20) }, annotations: { readOnlyHint: true } },
    guarded("read", async ({ post_id, account_ids }: { post_id: string; account_ids: string[] }) => {
      const results = await validatePostForAccounts(post_id, account_ids);
      return ok({ valid: results.every((r) => r.issues.length === 0), results: results.map((r) => ({ account_id: r.accountId, platform: r.platform, valid: r.issues.length === 0, issues: r.issues, caption_length: r.caption.length })) });
    }),
  );

  const authorizationFields = {
    post_id: uuid,
    account_ids: z.array(uuid).min(1).max(20),
    expected_version: z.number().int().positive().describe("Version du contenu relue et approuvée par l'utilisateur."),
  };

  async function authorize(postId: string, accountIds: string[], expectedVersion: number, when: Parameters<typeof schedulePost>[2]) {
    const outcome = await schedulePost(postId, accountIds, when, actor, { expectedVersion });
    if (!outcome.ok) {
      const time = outcome.time && !outcome.time.ok ? outcome.time : undefined;
      return fail(outcome.code, outcome.message, outcome.issues ?? time);
    }
    return ok({ post_id: postId, scheduled_at: outcome.scheduledAt.toISOString(), destinations: await destinationsOf(postId), next: "Suivre avec get_publication_status." });
  }

  server.registerTool(
    "schedule_post",
    {
      title: "Programmer",
      description:
        "Programme la publication (autorisation explicite pour cette version, ces comptes et cette date). Le worker publie sans que Claude Code reste ouvert, si l'ordinateur et Docker sont actifs. Heure ambiguë (changement d'heure) : préciser `disambiguation`.",
      inputSchema: {
        ...authorizationFields,
        local_datetime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).describe("AAAA-MM-JJTHH:mm, heure locale."),
        timezone: z.string().optional().describe("Fuseau IANA ; défaut : celui de la publication."),
        disambiguation: z.enum(["earlier", "later"]).optional(),
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    guarded("publish", async (args: { post_id: string; account_ids: string[]; expected_version: number; local_datetime: string; timezone?: string; disambiguation?: "earlier" | "later" }) => {
      const post = await getPost(args.post_id);
      if (!post) return fail("NOT_FOUND", "Publication introuvable.");
      return authorize(post.id, args.account_ids, args.expected_version, { mode: "at", local: args.local_datetime, timezone: args.timezone ?? post.timezone, disambiguation: args.disambiguation });
    }),
  );

  server.registerTool(
    "publish_now",
    {
      title: "Publier maintenant",
      description: "Autorise et demande la publication immédiate (envoi par le worker dans les secondes qui suivent). Renvoie les destinations à suivre avec get_publication_status.",
      inputSchema: authorizationFields,
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    guarded("publish", async (args: { post_id: string; account_ids: string[]; expected_version: number }) => authorize(args.post_id, args.account_ids, args.expected_version, { mode: "now" })),
  );

  server.registerTool(
    "list_scheduled_posts",
    {
      title: "Publications programmées",
      description: "Publications programmées, en cours ou demandant une décision, avec l'état de chaque destination.",
      inputSchema: { from: z.iso.datetime().optional(), to: z.iso.datetime().optional() },
      annotations: { readOnlyHint: true },
    },
    guarded("read", async ({ from, to }: { from?: string; to?: string }) => {
      const posts = await prisma.post.findMany({
        where: {
          status: { in: ["SCHEDULED", "PUBLISHING", "NEEDS_ATTENTION"] },
          ...(from || to ? { scheduledAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } } : {}),
        },
        orderBy: { scheduledAt: "asc" },
        take: 100,
      });
      return ok({ posts: await Promise.all(posts.map(async (p) => ({ post_id: p.id, title: p.title, status: p.status, version: p.version, scheduled_at: p.scheduledAt?.toISOString() ?? null, destinations: await destinationsOf(p.id) }))) });
    }),
  );

  server.registerTool(
    "cancel_scheduled_post",
    {
      title: "Annuler une programmation",
      description: "Annule les envois pas encore commencés. Si rien n'est parti, la publication redevient un brouillon modifiable ; les destinations déjà publiées restent publiées.",
      inputSchema: { post_id: uuid },
      annotations: { destructiveHint: true },
    },
    guarded("publish", async ({ post_id }: { post_id: string }) => {
      if (!(await getPost(post_id))) return fail("NOT_FOUND", "Publication introuvable.");
      const result = await cancelSchedule(post_id, actor);
      return ok({ post_id, cancelled: result.cancelled, back_to_draft: result.backToDraft, destinations: await destinationsOf(post_id) });
    }),
  );

  server.registerTool(
    "get_publication_status",
    { title: "État d'une publication", description: "État global et état de chaque destination (publiée, échec, incertaine, manquée…), avec erreurs et liens.", inputSchema: { post_id: uuid }, annotations: { readOnlyHint: true } },
    guarded("read", async ({ post_id }: { post_id: string }) => {
      const post = await getPost(post_id);
      if (!post) return fail("NOT_FOUND", "Publication introuvable.");
      return ok({ ...postSummary(post), destinations: await destinationsOf(post_id) });
    }),
  );

  return server;
}
