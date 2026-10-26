import type { ConnectedAccount } from "@app/db";
import { hasEncryptionKey } from "../crypto";
import { OAuthFlowError, readCredentials } from "./credentials";
import { ConnectorError, type Capabilities, type Connector, type OAuthAccount, type PublishContext, type PublishResult } from "./types";

/**
 * Connecteur Facebook — publication sur une Page (l'API ne permet pas de publier sur un profil).
 * Graph API v26.0 : /{page}/feed, /{page}/photos (non publiées puis attached_media), vidéos par upload
 * reprenable puis /{page}/videos. Programmation native (10 min à 30 jours).
 * Documentation vérifiée le 2026-10-26 (docs/integrations.md).
 */

const SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];

function env() {
  const version = process.env.FACEBOOK_API_VERSION ?? "v26.0";
  return {
    appId: process.env.FACEBOOK_APP_ID ?? "",
    appSecret: process.env.FACEBOOK_APP_SECRET ?? "",
    version,
    dialogUrl: process.env.FACEBOOK_DIALOG_URL ?? `https://www.facebook.com/${version}/dialog/oauth`,
    graphUrl: process.env.FACEBOOK_GRAPH_URL ?? "https://graph.facebook.com",
    videoUrl: process.env.FACEBOOK_GRAPH_VIDEO_URL ?? "https://graph-video.facebook.com",
  };
}

/** Jeton de Page (sans expiration) pour publier ; jeton utilisateur (≈ 60 jours) pour l'upload vidéo. */
type Credentials = { pageToken: string; userToken: string; userTokenExpiresAt: number };

// Réponses JSON de l'API Graph, lues champ par champ.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function mapError(res: Response): Promise<ConnectorError> {
  let code = 0;
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: number } };
    code = body.error?.code ?? 0;
    message = body.error?.message ?? message;
  } catch {
    // Corps non JSON.
  }
  if (code === 190 || res.status === 401) return new ConnectorError("auth", "TOKEN_INVALID", "Autorisation Facebook expirée ou révoquée : reconnecte la Page.");
  if (code === 10 || (code >= 200 && code < 300)) return new ConnectorError("permission", `PERMISSION_${code}`, `Permission Facebook manquante : ${message}`);
  if ([4, 17, 32, 368, 613].includes(code) || res.status === 429) return new ConnectorError("retryable", "RATE_LIMITED", `Limite Facebook atteinte : ${message}`, 60 * 60_000);
  if (code === 506) return new ConnectorError("fatal", "DUPLICATE_POST", "Facebook refuse une publication identique à une publication récente.");
  if ([1, 2].includes(code) || res.status >= 500) return new ConnectorError("retryable", `GRAPH_${code || res.status}`, `Erreur temporaire de Facebook : ${message}`);
  return new ConnectorError("fatal", `GRAPH_${code || res.status}`, `Facebook a refusé la requête : ${message}`);
}

async function call(url: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(url, init);
  if (!res.ok) throw await mapError(res);
  return (await res.json()) as Json;
}

const graph = (path: string) => `${env().graphUrl}/${env().version}/${path}`;
const creds = (account: ConnectedAccount) => readCredentials<Credentials>(account);

/** Champs texte (urlencoded : le texte est transmis tel quel) avec le jeton de Page, jamais dans l'URL. */
function fields(account: ConnectedAccount, values: Record<string, string>): URLSearchParams {
  return new URLSearchParams({ ...values, access_token: creds(account).pageToken });
}

/** Envoi d'un fichier (multipart) avec le jeton de Page. */
function multipart(account: ConnectedAccount, values: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  data.set("access_token", creds(account).pageToken);
  return data;
}

const sameText = (a: string | undefined, b: string) => a?.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");

/** Programmation native possible et souhaitée ? (doc : entre 10 min et 30 jours.) */
function nativeWindow(options: Record<string, unknown>, scheduledAt: Date, now: Date): boolean {
  const lead = scheduledAt.getTime() - now.getTime();
  return options.nativeScheduling !== false && lead > 15 * 60_000 && lead < 29 * 86_400_000;
}

async function readAll(stream: AsyncIterable<unknown>): Promise<Uint8Array<ArrayBuffer>> {
  const parts: Buffer[] = [];
  for await (const c of stream) parts.push(c as Buffer);
  return new Uint8Array(Buffer.concat(parts));
}

/** Photos téléversées sans être publiées (rattachées ensuite au post). Reprise photo par photo. */
async function uploadPhotos(ctx: PublishContext, scheduled: boolean): Promise<string[]> {
  const ids: string[] = Array.isArray(ctx.state.photoIds) ? [...(ctx.state.photoIds as string[])] : [];
  for (const m of ctx.media.slice(ids.length)) {
    const blob = new Blob([await readAll(await m.open())], { type: m.asset.mimeType });
    const values: Record<string, string | Blob> = { published: "false", source: blob };
    if (scheduled) values.temporary = "true";
    const res = await call(graph(`${ctx.account.externalId}/photos`), { method: "POST", body: multipart(ctx.account, values) });
    ids.push(String(res.id));
    await ctx.saveState({ photoIds: ids });
  }
  return ids;
}

/** Vidéo : session d'upload reprenable (jeton utilisateur), puis publication sur la Page. */
async function uploadVideo(ctx: PublishContext): Promise<string> {
  if (typeof ctx.state.videoHandle === "string") return ctx.state.videoHandle;
  const c = creds(ctx.account);
  if (c.userTokenExpiresAt <= Date.now()) throw new ConnectorError("auth", "USER_TOKEN_EXPIRED", "Autorisation Facebook expirée (60 jours) pour l'envoi de vidéos : reconnecte la Page.");
  const media = ctx.media[0]!;
  const size = Number(media.asset.sizeBytes);
  let session = typeof ctx.state.uploadSession === "string" ? ctx.state.uploadSession : null;
  if (!session) {
    const params = new URLSearchParams({ file_name: media.asset.originalName, file_length: String(size), file_type: media.asset.mimeType, access_token: c.userToken });
    session = String((await call(`${graph(`${env().appId}/uploads`)}?${params}`, { method: "POST" })).id);
    await ctx.saveState({ uploadSession: session });
  }
  const auth = { Authorization: `OAuth ${c.userToken}` };
  const offset = Number((await call(graph(session), { headers: auth })).file_offset ?? 0);
  const body = await readAll(await media.open(offset > 0 ? { start: offset, end: size - 1 } : undefined));
  const res = await call(graph(session), { method: "POST", headers: { ...auth, file_offset: String(offset) }, body });
  const handle = String(res.h);
  await ctx.saveState({ videoHandle: handle });
  return handle;
}

const postUrl = (id: string) => `https://www.facebook.com/${id}`;

async function publish(ctx: PublishContext): Promise<PublishResult> {
  if (typeof ctx.state.postId === "string") return statusOf(ctx, ctx.state.postId);
  const now = new Date();
  const scheduled = nativeWindow(ctx.content.options, ctx.scheduledAt, now);
  const schedule: Record<string, string> = scheduled ? { published: "false", scheduled_publish_time: String(Math.floor(ctx.scheduledAt.getTime() / 1000)) } : {};
  const pageId = ctx.account.externalId;
  const video = ctx.media.find((m) => m.asset.kind === "VIDEO");

  let postId: string;
  if (video) {
    const handle = await uploadVideo(ctx);
    await ctx.saveState({ postRequested: true, requestedAt: now.toISOString() });
    const res = await call(`${env().videoUrl}/${env().version}/${pageId}/videos`, {
      method: "POST",
      body: fields(ctx.account, { title: ctx.content.title, description: ctx.caption, fbuploader_video_file_chunk: handle, ...schedule }),
    });
    postId = String(res.id);
  } else {
    const photoIds = await uploadPhotos(ctx, scheduled);
    const values: Record<string, string> = { message: ctx.caption, ...schedule };
    if (scheduled) values.unpublished_content_type = "SCHEDULED";
    photoIds.forEach((id, i) => (values[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    await ctx.saveState({ postRequested: true, requestedAt: now.toISOString() });
    postId = String((await call(graph(`${pageId}/feed`), { method: "POST", body: fields(ctx.account, values) })).id);
  }
  await ctx.saveState({ postId });
  return scheduled ? { status: "scheduled", remoteId: postId, url: postUrl(postId), publishAt: ctx.scheduledAt } : { status: "published", remoteId: postId, url: postUrl(postId) };
}

/** Après l'heure prévue d'une publication programmée : vérifie qu'elle est bien en ligne. */
async function statusOf(ctx: PublishContext, postId: string): Promise<PublishResult> {
  const params = new URLSearchParams({ fields: "is_published", access_token: creds(ctx.account).pageToken });
  const res = await fetch(`${graph(postId)}?${params}`);
  if (!res.ok) {
    const err = await mapError(res);
    // Champ absent pour certains objets (vidéos) : la création réussie fait foi.
    if (err.code === "GRAPH_100") return { status: "published", remoteId: postId, url: postUrl(postId) };
    throw err;
  }
  const body = (await res.json()) as { is_published?: boolean };
  if (body.is_published === false) {
    if (Date.now() < ctx.scheduledAt.getTime()) return { status: "scheduled", remoteId: postId, url: postUrl(postId), publishAt: ctx.scheduledAt };
    return { status: "processing", remoteId: postId, pollAfterMs: 5 * 60_000 };
  }
  return { status: "published", remoteId: postId, url: postUrl(postId) };
}

export const facebookConnector: Connector = {
  id: "facebook",
  platform: "FACEBOOK",
  label: "Facebook",
  isConfigured: () => Boolean(env().appId && env().appSecret && hasEncryptionKey()),

  capabilities(): Capabilities {
    return {
      contentTypes: ["TEXT", "IMAGE", "VIDEO", "CAROUSEL"],
      immediatePublish: true,
      nativeScheduling: true,
      statusTracking: true,
      cancellation: true,
      reconciliation: true,
      permissions: SCOPES,
      limits: {
        textMax: 63_206,
        mediaMin: 0,
        mediaMax: 10,
        mimeTypes: ["image/jpeg", "image/png", "video/mp4"],
        imageMaxBytes: 4 * 1024 ** 2,
      },
      notes: [
        "Publication sur une Page Facebook uniquement (l'API ne permet pas de publier sur un profil personnel).",
        "Programmation native de 10 min à 30 jours : Facebook publie à l'heure prévue, même ordinateur éteint.",
        "Photos : JPEG ou PNG, 4 Mo maximum chacune ; vidéo : MP4, seule.",
        "Envoi de vidéos : autorisation utilisateur d'environ 60 jours, puis reconnexion.",
      ],
    };
  },

  validateMedia(media) {
    return media.some((m) => m.kind === "VIDEO") && media.length > 1 ? [{ field: "media", message: "Facebook : une vidéo seule, ou des photos (pas de mélange)." }] : [];
  },

  usesNativeScheduling: (options, scheduledAt, now) => nativeWindow(options, scheduledAt, now),

  publish,
  getStatus: (ctx) => statusOf(ctx, ctx.remoteId),

  async reconcile(ctx) {
    if (typeof ctx.state.postId === "string") return { found: true, remoteId: ctx.state.postId, url: postUrl(ctx.state.postId) };
    if (ctx.state.postRequested !== true) return { found: false };
    if (ctx.media.some((m) => m.asset.kind === "VIDEO") || nativeWindow(ctx.content.options, ctx.scheduledAt, new Date(String(ctx.state.requestedAt)))) {
      return { found: "unknown", reason: "Facebook ne permet pas de retrouver de façon sûre une vidéo ou une publication programmée dont la réponse s'est perdue." };
    }
    // Publication immédiate : recherche d'un post identique créé depuis la demande.
    const params = new URLSearchParams({ fields: "id,message,created_time", limit: "25", access_token: creds(ctx.account).pageToken });
    const feed = await call(`${graph(`${ctx.account.externalId}/feed`)}?${params}`);
    const since = new Date(String(ctx.state.requestedAt)).getTime() - 60_000;
    const match = (feed.data as { id: string; message?: string; created_time: string }[] | undefined)?.find(
      (p) => sameText(p.message, ctx.caption) && new Date(p.created_time).getTime() >= since,
    );
    return match ? { found: true, remoteId: match.id, url: postUrl(match.id) } : { found: false };
  },

  async cancel(ctx) {
    // Une publication programmée n'est pas encore visible : la supprimer annule la programmation.
    const params = new URLSearchParams({ access_token: creds(ctx.account).pageToken });
    await call(`${graph(ctx.remoteId)}?${params}`, { method: "DELETE" });
  },

  oauth: {
    authorizationUrl({ state, redirectUri }) {
      const url = new URL(env().dialogUrl);
      url.search = new URLSearchParams({ client_id: env().appId, redirect_uri: redirectUri, state, response_type: "code", scope: SCOPES.join(",") }).toString();
      return url.toString();
    },

    async exchange({ code, redirectUri }): Promise<OAuthAccount> {
      const { appId, appSecret } = env();
      const short = await fetch(`${graph("oauth/access_token")}?${new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })}`);
      if (!short.ok) throw new OAuthFlowError(`Échange du code refusé par Facebook : ${(await mapError(short)).message}`);
      const shortToken = ((await short.json()) as { access_token: string }).access_token;

      const long = await fetch(`${graph("oauth/access_token")}?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken })}`);
      if (!long.ok) throw new OAuthFlowError(`Jeton longue durée refusé : ${(await mapError(long)).message}`);
      const user = (await long.json()) as { access_token: string; expires_in?: number };
      const userTokenExpiresAt = Date.now() + (user.expires_in ?? 60 * 86_400) * 1000;

      const perms = await fetch(`${graph("me/permissions")}?${new URLSearchParams({ access_token: user.access_token })}`);
      const granted = perms.ok ? ((await perms.json()) as { data: { permission: string; status: string }[] }).data.filter((p) => p.status === "granted").map((p) => p.permission) : [];
      const missing = SCOPES.filter((s) => !granted.includes(s));

      // Jetons de Page obtenus avec un jeton utilisateur longue durée : sans date d'expiration.
      const pagesRes = await fetch(`${graph("me/accounts")}?${new URLSearchParams({ fields: "id,name,access_token,tasks", access_token: user.access_token })}`);
      if (!pagesRes.ok) throw new OAuthFlowError(`Lecture des Pages impossible : ${(await mapError(pagesRes)).message}`);
      const pages = ((await pagesRes.json()) as { data: { id: string; name: string; access_token: string; tasks?: string[] }[] }).data;
      if (pages.length === 0) throw new OAuthFlowError("Aucune Page Facebook accessible : vérifie que tu gères une Page et que tu l'as autorisée.");

      const accounts = pages.map((p): Omit<OAuthAccount, "additionalAccounts"> => {
        const canPost = (p.tasks ?? []).includes("CREATE_CONTENT");
        const problem = missing.length > 0 ? `Autorisations non accordées : ${missing.join(", ")}` : canPost ? undefined : "Ton rôle sur cette Page ne permet pas de publier (tâche CREATE_CONTENT).";
        return {
          externalId: p.id,
          displayName: p.name,
          credentials: { pageToken: p.access_token, userToken: user.access_token, userTokenExpiresAt } satisfies Credentials,
          grantedScopes: granted,
          metadata: { tasks: p.tasks ?? [] },
          status: problem ? "PERMISSION_MISSING" : "READY",
          statusDetail: problem,
        };
      });
      return { ...accounts[0]!, additionalAccounts: accounts.slice(1) };
    },
  },
};
