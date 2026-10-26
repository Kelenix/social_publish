import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * URLs HTTPS temporaires et signées pour qu'une plateforme (Instagram) télécharge un média.
 * Jamais d'URL localhost ni de chemin local : PUBLIC_BASE_URL doit être une adresse HTTPS publique
 * (tunnel en développement, domaine sur un VPS).
 */
export class PublicUrlError extends Error {}

function settings() {
  const base = process.env.PUBLIC_BASE_URL ?? "";
  const key = process.env.MEDIA_URL_SIGNING_KEY ?? "";
  return { base: base.replace(/\/+$/, ""), key };
}

/** Raison pour laquelle les URLs publiques sont indisponibles, ou null si tout est prêt. */
export function publicMediaProblem(): string | null {
  const { base, key } = settings();
  if (!base) return "PUBLIC_BASE_URL n'est pas définie (adresse HTTPS publique : tunnel ou domaine).";
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return "PUBLIC_BASE_URL est invalide.";
  }
  if (url.protocol !== "https:") return "PUBLIC_BASE_URL doit utiliser HTTPS.";
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost")) {
    return "PUBLIC_BASE_URL ne doit pas désigner la machine locale : la plateforme ne pourrait pas y accéder.";
  }
  if (key.length < 32) return "MEDIA_URL_SIGNING_KEY doit contenir au moins 32 caractères aléatoires.";
  return null;
}

const signature = (key: string, mediaId: string, expires: number) => createHmac("sha256", key).update(`${mediaId}.${expires}`).digest("base64url");

export function signedMediaUrl(mediaId: string, ttlMs: number, now = Date.now()): string {
  const problem = publicMediaProblem();
  if (problem) throw new PublicUrlError(problem);
  const { base, key } = settings();
  const expires = Math.floor((now + ttlMs) / 1000);
  return `${base}/api/public/media/${mediaId}?exp=${expires}&sig=${signature(key, mediaId, expires)}`;
}

export function verifyMediaSignature(mediaId: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
  const { key } = settings();
  const expires = Number(exp);
  if (!key || !sig || !Number.isInteger(expires) || expires * 1000 < now) return false;
  const expected = Buffer.from(signature(key, mediaId, expires));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
