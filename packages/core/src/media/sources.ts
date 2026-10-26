import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import path from "node:path";
import type { Readable } from "node:stream";

export class SourceError extends Error {}

/**
 * Convertit le chemin donné par Claude Code (relatif à l'inbox, ou absolu côté Windows/WSL sous un
 * alias déclaré) en chemin réel à l'intérieur de l'inbox. Tout ce qui sort de l'inbox est refusé,
 * y compris via un lien symbolique.
 */
export async function resolveInboxPath(input: string, inboxDir: string, hostAliases: string[] = []): Promise<string> {
  const normalized = input.trim().replaceAll("\\", "/");
  if (!normalized || normalized.includes("\0")) throw new SourceError("Chemin vide ou invalide.");

  let relative = normalized;
  const isAbsolute = /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("/");
  if (isAbsolute) {
    const alias = hostAliases
      .map((a) => a.trim().replaceAll("\\", "/").replace(/\/+$/, ""))
      .filter(Boolean)
      .find((a) => normalized.toLowerCase().startsWith(`${a.toLowerCase()}/`));
    if (!alias) throw new SourceError("Chemin hors du dossier autorisé : dépose le fichier dans le dossier inbox du projet.");
    relative = normalized.slice(alias.length + 1);
  }
  if (relative.split("/").some((part) => part === "..")) throw new SourceError("Les segments « .. » sont interdits.");

  const root = await realpath(inboxDir);
  let real: string;
  try {
    real = await realpath(path.resolve(root, relative));
  } catch {
    throw new SourceError(`Fichier introuvable dans l'inbox : ${relative}`);
  }
  if (!real.startsWith(root + path.sep)) throw new SourceError("Chemin hors du dossier autorisé.");
  if (!(await stat(real)).isFile()) throw new SourceError("Ce chemin n'est pas un fichier.");
  return real;
}

export function openInboxFile(realPath: string): Readable {
  return createReadStream(realPath);
}

/** Adresse interdite pour un import distant : boucle locale, réseaux privés, lien local, multicast… */
export function isForbiddenAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isForbiddenAddress(mapped[1]!);
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff");
  }
  return true;
}

const MAX_REDIRECTS = 3;

/**
 * Télécharge une URL HTTPS publique. Chaque nom est résolu puis vérifié, et la connexion se fait
 * vers l'adresse vérifiée (pas de seconde résolution exploitable). Redirections revérifiées.
 */
export async function fetchRemote(rawUrl: string, timeoutMs = 60_000): Promise<{ stream: Readable; name: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourceError("URL invalide.");
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "https:") throw new SourceError("Seules les URL HTTPS sont acceptées.");
    if (url.username || url.password) throw new SourceError("Identifiants dans l'URL interdits.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true }).catch(() => []);
    if (addresses.length === 0) throw new SourceError("Nom de domaine introuvable.");
    if (addresses.some((a) => isForbiddenAddress(a.address))) throw new SourceError("Adresse non publique refusée.");
    const target = addresses[0]!;

    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const req = request(url, { timeout: timeoutMs, lookup: (_h, _o, cb) => cb(null, target.address, target.family) }, resolve);
      req.on("timeout", () => req.destroy(new SourceError("Délai de téléchargement dépassé.")));
      req.on("error", reject);
      req.end();
    });
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400 && response.headers.location) {
      response.resume();
      url = new URL(response.headers.location, url);
      continue;
    }
    if (status !== 200) {
      response.resume();
      throw new SourceError(`Téléchargement refusé (HTTP ${status}).`);
    }
    return { stream: response, name: decodeURIComponent(url.pathname.split("/").pop() || "import") };
  }
  throw new SourceError("Trop de redirections.");
}
