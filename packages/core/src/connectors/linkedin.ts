import { Readable } from "node:stream";
import type { ConnectedAccount } from "@app/db";
import { encryptJson, hasEncryptionKey } from "../crypto";
import { OAuthFlowError, readCredentials, saveCredentials } from "./credentials";
import { ConnectorError, type Capabilities, type Connector, type OAuthAccount, type PublishContext, type PublishResult } from "./types";

/**
 * Connecteur LinkedIn — Posts API versionnée (/rest/posts), Images API et Videos API.
 * Profil personnel : produit « Share on LinkedIn » (w_member_social).
 * Pages : produit « Community Management API » (w_organization_social), soumis à l'approbation de LinkedIn.
 * Documentation vérifiée le 2026-10-26 (docs/integrations.md).
 */

const MEMBER_SCOPES = ["openid", "profile", "w_member_social"];
const ORGANIZATION_SCOPES = ["w_organization_social", "r_organization_admin"];

function env() {
  return {
    clientId: process.env.LINKEDIN_CLIENT_ID ?? "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    version: process.env.LINKEDIN_API_VERSION ?? "202610",
    organizations: process.env.LINKEDIN_ORGANIZATIONS === "true",
    authorizeUrl: process.env.LINKEDIN_AUTHORIZE_URL ?? "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: process.env.LINKEDIN_TOKEN_URL ?? "https://www.linkedin.com/oauth/v2/accessToken",
    apiUrl: process.env.LINKEDIN_API_URL ?? "https://api.linkedin.com",
  };
}
const scopes = () => (env().organizations ? [...MEMBER_SCOPES, ...ORGANIZATION_SCOPES] : MEMBER_SCOPES);

type Credentials = { accessToken: string; expiresAt: number; refreshToken?: string };
type Meta = { authorUrn: string; kind: "member" | "organization" };

/**
 * Format « little » : les caractères réservés sont échappés ; les hashtags (#mot) restent des
 * hashtags LinkedIn.
 */
export function escapeLittleText(text: string): string {
  return text
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`)))
    .join("");
}

async function mapError(res: Response): Promise<ConnectorError> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string; error_description?: string; serviceErrorCode?: number };
    message = body.message ?? body.error_description ?? message;
  } catch {
    // Corps non JSON.
  }
  const retryAfter = Number(res.headers.get("retry-after")) * 1000 || undefined;
  if (res.status === 401) return new ConnectorError("auth", "UNAUTHORIZED", "Autorisation LinkedIn expirée ou révoquée : reconnecte le compte.");
  if (res.status === 403) return new ConnectorError("permission", "ACCESS_DENIED", `Permission LinkedIn insuffisante : ${message}`);
  if (res.status === 429) return new ConnectorError("retryable", "RATE_LIMITED", "Limite de requêtes LinkedIn atteinte.", retryAfter ?? 60 * 60_000);
  if (res.status === 409 || res.status >= 500) return new ConnectorError("retryable", `HTTP_${res.status}`, `Erreur temporaire de LinkedIn : ${message}`, retryAfter);
  return new ConnectorError("fatal", `HTTP_${res.status}`, `LinkedIn a refusé la requête : ${message}`);
}

async function accessToken(account: ConnectedAccount): Promise<string> {
  const creds = readCredentials<Credentials>(account);
  if (creds.expiresAt - 60_000 > Date.now()) return creds.accessToken;
  if (!creds.refreshToken) throw new ConnectorError("auth", "TOKEN_EXPIRED", "Autorisation LinkedIn expirée (60 jours) : reconnecte le compte.");
  const { clientId, clientSecret, tokenUrl } = env();
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: creds.refreshToken, client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new ConnectorError("auth", "REFRESH_FAILED", "Renouvellement de l'autorisation LinkedIn refusé : reconnecte le compte.");
  const body = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  const next: Credentials = { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000, refreshToken: body.refresh_token ?? creds.refreshToken };
  await saveCredentials(account.id, next);
  account.credentials = encryptJson(next);
  return next.accessToken;
}

async function rest(account: ConnectedAccount, method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${env().apiUrl}/rest/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken(account)}`,
      "LinkedIn-Version": env().version,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await mapError(res);
  return res;
}

const author = (account: ConnectedAccount) => (account.metadata as Meta).authorUrn;

/** Envoie le média (image en une fois, vidéo en parties de 4 Mo) ; reprise possible partie par partie. */
async function uploadMedia(ctx: PublishContext): Promise<string> {
  if (typeof ctx.state.mediaUrn === "string" && ctx.state.uploaded === true) return ctx.state.mediaUrn;
  const media = ctx.media[0]!;
  const size = Number(media.asset.sizeBytes);
  const put = async (url: string, range?: { start: number; end: number }) => {
    const stream = await media.open(range);
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${await accessToken(ctx.account)}`, "Content-Type": "application/octet-stream" },
      body: Readable.toWeb(stream) as ReadableStream,
      duplex: "half",
    } as RequestInit);
    if (!res.ok) throw await mapError(res);
    return res.headers.get("etag") ?? "";
  };

  if (media.asset.kind === "IMAGE") {
    const init = (await (await rest(ctx.account, "POST", "images?action=initializeUpload", { initializeUploadRequest: { owner: author(ctx.account) } })).json()) as { value: { uploadUrl: string; image: string } };
    await put(init.value.uploadUrl);
    await ctx.saveState({ mediaUrn: init.value.image, uploaded: true });
    return init.value.image;
  }

  type Init = { value: { video: string; uploadToken: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } };
  let session = ctx.state.videoSession as Init["value"] | undefined;
  if (!session) {
    const init = (await (await rest(ctx.account, "POST", "videos?action=initializeUpload", {
      initializeUploadRequest: { owner: author(ctx.account), fileSizeBytes: size, uploadCaptions: false, uploadThumbnail: false },
    })).json()) as Init;
    session = init.value;
    await ctx.saveState({ videoSession: session, etags: [] });
  }
  const etags = Array.isArray(ctx.state.etags) ? [...(ctx.state.etags as string[])] : [];
  for (const part of session.uploadInstructions.slice(etags.length)) {
    etags.push(await put(part.uploadUrl, { start: part.firstByte, end: part.lastByte }));
    await ctx.saveState({ etags });
  }
  await rest(ctx.account, "POST", "videos?action=finalizeUpload", { finalizeUploadRequest: { video: session.video, uploadToken: session.uploadToken, uploadedPartIds: etags } });
  await ctx.saveState({ mediaUrn: session.video, uploaded: true });
  return session.video;
}

/** Vidéo encore en traitement chez LinkedIn ? (lecture parfois interdite avec w_member_social seul.) */
async function videoReady(ctx: PublishContext, urn: string): Promise<boolean> {
  try {
    const res = await rest(ctx.account, "GET", `videos/${encodeURIComponent(urn)}`);
    const status = ((await res.json()) as { status?: string; processingFailureReason?: string }).status;
    if (status === "PROCESSING_FAILED") throw new ConnectorError("fatal", "VIDEO_PROCESSING_FAILED", "LinkedIn n'a pas pu traiter la vidéo.");
    return status === "AVAILABLE";
  } catch (error) {
    if (error instanceof ConnectorError && error.kind === "permission") return true;
    throw error;
  }
}

async function advance(ctx: PublishContext): Promise<PublishResult> {
  if (typeof ctx.state.postUrn === "string") return { status: "published", remoteId: ctx.state.postUrn, url: postUrl(ctx.state.postUrn) };
  const mediaUrn = ctx.media.length > 0 ? await uploadMedia(ctx) : null;
  if (mediaUrn?.startsWith("urn:li:video:") && !(await videoReady(ctx, mediaUrn))) {
    return { status: "processing", remoteId: mediaUrn, pollAfterMs: 30_000 };
  }
  await ctx.saveState({ postRequested: true });
  const visibility = ctx.content.options.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC";
  const res = await rest(ctx.account, "POST", "posts", {
    author: author(ctx.account),
    commentary: escapeLittleText(ctx.caption),
    visibility,
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    ...(mediaUrn ? { content: { media: { id: mediaUrn, ...(ctx.content.title ? { title: ctx.content.title } : {}) } } } : {}),
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
  const postUrn = res.headers.get("x-restli-id");
  if (!postUrn) throw new ConnectorError("uncertain", "NO_POST_ID", "LinkedIn n'a pas renvoyé l'identifiant de la publication.");
  await ctx.saveState({ postUrn });
  return { status: "published", remoteId: postUrn, url: postUrl(postUrn) };
}

const postUrl = (urn: string) => `https://www.linkedin.com/feed/update/${urn}/`;

export const linkedinConnector: Connector = {
  id: "linkedin",
  platform: "LINKEDIN",
  label: "LinkedIn",
  isConfigured: () => Boolean(env().clientId && env().clientSecret && hasEncryptionKey()),

  capabilities(account): Capabilities {
    const organization = (account?.metadata as Meta | undefined)?.kind === "organization";
    return {
      contentTypes: ["TEXT", "IMAGE", "VIDEO"],
      immediatePublish: true,
      nativeScheduling: false,
      statusTracking: true,
      cancellation: false,
      reconciliation: true,
      permissions: organization ? ORGANIZATION_SCOPES : MEMBER_SCOPES,
      limits: {
        textMax: 3000,
        mediaMin: 0,
        mediaMax: 1,
        mimeTypes: ["image/jpeg", "image/png", "video/mp4"],
        videoMaxBytes: 500 * 1024 ** 2,
        videoMinDurationMs: 3_000,
        videoMaxDurationMs: 30 * 60_000,
      },
      notes: [
        organization ? "Page d'entreprise : nécessite l'API Community Management (approbation LinkedIn) et un rôle d'administrateur." : "Profil personnel : produit « Share on LinkedIn ».",
        "Les publications LinkedIn sont visibles dès l'envoi (pas de brouillon par l'API) ; visibilité « Relations » possible pour un profil.",
        "Limite documentée : 150 requêtes par jour et par membre.",
        "Texte limité à 3000 caractères (limite usuelle ; la page Posts API ne la chiffre pas).",
        "Autorisation de 60 jours ; reconnexion nécessaire ensuite si LinkedIn ne fournit pas de jeton de rafraîchissement.",
      ],
    };
  },

  validateOptions(options) {
    return options.visibility !== undefined && !["PUBLIC", "CONNECTIONS"].includes(String(options.visibility)) ? [{ field: "options", message: "LinkedIn : visibilité invalide." }] : [];
  },

  publish: (ctx) => advance(ctx),
  getStatus: (ctx) => advance(ctx),

  async reconcile(ctx) {
    if (typeof ctx.state.postUrn === "string") return { found: true, remoteId: ctx.state.postUrn, url: postUrl(ctx.state.postUrn) };
    if (ctx.state.postRequested !== true) return { found: false };
    return { found: "unknown", reason: "LinkedIn ne permet pas de retrouver une publication sans une permission restreinte (r_member_social)." };
  },

  oauth: {
    authorizationUrl({ state, redirectUri }) {
      const url = new URL(env().authorizeUrl);
      url.search = new URLSearchParams({ response_type: "code", client_id: env().clientId, redirect_uri: redirectUri, state, scope: scopes().join(" ") }).toString();
      return url.toString();
    },

    async exchange({ code, redirectUri }): Promise<OAuthAccount> {
      const { clientId, clientSecret, tokenUrl, apiUrl, version } = env();
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
      });
      if (!res.ok) throw new OAuthFlowError(`Échange du code refusé par LinkedIn : ${(await mapError(res)).message}`);
      const token = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
      const credentials: Credentials = { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000, refreshToken: token.refresh_token };
      const granted = (token.scope ?? "").split(/[ ,]+/).filter(Boolean);
      const auth = { Authorization: `Bearer ${token.access_token}` };

      const meRes = await fetch(`${apiUrl}/v2/userinfo`, { headers: auth });
      if (!meRes.ok) throw new OAuthFlowError(`Lecture du profil impossible : ${(await mapError(meRes)).message}`);
      const me = (await meRes.json()) as { sub: string; name?: string };
      const memberMissing = MEMBER_SCOPES.filter((s) => !granted.includes(s));

      const organizations: Omit<OAuthAccount, "additionalAccounts">[] = [];
      if (granted.includes("w_organization_social") && granted.includes("r_organization_admin")) {
        const headers = { ...auth, "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0" };
        const acl = await fetch(`${apiUrl}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`, { headers });
        if (acl.ok) {
          for (const el of ((await acl.json()) as { elements?: { organization: string }[] }).elements ?? []) {
            const id = el.organization.split(":").pop()!;
            const org = await fetch(`${apiUrl}/rest/organizations/${id}`, { headers });
            const name = org.ok ? ((await org.json()) as { localizedName?: string }).localizedName : undefined;
            organizations.push({
              externalId: el.organization,
              displayName: `${name ?? el.organization} (page)`,
              credentials,
              grantedScopes: granted,
              metadata: { authorUrn: el.organization, kind: "organization" } satisfies Meta,
              status: "READY",
            });
          }
        }
      }
      return {
        externalId: `urn:li:person:${me.sub}`,
        displayName: me.name ?? "Profil LinkedIn",
        credentials,
        grantedScopes: granted,
        metadata: { authorUrn: `urn:li:person:${me.sub}`, kind: "member" } satisfies Meta,
        status: memberMissing.length === 0 ? "READY" : "PERMISSION_MISSING",
        statusDetail: memberMissing.length === 0 ? undefined : `Autorisations non accordées : ${memberMissing.join(", ")}`,
        additionalAccounts: organizations,
      };
    },
  },
};
