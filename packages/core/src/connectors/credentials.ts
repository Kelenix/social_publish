import { prisma, type ConnectedAccount } from "@app/db";
import { decryptJson, encryptJson } from "../crypto";

/** Jetons OAuth d'un compte : toujours chiffrés en base, déchiffrés à la demande. */
export class OAuthFlowError extends Error {}

export function readCredentials<T>(account: ConnectedAccount): T {
  if (!account.credentials) throw new OAuthFlowError("Aucun jeton enregistré pour ce compte.");
  return decryptJson<T>(account.credentials);
}

export async function saveCredentials(accountId: string, credentials: unknown): Promise<void> {
  await prisma.connectedAccount.update({ where: { id: accountId }, data: { credentials: encryptJson(credentials) } });
}
