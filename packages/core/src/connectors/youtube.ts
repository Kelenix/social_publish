import { Readable } from "node:stream";
import type { ConnectedAccount } from "@app/db";
import { encryptJson, hasEncryptionKey } from "../crypto";
import { zonedToUtc } from "../time";
import { OAuthFlowError, readCredentials, saveCredentials } from "./credentials";
import { ConnectorError, type Capabilities, type Connector, type OAuthAccount, type PublishContext, type PublishResult } from "./types";

/**
 * Connecteur YouTube Data API v3 (documentation vérifiée le 2026-10-26, voir docs/integrations.md).
 * Upload reprenable, suivi du traitement, programmation native (publishAt), annulation.
 */

const SCOPE_UPLOAD = "https://www.googleapis.com/auth/youtube.upload";
/** Lecture de la chaîne et du statut des vidéos, et modification (annulation d'une programmation native). */
const SCOPE_MANAGE = "https://www.googleapis.com/auth/youtube.force-ssl";
export const YOUTUBE_SCOPES = [SCOPE_UPLOAD, SCOPE_MANAGE];

/** URLs surchargeables uniquement pour les tests de contrat (faux serveur Google). */
function env() {
  return {
    clientId: process.env.YOUTUBE_CLIENT_ID ?? "",
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
    authorizeUrl: process.env.GOOGLE_OAUTH_AUTHORIZE_URL ?? "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: process.env.GOOGLE_OAUTH_TOKEN_URL ?? "https://oauth2.googleapis.com/token",
    apiUrl: process.env.YOUTUBE_API_URL ?? "https://www.googleapis.com/youtube/v3",
    uploadUrl: process.env.YOUTUBE_UPLOAD_URL ?? "https://www.googleapis.com/upload/youtube/v3/videos",
  };
}

type Credentials = { accessToken: string; refreshToken: string; expiresAt: number };
type YouTubeOptions = {
  privacyStatus: "private" | "unlisted" | "public";
  madeForKids?: boolean;
  containsSyntheticMedia: boolean;
  categoryId: string;
  nativeScheduling: boolean;
};

function readOptions(raw: Record<string, unknown>): YouTubeOptions {
  const privacy = raw.privacyStatus;
  return {
    // Par défaut privée : aucune publication publique sans choix explicite.
    privacyStatus: privacy === "public" || privacy === "unlisted" ? privacy : "private",
    madeForKids: typeof raw.madeForKids === "boolean" ? raw.madeForKids : undefined,
    containsSyntheticMedia: raw.containsSyntheticMedia === true,
    categoryId: typeof raw.categoryId === "string" && /^\d+$/.test(raw.categoryId) ? raw.categoryId : "22",
    nativeScheduling: raw.nativeScheduling !== false,
  };
}

/** Programmation native seulement pour une vidéo publique prévue à plus de 15 min. */
const NATIVE_LEAD_MS = 15 * 60_000;
const wantsNative = (o: YouTubeOptions, scheduledAt: Date, now: Date) => o.privacyStatus === "public" && o.nativeScheduling && scheduledAt.getTime() - now.getTime() > NATIVE_LEAD_MS;

/** Les quotas YouTube se réinitialisent à minuit, heure du Pacifique. */
function msUntilPacificMidnight(now = new Date()): number {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Los_Angeles" }).format(now);
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const r = zonedToUtc(next.toISOString().slice(0, 16), "America/Los_Angeles", "earlier");
  return Math.max(60_000, (r.ok ? r.utc.getTime() : now.getTime() + 86_400_000) - now.getTime());
}

/** Traduit une réponse d'erreur de l'API en erreur de connecteur exploitable. */
export async function mapError(res: Response): Promise<ConnectorError> {
  let reason = "";
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } | string; error_description?: string };
    if (typeof body.error === "object") {
      reason = body.error.errors?.[0]?.reason ?? "";
      message = body.error.message ?? message;
    } else if (typeof body.error === "string") {
      reason = body.error;
      message = body.error_description ?? body.error;
    }
  } catch {
    // Corps non JSON : message HTTP générique.
  }
  const retryAfter = Number(res.headers.get("retry-after")) * 1000 || undefined;
  if (res.status === 401) return new ConnectorError("auth", "UNAUTHORIZED", "Accès YouTube refusé : reconnecte le compte.");
  if (["quotaExceeded", "uploadLimitExceeded", "dailyLimitExceeded"].includes(reason)) {
    return new ConnectorError("retryable", "QUOTA_EXCEEDED", `Quota YouTube épuisé (${reason}) : nouvel essai après sa réinitialisation (minuit, heure du Pacifique).`, retryAfter ?? msUntilPacificMidnight());
  }
  if (res.status === 429 || ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason)) {
    return new ConnectorError("retryable", "RATE_LIMITED", "Trop de requêtes vers YouTube.", retryAfter ?? 60_000);
  }
  if (res.status === 403 && ["insufficientPermissions", "forbidden", "youtubeSignupRequired"].includes(reason)) {
    return new ConnectorError("permission", reason, `Permission YouTube insuffisante : ${message}`);
  }
  if (res.status >= 500) return new ConnectorError("retryable", `HTTP_${res.status}`, `Erreur temporaire de YouTube (${res.status}).`, retryAfter);
  return new ConnectorError("fatal", reason || `HTTP_${res.status}`, `YouTube a refusé la requête : ${message}`);
}

async function postForm(url: string, form: Record<string, string>) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
}

async function accessToken(account: ConnectedAccount, force = false): Promise<string> {
  const creds = readCredentials<Credentials>(account);
  if (!force && creds.expiresAt - 60_000 > Date.now()) return creds.accessToken;
  const { clientId, clientSecret, tokenUrl } = env();
  const res = await postForm(tokenUrl, { client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: creds.refreshToken });
  if (!res.ok) {
    const error = await mapError(res);
    if (error.code === "invalid_grant") {
      throw new ConnectorError("auth", "INVALID_GRANT", "Autorisation YouTube expirée ou révoquée : reconnecte le compte. (En mode « Testing », Google l'expire après 7 jours.)");
    }
    throw error;
  }
  const body = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  const next: Credentials = { accessToken: body.access_token, refreshToken: body.refresh_token ?? creds.refreshToken, expiresAt: Date.now() + body.expires_in * 1000 };
  await saveCredentials(account.id, next);
  // Le compte en mémoire reflète les nouveaux jetons pour les appels suivants de la même tentative.
  account.credentials = encryptJson(next);
  return next.accessToken;
}

/** Appel authentifié ; un 401 déclenche un unique rafraîchissement du jeton. */
async function api(account: ConnectedAccount, url: string, init: RequestInit = {}): Promise<Response> {
  const call = async (token: string) => fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
  let res = await call(await accessToken(account));
  if (res.status === 401) res = await call(await accessToken(account, true));
  return res;
}

type VideoResource = {
  id: string;
  status?: { uploadStatus?: string; privacyStatus?: string; publishAt?: string; failureReason?: string; rejectionReason?: string };
};

const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** Interroge une session d'upload : vidéo créée, octets déjà reçus, ou session expirée. */
async function queryUpload(account: ConnectedAccount, sessionUrl: string, size: number): Promise<{ done: VideoResource } | { received: number } | { expired: true }> {
  const res = await api(account, sessionUrl, { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${size}` } });
  if (res.status === 200 || res.status === 201) return { done: (await res.json()) as VideoResource };
  if (res.status === 308) {
    const range = /bytes=0-(\d+)/.exec(res.headers.get("range") ?? "");
    return { received: range ? Number(range[1]) + 1 : 0 };
  }
  if (res.status === 404) return { expired: true };
  throw await mapError(res);
}

const MAX_RESUMES = 5;

async function upload(ctx: PublishContext, metadata: object): Promise<VideoResource> {
  const media = ctx.media[0]!;
  const size = Number(media.asset.sizeBytes);
  let sessionUrl = typeof ctx.state.uploadUrl === "string" ? ctx.state.uploadUrl : null;
  let offset = 0;

  // Reprise d'une session existante (tentative précédente interrompue).
  if (sessionUrl) {
    const status = await queryUpload(ctx.account, sessionUrl, size);
    if ("done" in status) return status.done;
    if ("expired" in status) sessionUrl = null;
    else offset = status.received;
  }
  if (!sessionUrl) {
    const { uploadUrl } = env();
    const res = await api(ctx.account, `${uploadUrl}?uploadType=resumable&part=${encodeURIComponent("snippet,status")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(size), "X-Upload-Content-Type": media.asset.mimeType },
      body: JSON.stringify(metadata),
    });
    if (!res.ok) throw await mapError(res);
    sessionUrl = res.headers.get("location");
    if (!sessionUrl) throw new ConnectorError("retryable", "NO_SESSION", "YouTube n'a pas fourni d'URL de session d'upload.");
    // Enregistrée avant tout envoi : permet la reprise et le rapprochement après un arrêt brutal.
    await ctx.saveState({ uploadUrl: sessionUrl, uploadSize: size });
    offset = 0;
  }

  for (let resume = 0; resume <= MAX_RESUMES; resume++) {
    try {
      const stream = await media.open(offset > 0 ? { start: offset, end: size - 1 } : undefined);
      const headers: Record<string, string> = { "Content-Type": media.asset.mimeType, "Content-Length": String(size - offset) };
      if (offset > 0) headers["Content-Range"] = `bytes ${offset}-${size - 1}/${size}`;
      const res = await api(ctx.account, sessionUrl, { method: "PUT", headers, body: Readable.toWeb(stream) as ReadableStream, duplex: "half" } as RequestInit);
      if (res.status === 200 || res.status === 201) return (await res.json()) as VideoResource;
      if (![308, 500, 502, 503, 504].includes(res.status)) throw await mapError(res);
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      // Connexion perdue : on vérifie ce que YouTube a reçu avant de reprendre.
    }
    await new Promise((r) => setTimeout(r, Math.min(30_000, 500 * 2 ** resume)));
    let status;
    try {
      status = await queryUpload(ctx.account, sessionUrl, size);
    } catch (error) {
      if (error instanceof ConnectorError && error.kind !== "retryable") throw error;
      throw new ConnectorError("uncertain", "UPLOAD_STATUS_UNKNOWN", "Upload interrompu et état de la session inconnu : vérification à la prochaine tentative.");
    }
    if ("done" in status) return status.done;
    if ("expired" in status) {
      await ctx.saveState({ uploadUrl: null });
      throw new ConnectorError("retryable", "UPLOAD_SESSION_EXPIRED", "Session d'upload expirée : nouvel envoi complet à la prochaine tentative.");
    }
    offset = status.received;
  }
  throw new ConnectorError("retryable", "UPLOAD_INTERRUPTED", "Upload interrompu à plusieurs reprises : reprise à la prochaine tentative.");
}

/** Statut d'une vidéo envoyée : traitement en cours, programmée, publiée, ou refusée. */
function interpret(video: VideoResource, now = new Date()): PublishResult {
  const st = video.status ?? {};
  if (st.uploadStatus === "failed") throw new ConnectorError("fatal", `UPLOAD_FAILED_${st.failureReason ?? "unknown"}`, `Échec du traitement YouTube (${st.failureReason ?? "raison inconnue"}).`);
  if (st.uploadStatus === "rejected") throw new ConnectorError("fatal", `REJECTED_${st.rejectionReason ?? "unknown"}`, `Vidéo refusée par YouTube (${st.rejectionReason ?? "raison inconnue"}).`);
  if (st.uploadStatus === "deleted") throw new ConnectorError("fatal", "VIDEO_DELETED", "La vidéo a été supprimée sur YouTube.");
  if (st.uploadStatus !== "processed") return { status: "processing", remoteId: video.id, pollAfterMs: 30_000 };
  const publishAt = st.publishAt ? new Date(st.publishAt) : null;
  if (publishAt && st.privacyStatus === "private") {
    if (publishAt > now) return { status: "scheduled", remoteId: video.id, url: watchUrl(video.id), publishAt };
    if (now.getTime() - publishAt.getTime() > 86_400_000) {
      throw new ConnectorError("fatal", "STILL_PRIVATE", "La vidéo est restée privée plus de 24 h après l'heure prévue : vérifie-la dans YouTube Studio.");
    }
    return { status: "processing", remoteId: video.id, pollAfterMs: 5 * 60_000 };
  }
  return { status: "published", remoteId: video.id, url: watchUrl(video.id) };
}

async function fetchVideo(ctx: PublishContext, id: string): Promise<VideoResource> {
  const res = await api(ctx.account, `${env().apiUrl}/videos?part=status&id=${encodeURIComponent(id)}`);
  if (!res.ok) throw await mapError(res);
  const video = ((await res.json()) as { items?: VideoResource[] }).items?.[0];
  if (!video) throw new ConnectorError("fatal", "VIDEO_NOT_FOUND", "Vidéo introuvable sur YouTube (supprimée ?).");
  return video;
}

export const youtubeConnector: Connector = {
  id: "youtube",
  platform: "YOUTUBE",
  label: "YouTube",
  isConfigured: () => Boolean(env().clientId && env().clientSecret && hasEncryptionKey()),

  capabilities(account): Capabilities {
    const meta = (account?.metadata ?? {}) as { longUploadsStatus?: string };
    return {
      contentTypes: ["VIDEO"],
      immediatePublish: true,
      nativeScheduling: true,
      statusTracking: true,
      cancellation: true,
      reconciliation: true,
      permissions: YOUTUBE_SCOPES,
      limits: {
        titleRequired: true,
        titleMax: 100,
        descriptionMaxBytes: 5000,
        tagsMaxChars: 500,
        forbiddenChars: ["<", ">"],
        mediaMin: 1,
        mediaMax: 1,
        mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
        videoMaxBytes: 256 * 1024 ** 3,
        // 15 min tant que la chaîne n'est pas autorisée aux vidéos longues (vérification par téléphone).
        videoMaxDurationMs: meta.longUploadsStatus === "allowed" ? 12 * 3_600_000 : 15 * 60_000,
      },
      notes: [
        "Quota par défaut : 100 uploads par jour (« Video Uploads »), réinitialisé à minuit heure du Pacifique.",
        "Les hashtags deviennent des tags YouTube.",
        "Une vidéo verticale courte peut être classée en Short par YouTube (aucun réglage d'API).",
        "Projet Google en mode « Testing » : l'autorisation expire après 7 jours.",
      ],
    };
  },

  validateOptions(raw) {
    const issues: { field: "options"; message: string }[] = [];
    if (typeof raw.madeForKids !== "boolean") issues.push({ field: "options", message: "YouTube : indique si la vidéo est conçue pour les enfants (déclaration obligatoire)." });
    if (raw.privacyStatus !== undefined && !["private", "unlisted", "public"].includes(String(raw.privacyStatus))) {
      issues.push({ field: "options", message: "YouTube : visibilité invalide." });
    }
    return issues;
  },

  usesNativeScheduling: (raw, scheduledAt, now) => wantsNative(readOptions(raw), scheduledAt, now),

  async publish(ctx) {
    if (typeof ctx.state.videoId === "string") return interpret(await fetchVideo(ctx, ctx.state.videoId));
    const o = readOptions(ctx.content.options);
    const native = wantsNative(o, ctx.scheduledAt, new Date());
    const metadata = {
      snippet: { title: ctx.content.title, description: ctx.content.description, tags: ctx.content.hashtags, categoryId: o.categoryId },
      status: {
        privacyStatus: native ? "private" : o.privacyStatus,
        ...(native ? { publishAt: ctx.scheduledAt.toISOString() } : {}),
        selfDeclaredMadeForKids: o.madeForKids === true,
        containsSyntheticMedia: o.containsSyntheticMedia,
      },
    };
    const video = await upload(ctx, metadata);
    await ctx.saveState({ uploadUrl: null, videoId: video.id });
    // Upload terminé ≠ traitement terminé ≠ publication : le suivi continue avec getStatus.
    return { status: "processing", remoteId: video.id, pollAfterMs: 30_000 };
  },

  async getStatus(ctx) {
    return interpret(await fetchVideo(ctx, ctx.remoteId));
  },

  async reconcile(ctx) {
    if (typeof ctx.state.videoId === "string") return { found: true, remoteId: ctx.state.videoId, url: watchUrl(ctx.state.videoId) };
    if (typeof ctx.state.uploadUrl === "string") {
      const status = await queryUpload(ctx.account, ctx.state.uploadUrl, Number(ctx.state.uploadSize ?? ctx.media[0]?.asset.sizeBytes ?? 0));
      if ("done" in status) {
        await ctx.saveState({ uploadUrl: null, videoId: status.done.id });
        return { found: true, remoteId: status.done.id, url: watchUrl(status.done.id) };
      }
    }
    // Aucune vidéo créée : le prochain envoi reprend la session si elle existe encore.
    return { found: false };
  },

  async cancel(ctx) {
    const o = readOptions(ctx.content.options);
    // Repasser en privée sans publishAt annule la publication programmée ; la vidéo est conservée.
    const res = await api(ctx.account, `${env().apiUrl}/videos?part=status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ctx.remoteId, status: { privacyStatus: "private", selfDeclaredMadeForKids: o.madeForKids === true, containsSyntheticMedia: o.containsSyntheticMedia } }),
    });
    if (!res.ok) throw await mapError(res);
  },

  oauth: {
    authorizationUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL(env().authorizeUrl);
      url.search = new URLSearchParams({
        client_id: env().clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: YOUTUBE_SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString();
      return url.toString();
    },

    async exchange({ code, codeVerifier, redirectUri }): Promise<OAuthAccount> {
      const { clientId, clientSecret, tokenUrl, apiUrl } = env();
      const res = await postForm(tokenUrl, { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: codeVerifier });
      if (!res.ok) throw new OAuthFlowError(`Échange du code refusé par Google : ${(await mapError(res)).message}`);
      const token = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
      if (!token.refresh_token) throw new OAuthFlowError("Google n'a pas fourni de jeton de rafraîchissement : retire l'accès de l'application dans ton compte Google puis recommence.");

      const channelRes = await fetch(`${apiUrl}/channels?part=snippet,status&mine=true`, { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!channelRes.ok) throw new OAuthFlowError(`Lecture de la chaîne impossible : ${(await mapError(channelRes)).message}`);
      const channel = ((await channelRes.json()) as { items?: { id: string; snippet?: { title?: string }; status?: { longUploadsStatus?: string } }[] }).items?.[0];
      if (!channel) throw new OAuthFlowError("Ce compte Google n'a pas de chaîne YouTube.");

      const granted = (token.scope ?? "").split(" ").filter(Boolean);
      const missing = YOUTUBE_SCOPES.filter((s) => !granted.includes(s));
      return {
        externalId: channel.id,
        displayName: channel.snippet?.title ?? channel.id,
        credentials: { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 },
        grantedScopes: granted,
        metadata: { longUploadsStatus: channel.status?.longUploadsStatus ?? "unknown" },
        status: missing.length === 0 ? "READY" : "PERMISSION_MISSING",
        statusDetail: missing.length === 0 ? undefined : `Autorisations non accordées : ${missing.join(", ")}`,
      };
    },
  },
};
