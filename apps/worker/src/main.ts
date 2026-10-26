/**
 * Worker de publication. PostgreSQL est la source de vérité : à chaque cycle, le répartiteur lit
 * les destinations dues et (re)crée les jobs BullMQ correspondants. Après un redémarrage, la file
 * se reconstruit donc d'elle-même, et un job en double est sans effet (prise atomique en base).
 */
import { writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { applyMissedPolicy, dueDestinations, executeDestination, heartbeat, recoverInterrupted } from "@app/core/scheduling/executor";
import { runNextOperation } from "@app/core/operations";
import { prisma } from "@app/db";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);
const TICK_MS = 5_000;
/** Horizon de planification : les jobs à moins d'une minute sont placés en file avec un délai. */
const HORIZON_MS = 60_000;
const QUEUE = "publications";

const workerId = `${hostname()}-${process.pid}`;
const startedAt = new Date();
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUE, { connection });

const log = (message: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), worker: workerId, message, ...extra }));

const worker = new Worker<{ destinationId: string }>(
  QUEUE,
  async (job) => {
    const result = await executeDestination(job.data.destinationId, workerId);
    if (result !== "skipped") log("destination traitée", { destinationId: job.data.destinationId, result });
    return result;
  },
  { connection, concurrency: CONCURRENCY },
);
worker.on("failed", (job, error) => log("job en erreur", { destinationId: job?.data.destinationId, error: error.message }));

/** Fichier de vie pour le healthcheck Docker (mis à jour à chaque cycle réussi). */
const HEALTH_FILE = path.join(tmpdir(), "worker-heartbeat");

async function tick(): Promise<void> {
  await heartbeat(workerId, startedAt);
  await writeFile(HEALTH_FILE, new Date().toISOString());
  const recovered = await recoverInterrupted();
  const missed = await applyMissedPolicy();
  if (recovered || missed) log("reprise", { recovered, missed });

  const now = Date.now();
  for (const d of await dueDestinations(HORIZON_MS)) {
    // Identifiant déterministe : BullMQ ignore un job déjà présent avec le même identifiant.
    await queue.add(
      "execute",
      { destinationId: d.id },
      {
        jobId: `${d.id}-${d.status}-${d.attempts}-${d.nextAttemptAt.getTime()}`,
        delay: Math.max(0, d.nextAttemptAt.getTime() - now),
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 24 * 3600 },
      },
    );
  }
}

/** Opérations longues (imports) : exécutées une à une, hors du cycle de répartition. */
let operationsBusy = false;
async function drainOperations(): Promise<void> {
  if (operationsBusy) return;
  operationsBusy = true;
  try {
    let op;
    while (running && (op = await runNextOperation())) log("opération terminée", { operationId: op.id, kind: op.kind, status: op.status });
  } catch (error) {
    log("opération en erreur", { error: error instanceof Error ? error.message : String(error) });
  } finally {
    operationsBusy = false;
  }
}

let running = true;
async function loop(): Promise<void> {
  log("démarrage", { concurrency: CONCURRENCY });
  // Battements d'anciens processus (arrêts brutaux) : sans intérêt au-delà d'une heure.
  await prisma.workerHeartbeat.deleteMany({ where: { lastSeenAt: { lt: new Date(Date.now() - 3_600_000) } } });
  while (running) {
    try {
      await tick();
      void drainOperations();
    } catch (error) {
      log("cycle en erreur", { error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

async function shutdown(signal: string): Promise<void> {
  log("arrêt demandé", { signal });
  running = false;
  // Laisse les envois en cours se terminer (le bail en base couvre un arrêt brutal).
  await worker.close();
  await queue.close();
  await connection.quit();
  await prisma.workerHeartbeat.deleteMany({ where: { workerId } });
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
void loop();
