import { createHash, randomBytes } from "node:crypto";
import { prisma, type ConnectedAccount } from "@app/db";
import { audit } from "../audit";
import { sha256 } from "../auth";
import { getConfig } from "../config";
import { decrypt, encrypt, encryptJson } from "../crypto";
import { publicBaseUrl } from "../media/public-url";
import { OAuthFlowError } from "./credentials";
import { getConnector } from "./registry";
import type { OAuthAccount } from "./types";

export { OAuthFlowError } from "./credentials";

const STATE_TTL_MS = 10 * 60_000;

/**
 * URL de retour OAuth : APP_URL, sauf pour une plateforme qui exige HTTPS (Instagram) où l'on passe
 * par l'adresse publique (tunnel ou domaine).
 */
export function redirectUriFor(connectorId: string): string {
  const base = (getConnector(connectorId).httpsRedirect && publicBaseUrl()) || getConfig().APP_URL;
  return new URL(`/api/oauth/${connectorId}/callback`, base).toString();
}

/**
 * Démarre une autorisation : `state` aléatoire à usage unique (anti-CSRF) et PKCE S256.
 * Seuls le hash du state et le vérificateur chiffré sont conservés, 10 minutes.
 */
export async function startAuthorization(connectorId: string, actor: string): Promise<string> {
  const connector = getConnector(connectorId);
  if (!connector.oauth || !connector.isConfigured()) throw new OAuthFlowError("Connecteur non configuré.");
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.oAuthState.create({
    data: { stateHash: sha256(state), connector: connectorId, codeVerifier: encrypt(codeVerifier), createdBy: actor, expiresAt: new Date(Date.now() + STATE_TTL_MS) },
  });
  return connector.oauth.authorizationUrl({ state, codeChallenge, redirectUri: redirectUriFor(connectorId) });
}

/**
 * Termine l'autorisation : vérifie et consomme le state, échange le code, enregistre le compte.
 * Le state (aléatoire, à usage unique, 10 min, créé par l'administrateur connecté) prouve l'origine de
 * la demande : le retour peut donc arriver par un autre domaine (tunnel HTTPS) sans session.
 */
export async function completeAuthorization(connectorId: string, params: { code?: string | null; state?: string | null; error?: string | null }): Promise<ConnectedAccount> {
  if (params.error) throw new OAuthFlowError(params.error === "access_denied" ? "Autorisation refusée sur la plateforme." : `Erreur de la plateforme : ${params.error}`);
  if (!params.code || !params.state) throw new OAuthFlowError("Réponse d'autorisation incomplète.");
  // Suppression = consommation : un state ne peut servir qu'une fois.
  const pending = await prisma.oAuthState.findUnique({ where: { stateHash: sha256(params.state) } });
  if (pending) await prisma.oAuthState.delete({ where: { id: pending.id } });
  if (!pending || pending.connector !== connectorId || pending.expiresAt < new Date()) throw new OAuthFlowError("Demande d'autorisation inconnue ou expirée : recommence.");
  const actor = pending.createdBy;

  const connector = getConnector(connectorId);
  const result = await connector.oauth!.exchange({ code: params.code, codeVerifier: decrypt(pending.codeVerifier), redirectUri: redirectUriFor(connectorId) });
  const upsert = (r: Omit<OAuthAccount, "additionalAccounts">) => {
    const data = {
      displayName: r.displayName,
      status: r.status,
      statusDetail: r.statusDetail ?? null,
      credentials: encryptJson(r.credentials),
      grantedScopes: r.grantedScopes,
      metadata: r.metadata as object,
      rateLimitedUntil: null,
    };
    return prisma.connectedAccount.upsert({
      where: { connector_externalId: { connector: connectorId, externalId: r.externalId } },
      create: { connector: connectorId, platform: connector.platform, externalId: r.externalId, ...data },
      update: data,
    });
  };
  const account = await upsert(result);
  for (const extra of result.additionalAccounts ?? []) await upsert(extra);
  await audit({ actor, action: "account.oauth_connected", entity: "account", entityId: account.id, meta: { connector: connectorId, status: account.status, scopes: result.grantedScopes } });
  return account;
}
