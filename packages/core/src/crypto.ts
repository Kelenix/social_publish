import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement authentifié (AES-256-GCM) des secrets stockés en base (jetons OAuth).
 * La clé vient de TOKEN_ENCRYPTION_KEY (32 octets en base64), jamais de la base.
 * Format : v1.<iv>.<tag>.<texte chiffré> (base64url).
 */
export class EncryptionKeyError extends Error {}

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new EncryptionKeyError("TOKEN_ENCRYPTION_KEY manquante : impossible de chiffrer les jetons OAuth.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new EncryptionKeyError("TOKEN_ENCRYPTION_KEY doit contenir 32 octets encodés en base64.");
  return buf;
}

export function hasEncryptionKey(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) throw new Error("Secret chiffré illisible.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export const encryptJson = (value: unknown) => encrypt(JSON.stringify(value));
export const decryptJson = <T>(payload: string) => JSON.parse(decrypt(payload)) as T;
