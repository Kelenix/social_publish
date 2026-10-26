import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma, type MediaAsset } from "@app/db";
import { audit } from "../audit";
import { getConfig } from "../config";
import { getStorage } from "../storage";
import { createThumbnail, probeFile, UnsupportedMediaError } from "./probe";

export { UnsupportedMediaError } from "./probe";

export class MediaTooLargeError extends Error {}
export class MediaInUseError extends Error {}

/** Compte les octets et calcule le SHA-256 au fil de l'eau ; interrompt au-delà de la limite. */
function meter(maxBytes: number) {
  const hash = createHash("sha256");
  let size = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length;
      if (size > maxBytes) return done(new MediaTooLargeError(`Fichier trop volumineux (maximum ${Math.floor(maxBytes / 1024 ** 2)} Mo).`));
      hash.update(chunk);
      done(null, chunk);
    },
  });
  return { stream, result: () => ({ size, sha256: hash.digest("hex") }) };
}

function stagingDir(): string {
  const config = getConfig();
  // Sur le même volume que le stockage local : l'archivage final est un simple renommage.
  return config.MEDIA_STORAGE === "local" ? path.join(path.resolve(config.MEDIA_LOCAL_DIR), ".staging") : path.join(os.tmpdir(), "studio-staging");
}

/** Nom d'origine conservé pour l'affichage uniquement (jamais utilisé comme chemin). */
function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return [...base].filter((c) => c.charCodeAt(0) >= 32).join("").slice(0, 200) || "sans-nom";
}

/**
 * Importe un média : copie dans un fichier de transit, analyse réelle via ffprobe, vignette,
 * puis archivage dans le stockage durable. Le fichier d'origine n'est jamais référencé ensuite.
 */
export async function importMedia(source: Readable, originalName: string, actor: string): Promise<MediaAsset> {
  const config = getConfig();
  const dir = stagingDir();
  await mkdir(dir, { recursive: true });
  const id = randomUUID();
  const staged = path.join(dir, id);
  const thumb = `${staged}.thumb.jpg`;

  try {
    const metered = meter(config.MEDIA_MAX_BYTES);
    await pipeline(source, metered.stream, createWriteStream(staged));
    const { size, sha256 } = metered.result();
    if (size === 0) throw new UnsupportedMediaError("Fichier vide.");

    const { extension, ...info } = await probeFile(config.FFPROBE_PATH, staged);
    await createThumbnail(config.FFMPEG_PATH, staged, thumb, info.durationMs);

    const month = new Date().toISOString().slice(0, 7).replace("-", "/");
    const storageKey = `media/${month}/${id}.${extension}`;
    const thumbKey = `thumbs/${month}/${id}.jpg`;
    const storage = getStorage();
    await storage.ingestFile(storageKey, staged, info.mimeType);
    await storage.ingestFile(thumbKey, thumb, "image/jpeg");

    const asset = await prisma.mediaAsset.create({
      data: { id, ...info, originalName: cleanName(originalName), storageKey, thumbKey, sizeBytes: BigInt(size), sha256 },
    });
    await audit({ actor, action: "media.import", entity: "media", entityId: id, meta: { kind: info.kind, sizeBytes: size } });
    return asset;
  } finally {
    await Promise.all([rm(staged, { force: true }), rm(thumb, { force: true })]);
  }
}

export function listMedia() {
  return prisma.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { posts: true } } } });
}

export function getMedia(id: string) {
  return prisma.mediaAsset.findUnique({ where: { id } });
}

/** Supprime un média non utilisé par une publication (l'original et sa vignette). */
export async function deleteMedia(id: string, actor: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id }, include: { _count: { select: { posts: true } } } });
  const inVariants = await prisma.postVariant.count({ where: { mediaIds: { has: id } } });
  if (asset._count.posts + inVariants > 0) throw new MediaInUseError("Ce média est utilisé par une publication.");
  await prisma.mediaAsset.delete({ where: { id } });
  const storage = getStorage();
  await Promise.all([storage.remove(asset.storageKey), asset.thumbKey ? storage.remove(asset.thumbKey) : undefined]);
  await audit({ actor, action: "media.delete", entity: "media", entityId: id });
}
