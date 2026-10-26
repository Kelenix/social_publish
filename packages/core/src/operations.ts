import { z } from "zod";
import { prisma, type Operation } from "@app/db";
import { getConfig } from "./config";
import { importMedia } from "./media";
import { fetchRemote, openInboxFile, resolveInboxPath } from "./media/sources";

/** Durée maximale d'une opération avant d'être considérée comme interrompue. */
const OPERATION_LEASE_MS = 30 * 60_000;

export const importInputSchema = z.union([
  z.object({ path: z.string().min(1).max(1024) }).strict(),
  z.object({ url: z.url().max(2048) }).strict(),
]);
export type ImportInput = z.infer<typeof importInputSchema>;

/**
 * Enregistre une demande d'import et rend la main immédiatement. Un chemin est vérifié tout de
 * suite (erreur exploitable sans attendre) ; le traitement lourd est fait par le worker.
 */
export async function requestImport(input: ImportInput, actor: string): Promise<Operation> {
  if ("path" in input) {
    const config = getConfig();
    await resolveInboxPath(input.path, config.INBOX_DIR, config.INBOX_HOST_ALIASES);
  }
  return prisma.operation.create({ data: { kind: "IMPORT_MEDIA", input, createdBy: actor } });
}

export function getOperation(id: string) {
  return prisma.operation.findUnique({ where: { id } });
}

/** Prend la plus ancienne opération en attente (ou abandonnée par un worker arrêté) et l'exécute. */
export async function runNextOperation(now = new Date()): Promise<Operation | null> {
  const candidate = await prisma.operation.findFirst({
    where: { OR: [{ status: "PENDING" }, { status: "RUNNING", lockedUntil: { lt: now } }] },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;
  const { count } = await prisma.operation.updateMany({
    where: { id: candidate.id, status: candidate.status, updatedAt: candidate.updatedAt },
    data: { status: "RUNNING", lockedUntil: new Date(now.getTime() + OPERATION_LEASE_MS) },
  });
  if (count === 0) return null;

  try {
    const result = await execute(candidate);
    return prisma.operation.update({ where: { id: candidate.id }, data: { status: "SUCCEEDED", result, lockedUntil: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return prisma.operation.update({ where: { id: candidate.id }, data: { status: "FAILED", error: message, lockedUntil: null } });
  }
}

async function execute(op: Operation) {
  if (op.kind !== "IMPORT_MEDIA") throw new Error(`Type d'opération inconnu : ${op.kind}`);
  const input = importInputSchema.parse(op.input);
  const config = getConfig();
  let asset;
  if ("path" in input) {
    const real = await resolveInboxPath(input.path, config.INBOX_DIR, config.INBOX_HOST_ALIASES);
    asset = await importMedia(openInboxFile(real), real.split(/[\\/]/).pop()!, op.createdBy);
  } else {
    const remote = await fetchRemote(input.url);
    asset = await importMedia(remote.stream, remote.name, op.createdBy);
  }
  return { mediaId: asset.id, kind: asset.kind, mimeType: asset.mimeType, width: asset.width, height: asset.height, durationMs: asset.durationMs, sizeBytes: Number(asset.sizeBytes) };
}
