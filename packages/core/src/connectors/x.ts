import type { ConnectedAccount } from "@app/db";
import { encryptJson, hasEncryptionKey } from "../crypto";
import { OAuthFlowError, readCredentials, saveCredentials } from "./credentials";
import { ConnectorError, type Capabilities, type Connector, type OAuthAccount, type PublishContext, type PublishResult } from "./types";

/**
 * Connecteur X — API v2 : POST /2/tweets, upload de médias v2 en morceaux, OAuth 2.0 avec PKCE.
 * Accès facturé à l'usage par X : aucun tarif n'est codé ici ; les erreurs de crédits sont remontées.
 * Documentation vérifiée le 2026-10-26 (docs/integrations.md).
 */

const SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
const CHUNK_BYTES = 4 * 1024 ** 2;

function env() {
  return {
    clientId: process.env.X_CLIENT_ID ?? "",
    clientSecret: process.env.X_CLIENT_SECRET ?? "",
    authorizeUrl: process.env.X_AUTHORIZE_URL ?? "https://x.com/i/oauth2/authorize",
    apiUrl: process.env.X_API_URL ?? "https://api.x.com",
  };
}

type Credentials = { accessToken: string; refreshToken: string; expiresAt: number };

async function mapError(res: Response): Promise<ConnectorError> {
  let message = `HTTP ${res.status}`;
  let title = "";
  try {
    const body = (await res.json()) as { title?: string; detail?: string; errors?: { message?: string }[]; error_description?: string };
    title = body.title ?? "";
    message = body.detail ?? body.errors?.[0]?.message ?? body.error_description ?? message;
  } catch {
    // Corps non JSON.
  }
  if (res.status === 401) return new ConnectorError("auth", "UNAUTHORIZED", "Autorisation X expirée ou révoquée : reconnecte le compte.");
  if (res.status === 402 || /credit/i.test(`${title} ${message}`)) {
    return new ConnectorError("fatal", "CREDITS_DEPLETED", `Crédits de l'API X insuffisants : recharge ton compte développeur X, puis relance. (${message})`);
  }
  if (res.status === 429) {
    const reset = Number(res.headers.get("x-rate-limit-reset")) * 1000;
    return new ConnectorError("retryable", "RATE_LIMITED", "Limite de requêtes X atteinte.", reset > Date.now() ? reset - Date.now() + 1_000 : 15 * 60_000);
  }
  if (res.status === 403) {
    // 403 couvre aussi des refus de contenu (ex. vidéo trop longue pour le compte).
    return /not allowed|scope|permission/i.test(message) && !/video/i.test(message)
      ? new ConnectorError("permission", "FORBIDDEN", `Permission X insuffisante : ${message}`)
      : new ConnectorError("fatal", "FORBIDDEN", `X a refusé la publication : ${message}`);
  }
  if (res.status >= 500) return new ConnectorError("retryable", `HTTP_${res.status}`, `Erreur temporaire de X : ${message}`);
  return new ConnectorError("fatal", `HTTP_${res.status}`, `X a refusé la requête : ${message}`);
}

const basicAuth = () => `Basic ${Buffer.from(`${env().clientId}:${env().clientSecret}`).toString("base64")}`;

async function tokenRequest(form: Record<string, string>) {
  return fetch(`${env().apiUrl}/2/oauth2/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...form, client_id: env().clientId }),
  });
}

async function accessToken(account: ConnectedAccount): Promise<string> {
  const creds = readCredentials<Credentials>(account);
  if (creds.expiresAt - 60_000 > Date.now()) return creds.accessToken;
  const res = await tokenRequest({ grant_type: "refresh_token", refresh_token: creds.refreshToken });
  if (!res.ok) throw new ConnectorError("auth", "REFRESH_FAILED", "Renouvellement de l'autorisation X refusé : reconnecte le compte.");
  const body = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  // X renouvelle aussi le jeton de rafraîchissement : l'ancien n'est plus valable.
  const next: Credentials = { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000, refreshToken: body.refresh_token ?? creds.refreshToken };
  await saveCredentials(account.id, next);
  account.credentials = encryptJson(next);
  return next.accessToken;
}

// Réponses JSON de l'API X, lues champ par champ.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function api(account: ConnectedAccount, path: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(`${env().apiUrl}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await accessToken(account)}` } });
  if (!res.ok) throw await mapError(res);
  return res.status === 204 ? {} : ((await res.json()) as Json);
}

type Uploaded = { assetId: string; mediaId: string; ready: boolean };

/** Upload v2 (initialize → append → finalize), un média après l'autre ; reprise média par média. */
async function uploadAll(ctx: PublishContext): Promise<Uploaded[]> {
  const uploaded: Uploaded[] = Array.isArray(ctx.state.media) ? [...(ctx.state.media as Uploaded[])] : [];
  for (const m of ctx.media.slice(uploaded.length)) {
    const size = Number(m.asset.sizeBytes);
    const init = await api(ctx.account, "/2/media/upload/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: m.asset.mimeType, total_bytes: size, media_category: m.asset.kind === "VIDEO" ? "tweet_video" : "tweet_image" }),
    });
    const mediaId = String(init.data.id);
    for (let start = 0, index = 0; start < size; start += CHUNK_BYTES, index++) {
      const buffer = Buffer.concat(await collect(await m.open({ start, end: Math.min(size, start + CHUNK_BYTES) - 1 })));
      const form = new FormData();
      form.set("segment_index", String(index));
      form.set("media", new Blob([buffer]), "chunk");
      await api(ctx.account, `/2/media/upload/${mediaId}/append`, { method: "POST", body: form });
    }
    const fin = await api(ctx.account, `/2/media/upload/${mediaId}/finalize`, { method: "POST" });
    uploaded.push({ assetId: m.asset.id, mediaId, ready: !fin.data?.processing_info });
    await ctx.saveState({ media: uploaded });
  }
  return uploaded;
}

async function collect(stream: AsyncIterable<unknown>): Promise<Buffer[]> {
  const parts: Buffer[] = [];
  for await (const c of stream) parts.push(c as Buffer);
  return parts;
}

const MAX_WAIT_MS = 4 * 60_000;

/** Attend la fin du traitement des vidéos (dans la limite du bail d'exécution). */
async function waitProcessing(ctx: PublishContext, uploaded: Uploaded[]): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  for (const u of uploaded.filter((x) => !x.ready)) {
    for (;;) {
      const status = await api(ctx.account, `/2/media/upload?command=STATUS&media_id=${encodeURIComponent(u.mediaId)}`);
      const info = status.data?.processing_info as { state?: string; check_after_secs?: number; error?: { message?: string } } | undefined;
      if (!info || info.state === "succeeded") break;
      if (info.state === "failed") throw new ConnectorError("fatal", "MEDIA_PROCESSING_FAILED", `X n'a pas pu traiter le média : ${info.error?.message ?? "raison inconnue"}.`);
      if (Date.now() > deadline) throw new ConnectorError("retryable", "MEDIA_PROCESSING", "Traitement du média par X encore en cours : nouvel essai.", 60_000);
      await new Promise((r) => setTimeout(r, Math.min(30, Math.max(1, info.check_after_secs ?? 5)) * 1000));
    }
    u.ready = true;
    await ctx.saveState({ media: uploaded });
  }
}

const tweetUrl = (account: ConnectedAccount, id: string) => `https://x.com/${(account.metadata as { username?: string }).username ?? "i"}/status/${id}`;

async function publish(ctx: PublishContext): Promise<PublishResult> {
  if (typeof ctx.state.tweetId === "string") return { status: "published", remoteId: ctx.state.tweetId, url: tweetUrl(ctx.account, ctx.state.tweetId) };
  const uploaded = await uploadAll(ctx);
  await waitProcessing(ctx, uploaded);
  await ctx.saveState({ tweetRequested: true });
  const body = { text: ctx.caption, ...(uploaded.length > 0 ? { media: { media_ids: uploaded.map((u) => u.mediaId) } } : {}) };
  const res = await api(ctx.account, "/2/tweets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const id = String(res.data.id);
  await ctx.saveState({ tweetId: id });
  return { status: "published", remoteId: id, url: tweetUrl(ctx.account, id) };
}

export const xConnector: Connector = {
  id: "x",
  platform: "X",
  label: "X",
  isConfigured: () => Boolean(env().clientId && env().clientSecret && hasEncryptionKey()),

  capabilities(): Capabilities {
    return {
      contentTypes: ["TEXT", "IMAGE", "VIDEO", "CAROUSEL"],
      immediatePublish: true,
      nativeScheduling: false,
      statusTracking: false,
      cancellation: false,
      reconciliation: true,
      permissions: SCOPES,
      limits: {
        textMax: 280,
        mediaMin: 0,
        mediaMax: 4,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"],
        videoMaxBytes: 8 * 1024 ** 3,
        videoMaxDurationMs: 20 * 60_000,
      },
      notes: [
        "Accès API X facturé à l'usage : vérifie ton solde de crédits dans le portail développeur X (aucun tarif n'est codé dans le Studio).",
        "280 caractères comptés simplement : X pondère certains caractères (liens = 23, certains emojis = 2), une marge est conseillée.",
        "Jusqu'à 4 images, ou une seule vidéo (20 min par défaut, plus pour les comptes Premium).",
        "Limite documentée : 100 posts par 15 min par utilisateur.",
      ],
    };
  },

  validateMedia(media) {
    return media.some((m) => m.kind === "VIDEO") && media.length > 1 ? [{ field: "media", message: "X : une vidéo seule, ou jusqu'à 4 images (pas de mélange)." }] : [];
  },

  publish,

  async reconcile(ctx) {
    if (typeof ctx.state.tweetId === "string") return { found: true, remoteId: ctx.state.tweetId, url: tweetUrl(ctx.account, ctx.state.tweetId) };
    if (ctx.state.tweetRequested !== true) return { found: false };
    return { found: "unknown", reason: "Le post a peut-être été créé sur X (une recherche consommerait des crédits payants)." };
  },

  oauth: {
    authorizationUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL(env().authorizeUrl);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: env().clientId,
        redirect_uri: redirectUri,
        scope: SCOPES.join(" "),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString();
      return url.toString();
    },

    async exchange({ code, codeVerifier, redirectUri }): Promise<OAuthAccount> {
      const res = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier });
      if (!res.ok) throw new OAuthFlowError(`Échange du code refusé par X : ${(await mapError(res)).message}`);
      const token = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
      if (!token.refresh_token) throw new OAuthFlowError("X n'a pas fourni de jeton de rafraîchissement (portée offline.access manquante).");
      const meRes = await fetch(`${env().apiUrl}/2/users/me`, { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!meRes.ok) throw new OAuthFlowError(`Lecture du compte X impossible : ${(await mapError(meRes)).message}`);
      const me = ((await meRes.json()) as { data: { id: string; username: string; name?: string } }).data;
      const granted = (token.scope ?? "").split(" ").filter(Boolean);
      const missing = SCOPES.filter((s) => !granted.includes(s));
      return {
        externalId: me.id,
        displayName: `@${me.username}`,
        credentials: { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 },
        grantedScopes: granted,
        metadata: { username: me.username },
        status: missing.length === 0 ? "READY" : "PERMISSION_MISSING",
        statusDetail: missing.length === 0 ? undefined : `Autorisations non accordées : ${missing.join(", ")}`,
      };
    },
  },
};
