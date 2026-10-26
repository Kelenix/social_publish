import { prisma, type AttemptOutcome, type Destination, type DestinationStatus, type Prisma } from "@app/db";
import { audit } from "../audit";
import { ConnectorError, getConnector, type PublishContext, type PublishResult } from "../connectors";
import { getPost } from "../posts/service";
import { getSettings } from "../settings";
import { getStorage } from "../storage";
import { prepareContent } from "./content";
import { lockPost, recomputePostStatus } from "./service";
import { retryDelayMs } from "./status";

/** Durée du bail d'exécution : au-delà, le worker est considéré comme interrompu. */
export const LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
/** Retard au-delà duquel une publication jamais tentée est considérée comme manquée. */
export const MISSED_GRACE_MS = 10 * 60_000;
/** Politique « publier si le retard est faible » : retard maximal toléré. */
export const RECENT_WINDOW_MS = 2 * 60 * 60_000;
/** Attente avant de rapprocher un résultat incertain (laisse à la plateforme le temps d'indexer). */
export const RECONCILE_DELAY_MS = 30_000;

export type ExecutionResult = "skipped" | DestinationStatus;

const sec = (ms: number) => Math.round(ms / 1000);

async function finish(
  dest: Destination,
  attemptId: string | null,
  outcome: AttemptOutcome,
  data: Prisma.DestinationUpdateInput,
  error?: { code: string; message: string; retryAfterMs?: number },
): Promise<DestinationStatus> {
  return prisma.$transaction(async (tx) => {
    await lockPost(tx, dest.postId);
    if (attemptId) {
      await tx.publicationAttempt.update({
        where: { id: attemptId },
        data: { finishedAt: new Date(), outcome, errorCode: error?.code, errorMessage: error?.message, retryAfterMs: error?.retryAfterMs },
      });
    }
    const updated = await tx.destination.update({
      where: { id: dest.id },
      data: { ...data, lockedBy: null, lockedUntil: null, lastErrorCode: error?.code ?? null, lastError: error?.message ?? null },
    });
    await recomputePostStatus(dest.postId, tx);
    await audit({ actor: "worker", action: `destination.${outcome.toLowerCase()}`, entity: "destination", entityId: dest.id, meta: { status: updated.status, code: error?.code ?? null } }, tx);
    return updated.status;
  });
}

/**
 * Prend la destination de façon atomique. Un seul exécutant peut réussir ce changement d'état :
 * c'est la protection principale contre les envois concurrents (deux jobs, deux workers).
 */
async function claim(id: string, workerId: string, now: Date): Promise<{ dest: Destination; kind: "publish" | "poll" | "reconcile" } | null> {
  const lock = { lockedBy: workerId, lockedUntil: new Date(now.getTime() + LEASE_MS) };
  const free = { OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] };
  const due = { id, nextAttemptAt: { lte: now }, ...free };

  if ((await prisma.destination.updateMany({ where: { ...due, status: { in: ["PENDING", "RETRY_WAIT"] } }, data: { ...lock, status: "PUBLISHING", attempts: { increment: 1 } } })).count === 1) {
    return { dest: await prisma.destination.findUniqueOrThrow({ where: { id } }), kind: "publish" };
  }
  if ((await prisma.destination.updateMany({ where: { ...due, status: "PROCESSING" }, data: lock })).count === 1) {
    return { dest: await prisma.destination.findUniqueOrThrow({ where: { id } }), kind: "poll" };
  }
  if ((await prisma.destination.updateMany({ where: { ...due, status: "UNCERTAIN" }, data: lock })).count === 1) {
    return { dest: await prisma.destination.findUniqueOrThrow({ where: { id } }), kind: "reconcile" };
  }
  return null;
}

/** Exécute une étape d'une destination : envoi, suivi du traitement ou rapprochement. */
export async function executeDestination(id: string, workerId: string, now = new Date()): Promise<ExecutionResult> {
  const claimed = await claim(id, workerId, now);
  if (!claimed) return "skipped";
  const { dest, kind } = claimed;

  const [post, account] = await Promise.all([getPost(dest.postId), prisma.connectedAccount.findUniqueOrThrow({ where: { id: dest.accountId } })]);
  if (!post) throw new Error(`Publication ${dest.postId} introuvable`);
  const connector = getConnector(account.connector);

  // Rapprochement d'un résultat incertain : jamais de renvoi sans preuve d'absence.
  if (kind === "reconcile") {
    if (!connector.reconcile) return finish(dest, null, "UNCERTAIN", { nextAttemptAt: new Date("9999-12-31") }, { code: "UNCERTAIN", message: "Rapprochement impossible avec ce connecteur : vérifie sur la plateforme." });
  }

  // L'autorisation porte sur une version précise du contenu.
  if (kind === "publish" && post.version !== dest.contentVersion) {
    return finish(dest, null, "FATAL_ERROR", { status: "FAILED" }, { code: "CONTENT_CHANGED", message: "Le contenu a changé depuis l'autorisation : reprogramme la publication." });
  }
  if (account.status !== "READY") {
    const message = "Le compte doit être reconnecté ou corrigé.";
    if (kind === "publish") return finish(dest, null, "FATAL_ERROR", { status: "FAILED" }, { code: `ACCOUNT_${account.status}`, message });
    // Suivi ou rapprochement : on conserve l'état et on réessaiera après reconnexion.
    return finish(dest, null, "RETRYABLE_ERROR", { nextAttemptAt: new Date(Date.now() + 5 * 60_000) }, { code: `ACCOUNT_${account.status}`, message });
  }
  if (kind === "publish" && account.rateLimitedUntil && account.rateLimitedUntil > now) {
    // Quota en cours : on attend sans consommer de tentative.
    return finish(dest, null, "RETRYABLE_ERROR", { status: "RETRY_WAIT", attempts: { decrement: 1 }, nextAttemptAt: account.rateLimitedUntil }, { code: "RATE_LIMITED", message: "Quota du compte en attente." });
  }

  const prepared = await prepareContent(post, account);
  if (kind === "publish" && prepared.issues.length > 0) {
    return finish(dest, null, "FATAL_ERROR", { status: "FAILED" }, { code: "VALIDATION", message: prepared.issues.map((i) => i.message).join(" ") });
  }

  const storage = getStorage();
  const ctx: PublishContext = {
    destinationId: dest.id,
    idempotencyKey: dest.idempotencyKey,
    attempt: dest.attempts,
    account,
    content: prepared.content,
    caption: prepared.caption,
    media: prepared.media.map((asset) => ({ asset, open: () => storage.read(asset.storageKey) })),
    remoteId: dest.remoteId,
  };

  const attempt = await prisma.publicationAttempt.create({ data: { destinationId: dest.id, kind, workerId } });
  try {
    if (kind === "reconcile") {
      const found = await connector.reconcile!(ctx);
      if (found.found) return finish(dest, attempt.id, "RECONCILED", { status: "PUBLISHED", remoteId: found.remoteId, remoteUrl: found.url, publishedAt: new Date() });
      // Absence confirmée : un nouvel envoi ne crée pas de doublon.
      if (dest.attempts >= MAX_ATTEMPTS) return finish(dest, attempt.id, "FATAL_ERROR", { status: "FAILED" }, { code: "MAX_ATTEMPTS", message: "Nombre maximal de tentatives atteint." });
      return finish(dest, attempt.id, "RETRYABLE_ERROR", { status: "RETRY_WAIT", nextAttemptAt: new Date() }, { code: "NOT_FOUND_AFTER_UNCERTAIN", message: "Publication absente de la plateforme : nouvel envoi." });
    }

    const result: PublishResult =
      kind === "poll" && connector.getStatus && dest.remoteId ? await connector.getStatus({ ...ctx, remoteId: dest.remoteId }) : await connector.publish(ctx);
    if (result.status === "published") {
      return finish(dest, attempt.id, "PUBLISHED", { status: "PUBLISHED", remoteId: result.remoteId, remoteUrl: result.url, publishedAt: new Date() });
    }
    return finish(dest, attempt.id, "PROCESSING", { status: "PROCESSING", remoteId: result.remoteId, nextAttemptAt: new Date(Date.now() + result.pollAfterMs) });
  } catch (error) {
    const err =
      error instanceof ConnectorError
        ? error
        : // Erreur inattendue pendant l'appel : on ne sait pas si la plateforme a reçu la requête.
          new ConnectorError("uncertain", "UNEXPECTED", error instanceof Error ? error.message : String(error));
    const info = { code: err.code, message: err.message, retryAfterMs: err.retryAfterMs };

    if (kind === "poll" && err.kind === "retryable") {
      return finish(dest, attempt.id, "RETRYABLE_ERROR", { status: "PROCESSING", nextAttemptAt: new Date(Date.now() + retryDelayMs(1, err.retryAfterMs)) }, info);
    }
    switch (err.kind) {
      case "retryable": {
        if (err.retryAfterMs) {
          await prisma.connectedAccount.update({ where: { id: account.id }, data: { rateLimitedUntil: new Date(Date.now() + err.retryAfterMs) } });
        }
        if (dest.attempts >= MAX_ATTEMPTS) {
          return finish(dest, attempt.id, "FATAL_ERROR", { status: "FAILED" }, { ...info, message: `${err.message} (abandon après ${MAX_ATTEMPTS} tentatives)` });
        }
        const delay = retryDelayMs(dest.attempts, err.retryAfterMs);
        return finish(dest, attempt.id, "RETRYABLE_ERROR", { status: "RETRY_WAIT", nextAttemptAt: new Date(Date.now() + delay) }, { ...info, message: `${err.message} Nouvel essai dans ${sec(delay)} s.` });
      }
      case "auth":
        await prisma.connectedAccount.update({ where: { id: account.id }, data: { status: "RECONNECT_REQUIRED", statusDetail: err.message } });
        return finish(dest, attempt.id, "FATAL_ERROR", { status: "FAILED" }, info);
      case "permission":
        await prisma.connectedAccount.update({ where: { id: account.id }, data: { status: "PERMISSION_MISSING", statusDetail: err.message } });
        return finish(dest, attempt.id, "FATAL_ERROR", { status: "FAILED" }, info);
      case "fatal":
        return finish(dest, attempt.id, "FATAL_ERROR", { status: "FAILED" }, info);
      case "uncertain":
        return finish(dest, attempt.id, "UNCERTAIN", { status: "UNCERTAIN", nextAttemptAt: new Date(Date.now() + RECONCILE_DELAY_MS) }, info);
    }
  }
}

/**
 * Après un arrêt brutal : une destination restée « en cours d'envoi » au-delà de son bail a peut-être
 * été publiée. Elle passe en résultat incertain (rapprochement avant toute nouvelle tentative).
 */
export async function recoverInterrupted(now = new Date()): Promise<number> {
  const stale = await prisma.destination.findMany({ where: { lockedUntil: { lt: now }, status: { in: ["PUBLISHING", "PROCESSING", "UNCERTAIN"] } } });
  for (const dest of stale) {
    await prisma.$transaction(async (tx) => {
      await lockPost(tx, dest.postId);
      await tx.publicationAttempt.updateMany({ where: { destinationId: dest.id, outcome: null }, data: { outcome: "INTERRUPTED", finishedAt: now } });
      const next: Prisma.DestinationUpdateManyMutationInput =
        dest.status === "PUBLISHING"
          ? { status: "UNCERTAIN", nextAttemptAt: new Date(now.getTime() + RECONCILE_DELAY_MS), lastErrorCode: "INTERRUPTED", lastError: "Envoi interrompu (arrêt du worker) : vérification avant tout nouvel envoi." }
          : {};
      await tx.destination.updateMany({ where: { id: dest.id, lockedUntil: dest.lockedUntil }, data: { ...next, lockedBy: null, lockedUntil: null } });
      await recomputePostStatus(dest.postId, tx);
    });
  }
  return stale.length;
}

/** Publications jamais tentées dont l'heure est largement dépassée (ordinateur éteint, worker arrêté). */
export async function applyMissedPolicy(now = new Date()): Promise<number> {
  const missed = await prisma.destination.findMany({
    where: { status: "PENDING", attempts: 0, nextAttemptAt: { lt: new Date(now.getTime() - MISSED_GRACE_MS) } },
  });
  if (missed.length === 0) return 0;
  const { missedPolicy } = await getSettings();
  for (const dest of missed) {
    const late = now.getTime() - dest.scheduledAt.getTime();
    const status: DestinationStatus =
      missedPolicy === "CANCEL" ? "CANCELLED" : missedPolicy === "PUBLISH_IF_RECENT" && late <= RECENT_WINDOW_MS ? "PENDING" : "MISSED";
    if (status === "PENDING") {
      // Retard toléré : on marque la destination comme déjà examinée pour qu'elle parte normalement.
      await prisma.destination.updateMany({ where: { id: dest.id, status: "PENDING" }, data: { status: "RETRY_WAIT", nextAttemptAt: now } });
    } else {
      await prisma.destination.updateMany({
        where: { id: dest.id, status: "PENDING" },
        data: { status, lastErrorCode: "MISSED", lastError: `Heure prévue dépassée de ${Math.round(late / 60_000)} min (worker arrêté).` },
      });
    }
    await recomputePostStatus(dest.postId);
    await audit({ actor: "worker", action: "destination.missed", entity: "destination", entityId: dest.id, meta: { policy: missedPolicy, lateMs: late } });
  }
  return missed.length;
}

/** Destinations à exécuter dans l'horizon donné (les plus proches d'abord). */
export function dueDestinations(horizonMs: number, now = new Date()) {
  return prisma.destination.findMany({
    where: {
      status: { in: ["PENDING", "RETRY_WAIT", "PROCESSING", "UNCERTAIN"] },
      nextAttemptAt: { lte: new Date(now.getTime() + horizonMs) },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    select: { id: true, status: true, attempts: true, nextAttemptAt: true },
    orderBy: { nextAttemptAt: "asc" },
    take: 500,
  });
}

export async function heartbeat(workerId: string, startedAt: Date): Promise<void> {
  await prisma.workerHeartbeat.upsert({ where: { workerId }, create: { workerId, startedAt, lastSeenAt: new Date() }, update: { lastSeenAt: new Date() } });
}

/** État du worker vu par l'interface : actif si un battement date de moins de 30 s. */
export async function workerHealth(now = new Date()) {
  const latest = await prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" } });
  return { alive: Boolean(latest && now.getTime() - latest.lastSeenAt.getTime() < 30_000), lastSeenAt: latest?.lastSeenAt ?? null };
}
