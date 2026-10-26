import { randomBytes } from "node:crypto";
import { prisma, type ApiToken } from "@app/db";
import { audit } from "./audit";
import { sha256 } from "./auth";
import type { TokenScope } from "./tokens-scopes";

export { TOKEN_SCOPE_LABELS, TOKEN_SCOPES, type TokenScope } from "./tokens-scopes";

const PREFIX = "stp_";

/** Crée un jeton. La valeur en clair n'est renvoyée qu'ici : elle n'est jamais stockée. */
export async function createApiToken(name: string, scopes: TokenScope[], expiresInDays: number | null, actor: string) {
  const token = PREFIX + randomBytes(32).toString("base64url");
  const record = await prisma.apiToken.create({
    data: {
      name: name.trim().slice(0, 80) || "Jeton",
      prefix: token.slice(0, PREFIX.length + 6),
      tokenHash: sha256(token),
      scopes: [...new Set(scopes)],
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
    },
  });
  await audit({ actor, action: "token.create", entity: "token", entityId: record.id, meta: { scopes: record.scopes } });
  return { token, record };
}

/** Jeton valide (non révoqué, non expiré) ou null. Met à jour la date de dernière utilisation. */
export async function verifyApiToken(token: string | undefined | null): Promise<ApiToken | null> {
  if (!token?.startsWith(PREFIX)) return null;
  const record = await prisma.apiToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.revokedAt || (record.expiresAt && record.expiresAt <= new Date())) return null;
  // Écriture limitée à une par minute pour ne pas solliciter la base à chaque appel.
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    await prisma.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  }
  return record;
}

export async function revokeApiToken(id: string, actor: string): Promise<void> {
  await prisma.apiToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ actor, action: "token.revoke", entity: "token", entityId: id });
}

export function listApiTokens() {
  return prisma.apiToken.findMany({ orderBy: { createdAt: "desc" } });
}
