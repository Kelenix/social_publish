import type { ConnectedAccount } from "@app/db";
import { encryptJson, hasEncryptionKey } from "../crypto";
import { publicMediaProblem, signedMediaUrl } from "../media/public-url";
import { OAuthFlowError, readCredentials, saveCredentials } from "./credentials";
import { ConnectorError, type Capabilities, type Connector, type OAuthAccount, type PublishContext, type PublishResult } from "./types";

/**
 * Connecteur Instagram — « Instagram API with Instagram Login » (graph.instagram.com), compte
 * professionnel. Documentation vérifiée le 2026-10-26 (docs/integrations.md).
 * Publication en deux temps : conteneur (média téléchargé par Instagram via URL HTTPS signée)
 * puis media_publish. Un conteneur ne peut être publié qu'une fois : pas de doublon possible.
 */

const SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

function env() {
  const version = process.env.INSTAGRAM_API_VERSION ?? "v26.0";
  return {
    appId: process.env.INSTAGRAM_APP_ID ?? "",
    appSecret: process.env.INSTAGRAM_APP_SECRET ?? "",
    authorizeUrl: process.env.INSTAGRAM_AUTHORIZE_URL ?? "https://www.instagram.com/oauth/authorize",
    tokenUrl: process.env.INSTAGRAM_TOKEN_URL ?? "https://api.instagram.com/oauth/access_token",
    graphUrl: process.env.INSTAGRAM_GRAPH_URL ?? "https://graph.instagram.com",
    version,
  };
}

type Credentials = { accessToken: string; expiresAt: number; obtainedAt: number };

/** Erreur Graph API → erreur de connecteur. */
async function mapError(res: Response): Promise<ConnectorError> {
  let code = 0;
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: number; error_subcode?: number } };
    code = body.error?.code ?? 0;
    message = body.error?.message ?? message;
  } catch {
    // Corps non JSON.
  }
  if (code === 190 || res.status === 401) return new ConnectorError("auth", "TOKEN_INVALID", "Autorisation Instagram expirée ou révoquée : reconnecte le compte.");
  if (code === 10 || (code >= 200 && code < 300)) return new ConnectorError("permission", `PERMISSION_${code}`, `Permission Instagram manquante : ${message}`);
  if ([4, 17, 32, 613].includes(code) || res.status === 429) return new ConnectorError("retryable", "RATE_LIMITED", `Limite Instagram atteinte : ${message}`, 60 * 60_000);
  if ([1, 2].includes(code) || res.status >= 500) return new ConnectorError("retryable", `GRAPH_${code || res.status}`, `Erreur temporaire d'Instagram : ${message}`);
  return new ConnectorError("fatal", `GRAPH_${code || res.status}`, `Instagram a refusé la requête : ${message}`);
}

/** Jeton longue durée (60 jours), rafraîchi quand il lui reste moins de 7 jours (et qu'il a plus de 24 h). */
async function accessToken(account: ConnectedAccount): Promise<string> {
  const creds = readCredentials<Credentials>(account);
  const now = Date.now();
  if (creds.expiresAt <= now) throw new ConnectorError("auth", "TOKEN_EXPIRED", "Autorisation Instagram expirée (60 jours) : reconnecte le compte.");
  if (creds.expiresAt - now > 7 * 86_400_000 || now - creds.obtainedAt < 86_400_000) return creds.accessToken;
  const url = new URL(`${env().graphUrl}/refresh_access_token`);
  url.search = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: creds.accessToken }).toString();
  const res = await fetch(url);
  if (!res.ok) return creds.accessToken; // Le jeton actuel reste valide ; nouvel essai au prochain appel.
  const body = (await res.json()) as { access_token: string; expires_in: number };
  const next: Credentials = { accessToken: body.access_token, expiresAt: now + body.expires_in * 1000, obtainedAt: now };
  await saveCredentials(account.id, next);
  account.credentials = encryptJson(next);
  return next.accessToken;
}

async function graph(account: ConnectedAccount, method: "GET" | "POST", path: string, params: Record<string, string> = {}) {
  const url = new URL(`${env().graphUrl}/${env().version}/${path}`);
  const form = new URLSearchParams({ ...params, access_token: await accessToken(account) });
  const res = method === "GET" ? await fetch(`${url}?${form}`) : await fetch(url, { method, body: form });
  if (!res.ok) throw await mapError(res);
  return (await res.json()) as Record<string, unknown>;
}

const MEDIA_URL_TTL_MS = 2 * 3_600_000;

/** Crée les conteneurs (enfants d'abord pour un carrousel) ; identifiants conservés pour la reprise. */
async function createContainer(ctx: PublishContext): Promise<string> {
  if (typeof ctx.state.containerId === "string") return ctx.state.containerId;
  const igId = ctx.account.externalId;
  const shareToFeed = ctx.content.options.shareToFeed !== false;
  const urlFor = (id: string) => signedMediaUrl(id, MEDIA_URL_TTL_MS);
  let params: Record<string, string>;

  if (ctx.media.length === 1) {
    const m = ctx.media[0]!.asset;
    params =
      m.kind === "IMAGE"
        ? { image_url: urlFor(m.id), caption: ctx.caption }
        : { media_type: "REELS", video_url: urlFor(m.id), caption: ctx.caption, share_to_feed: String(shareToFeed) };
  } else {
    const children: string[] = Array.isArray(ctx.state.children) ? (ctx.state.children as string[]) : [];
    for (const m of ctx.media.slice(children.length)) {
      const child = await graph(ctx.account, "POST", `${igId}/media`, m.asset.kind === "IMAGE" ? { image_url: urlFor(m.asset.id), is_carousel_item: "true" } : { media_type: "VIDEO", video_url: urlFor(m.asset.id), is_carousel_item: "true" });
      children.push(String(child.id));
      await ctx.saveState({ children });
    }
    params = { media_type: "CAROUSEL", children: children.join(","), caption: ctx.caption };
  }
  const container = await graph(ctx.account, "POST", `${igId}/media`, params);
  await ctx.saveState({ containerId: String(container.id) });
  return String(container.id);
}

async function containerStatus(ctx: PublishContext, id: string): Promise<string> {
  return String((await graph(ctx.account, "GET", id, { fields: "status_code" })).status_code ?? "");
}

/** Publie un conteneur prêt ; le permalien est récupéré quand c'est possible. */
async function publishContainer(ctx: PublishContext, containerId: string): Promise<PublishResult> {
  await ctx.saveState({ publishRequested: true });
  const published = await graph(ctx.account, "POST", `${ctx.account.externalId}/media_publish`, { creation_id: containerId });
  const mediaId = String(published.id);
  await ctx.saveState({ mediaId });
  const permalink = await graph(ctx.account, "GET", mediaId, { fields: "permalink" }).then((r) => r.permalink as string | undefined).catch(() => undefined);
  return { status: "published", remoteId: mediaId, url: permalink };
}

async function advance(ctx: PublishContext): Promise<PublishResult> {
  if (typeof ctx.state.mediaId === "string") return { status: "published", remoteId: ctx.state.mediaId };
  const containerId = await createContainer(ctx);
  const status = await containerStatus(ctx, containerId);
  switch (status) {
    case "FINISHED":
      return publishContainer(ctx, containerId);
    case "PUBLISHED":
      return { status: "published", remoteId: containerId };
    case "IN_PROGRESS":
    case "":
      return { status: "processing", remoteId: containerId, pollAfterMs: 60_000 };
    case "EXPIRED":
      // Conteneur non publié dans les 24 h : on en recréera un à la prochaine tentative.
      await ctx.saveState({ containerId: null, children: [] });
      throw new ConnectorError("retryable", "CONTAINER_EXPIRED", "Conteneur Instagram expiré : nouvelle préparation.");
    default:
      throw new ConnectorError("fatal", "CONTAINER_ERROR", "Instagram n'a pas pu traiter le média (format, codec ou URL inaccessible).");
  }
}

export const instagramConnector: Connector = {
  id: "instagram",
  platform: "INSTAGRAM",
  label: "Instagram",
  isConfigured: () => Boolean(env().appId && env().appSecret && hasEncryptionKey() && !publicMediaProblem()),

  capabilities(): Capabilities {
    return {
      contentTypes: ["IMAGE", "VIDEO", "CAROUSEL"],
      immediatePublish: true,
      nativeScheduling: false,
      statusTracking: true,
      cancellation: false,
      reconciliation: true,
      permissions: SCOPES,
      limits: {
        textMax: 2200,
        hashtagsMax: 30,
        mediaMin: 1,
        mediaMax: 20,
        mimeTypes: ["image/jpeg", "video/mp4", "video/quicktime"],
        imageMaxBytes: 8 * 1024 ** 2,
        videoMaxBytes: 300 * 1024 ** 2,
        videoMinDurationMs: 3_000,
        videoMaxDurationMs: 15 * 60_000,
        imageAspectRatio: { min: 0.8, max: 1.91 },
        aspectRatio: { min: 0.01, max: 10 },
      },
      notes: [
        "Compte Instagram professionnel requis.",
        "Images : JPEG uniquement (convertis tes PNG/WebP avant import), ratio 4:5 à 1.91:1. Vidéo seule = Reel.",
        "Instagram télécharge les médias via une URL HTTPS publique temporaire (PUBLIC_BASE_URL).",
        "Limite documentée : 100 publications par 24 h glissantes (50 selon une autre section de la doc).",
        "Autorisation valable 60 jours, prolongée automatiquement tant que le Studio l'utilise.",
      ],
    };
  },

  publish: (ctx) => advance(ctx),
  getStatus: (ctx) => advance(ctx),

  async reconcile(ctx) {
    if (typeof ctx.state.mediaId === "string") return { found: true, remoteId: ctx.state.mediaId };
    if (typeof ctx.state.containerId !== "string") return { found: false };
    // Un conteneur publié passe à PUBLISHED ; sinon, le republier est sans risque (usage unique).
    const status = await containerStatus(ctx, ctx.state.containerId);
    return status === "PUBLISHED" ? { found: true, remoteId: ctx.state.containerId } : { found: false };
  },

  oauth: {
    authorizationUrl({ state, redirectUri }) {
      const url = new URL(env().authorizeUrl);
      url.search = new URLSearchParams({ client_id: env().appId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(","), state }).toString();
      return url.toString();
    },

    async exchange({ code, redirectUri }): Promise<OAuthAccount> {
      const { appId, appSecret, tokenUrl, graphUrl, version } = env();
      const res = await fetch(tokenUrl, {
        method: "POST",
        body: new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
      });
      if (!res.ok) throw new OAuthFlowError(`Échange du code refusé par Instagram : ${(await mapError(res)).message}`);
      const raw = (await res.json()) as { data?: { access_token: string; permissions?: string }[]; access_token?: string; permissions?: string | string[] };
      const short = raw.data?.[0] ?? raw;
      if (!short.access_token) throw new OAuthFlowError("Instagram n'a pas fourni de jeton.");

      const longUrl = new URL(`${graphUrl}/access_token`);
      longUrl.search = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret, access_token: short.access_token }).toString();
      const longRes = await fetch(longUrl);
      if (!longRes.ok) throw new OAuthFlowError(`Jeton longue durée refusé : ${(await mapError(longRes)).message}`);
      const long = (await longRes.json()) as { access_token: string; expires_in: number };

      const meUrl = new URL(`${graphUrl}/${version}/me`);
      meUrl.search = new URLSearchParams({ fields: "user_id,username,account_type", access_token: long.access_token }).toString();
      const meRes = await fetch(meUrl);
      if (!meRes.ok) throw new OAuthFlowError(`Lecture du compte impossible : ${(await mapError(meRes)).message}`);
      const me = (await meRes.json()) as { user_id?: string; id?: string; username?: string; account_type?: string };

      const permissions = Array.isArray(short.permissions) ? short.permissions : String(short.permissions ?? "").split(",").filter(Boolean);
      const missing = SCOPES.filter((s) => !permissions.includes(s));
      return {
        externalId: String(me.user_id ?? me.id),
        displayName: me.username ? `@${me.username}` : String(me.user_id ?? me.id),
        credentials: { accessToken: long.access_token, expiresAt: Date.now() + long.expires_in * 1000, obtainedAt: Date.now() },
        grantedScopes: permissions,
        metadata: { accountType: me.account_type ?? "unknown" },
        status: missing.length === 0 ? "READY" : "PERMISSION_MISSING",
        statusDetail: missing.length === 0 ? undefined : `Autorisations non accordées : ${missing.join(", ")}`,
      };
    },
  },
};
