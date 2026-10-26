import { prisma, type Prisma } from "@app/db";
import { audit } from "../audit";
import { getConnector, type ValidationIssue } from "../connectors";
import { getPost } from "../posts/service";
import { zonedToUtc, type Disambiguation, type ZonedResult } from "../time";
import { prepareContent } from "./content";
import { aggregateStatus } from "./status";

/** Délai minimal entre la demande et une date programmée (sinon : publier maintenant). */
const MIN_LEAD_MS = 60_000;

export type When = { mode: "now" } | { mode: "at"; local: string; timezone: string; disambiguation?: Disambiguation };

export type ScheduleOutcome =
  | { ok: true; postId: string; scheduledAt: Date; destinationIds: string[] }
  | { ok: false; code: "NOT_DRAFT" | "NO_ACCOUNT" | "ACCOUNT_NOT_READY" | "INVALID_CONTENT" | "TIME" | "PAST" | "VERSION_MISMATCH"; message: string; issues?: { accountId: string; issues: ValidationIssue[] }[]; time?: ZonedResult };

/**
 * Verrou de ligne sur la publication. Toujours pris AVANT de modifier ses destinations : ordre
 * unique (publication puis destinations), donc pas d'interblocage entre worker et interface.
 */
export async function lockPost(tx: Prisma.TransactionClient, postId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${postId}::uuid FOR UPDATE`;
}

/** Recalcule l'état global. Sous verrou : deux destinations qui se terminent ensemble se voient. */
export async function recomputePostStatus(postId: string, tx?: Prisma.TransactionClient): Promise<void> {
  if (!tx) return prisma.$transaction((t) => recomputePostStatus(postId, t));
  await lockPost(tx, postId);
  const destinations = await tx.destination.findMany({ where: { postId }, select: { status: true } });
  await tx.post.update({ where: { id: postId }, data: { status: aggregateStatus(destinations.map((d) => d.status)) } });
}

/** Valide le contenu d'une publication pour chaque compte, sans rien programmer. */
export async function validatePostForAccounts(postId: string, accountIds: string[]) {
  const post = await getPost(postId);
  if (!post) throw new Error("Publication introuvable.");
  const accounts = await prisma.connectedAccount.findMany({ where: { id: { in: accountIds } } });
  return Promise.all(
    accounts.map(async (account) => {
      const prepared = await prepareContent(post, account);
      return { accountId: account.id, platform: account.platform, caption: prepared.caption, content: prepared.content, issues: prepared.issues };
    }),
  );
}

/**
 * Programme (ou publie immédiatement) une publication vers des comptes. Cette action vaut
 * autorisation explicite pour la version actuelle du contenu, ces comptes et cette date.
 */
export async function schedulePost(
  postId: string,
  accountIds: string[],
  when: When,
  actor: string,
  options: { now?: Date; expectedVersion?: number } = {},
): Promise<ScheduleOutcome> {
  const now = options.now ?? new Date();
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return { ok: false, code: "NO_ACCOUNT", message: "Choisis au moins un compte." };

  let scheduledAt = now;
  if (when.mode === "at") {
    const time = zonedToUtc(when.local, when.timezone, when.disambiguation);
    if (!time.ok) {
      const message = {
        INVALID: "Date invalide.",
        NONEXISTENT: "Cette heure n'existe pas ce jour-là (passage à l'heure d'été).",
        AMBIGUOUS: "Cette heure existe deux fois ce jour-là (passage à l'heure d'hiver) : précise laquelle.",
      }[time.reason];
      return { ok: false, code: "TIME", message, time };
    }
    if (time.utc.getTime() < now.getTime() + MIN_LEAD_MS) return { ok: false, code: "PAST", message: "La date doit être dans le futur (au moins 1 minute)." };
    scheduledAt = time.utc;
  }

  const post = await getPost(postId);
  if (!post) throw new Error("Publication introuvable.");
  if (post.status !== "DRAFT") return { ok: false, code: "NOT_DRAFT", message: "Seul un brouillon peut être programmé." };
  if (options.expectedVersion !== undefined && options.expectedVersion !== post.version) {
    return { ok: false, code: "VERSION_MISMATCH", message: `Le contenu a changé (version actuelle ${post.version}, version vue ${options.expectedVersion}) : relis-le avant d'autoriser.` };
  }

  const accounts = await prisma.connectedAccount.findMany({ where: { id: { in: ids } } });
  if (accounts.length !== ids.length) return { ok: false, code: "NO_ACCOUNT", message: "Compte introuvable." };
  const notReady = accounts.filter((a) => a.status !== "READY");
  if (notReady.length > 0) {
    return { ok: false, code: "ACCOUNT_NOT_READY", message: `Compte non prêt : ${notReady.map((a) => a.displayName).join(", ")}.` };
  }
  const notImmediate = accounts.filter((a) => !getConnector(a.connector).capabilities(a).immediatePublish);
  if (notImmediate.length > 0) {
    return { ok: false, code: "ACCOUNT_NOT_READY", message: `Publication automatique impossible (mode manuel) : ${notImmediate.map((a) => a.displayName).join(", ")}.` };
  }

  const prepared = new Map(await Promise.all(accounts.map(async (a) => [a.id, await prepareContent(post, a)] as const)));
  const issues = accounts.map((a) => ({ accountId: a.id, issues: prepared.get(a.id)!.issues })).filter((r) => r.issues.length > 0);
  if (issues.length > 0) return { ok: false, code: "INVALID_CONTENT", message: "Le contenu ne respecte pas les limites d'au moins un réseau.", issues };

  const destinationIds = await prisma.$transaction(async (tx) => {
    // Verrou : deux demandes simultanées ne peuvent pas programmer deux fois la même publication.
    await lockPost(tx, postId);
    const current = await tx.post.findUniqueOrThrow({ where: { id: postId } });
    if (current.status !== "DRAFT" || current.version !== post.version) throw new Error("La publication a changé pendant la programmation : réessaie.");
    const created = await Promise.all(
      accounts.map((account) =>
        tx.destination.create({
          data: {
            postId,
            accountId: account.id,
            platform: account.platform,
            idempotencyKey: `${postId}:${account.id}:v${post.version}`,
            contentVersion: post.version,
            authorizedBy: actor,
            scheduledAt,
            // Programmation native : envoi immédiat, la plateforme publiera à l'heure prévue (PC éteint possible).
            nextAttemptAt: getConnector(account.connector).usesNativeScheduling?.(prepared.get(account.id)!.content.options, scheduledAt, now) ? now : scheduledAt,
          },
        }),
      ),
    );
    await tx.post.update({ where: { id: postId }, data: { status: "SCHEDULED", scheduledAt } });
    await audit(
      { actor, action: when.mode === "now" ? "post.publish_now" : "post.schedule", entity: "post", entityId: postId, meta: { version: post.version, scheduledAt: scheduledAt.toISOString(), accounts: ids } },
      tx,
    );
    return created.map((d) => d.id);
  });
  return { ok: true, postId, scheduledAt, destinationIds };
}

/**
 * Annule les destinations pas encore commencées. Si rien n'a été envoyé, la publication redevient
 * un brouillon modifiable ; sinon les destinations déjà traitées restent intactes.
 */
export async function cancelSchedule(postId: string, actor: string): Promise<{ cancelled: number; backToDraft: boolean; remoteErrors: string[] }> {
  const remoteErrors = await cancelRemoteSchedules(postId, actor);
  const result = await prisma.$transaction(async (tx) => {
    await lockPost(tx, postId);
    // Condition sur l'état : une destination déjà prise par le worker n'est jamais annulée en cours d'envoi.
    const { count } = await tx.destination.updateMany({
      where: { postId, status: { in: ["PENDING", "RETRY_WAIT", "MISSED"] }, lockedBy: null },
      data: { status: "CANCELLED", nextAttemptAt: new Date() },
    });
    const remaining = await tx.destination.findMany({ where: { postId }, select: { status: true, attempts: true } });
    const untouched = remaining.every((d) => d.status === "CANCELLED" && d.attempts === 0);
    if (untouched) {
      await tx.destination.deleteMany({ where: { postId } });
      await tx.post.update({ where: { id: postId }, data: { status: "DRAFT", scheduledAt: null } });
    } else {
      await recomputePostStatus(postId, tx);
    }
    await audit({ actor, action: "post.cancel_schedule", entity: "post", entityId: postId, meta: { cancelled: count, backToDraft: untouched } }, tx);
    return { cancelled: count, backToDraft: untouched };
  });
  return { ...result, remoteErrors };
}

/**
 * Destinations déjà transmises et programmées chez la plateforme : annulation distante d'abord
 * (la vidéo reste privée), puis état « Annulée ». En cas d'échec, l'état distant est conservé.
 */
async function cancelRemoteSchedules(postId: string, actor: string): Promise<string[]> {
  const remote = await prisma.destination.findMany({ where: { postId, status: "REMOTE_SCHEDULED", remoteId: { not: null } }, include: { account: true } });
  if (remote.length === 0) return [];
  const post = await getPost(postId);
  const errors: string[] = [];
  for (const dest of remote) {
    const connector = getConnector(dest.account.connector);
    try {
      if (!connector.cancel || !post) throw new Error("Annulation distante non prise en charge.");
      const prepared = await prepareContent(post, dest.account);
      await connector.cancel({
        destinationId: dest.id,
        idempotencyKey: dest.idempotencyKey,
        attempt: dest.attempts,
        account: dest.account,
        content: prepared.content,
        caption: prepared.caption,
        media: [],
        remoteId: dest.remoteId!,
        scheduledAt: dest.scheduledAt,
        state: dest.connectorState as Record<string, unknown>,
        saveState: async () => {},
      });
      await prisma.$transaction(async (tx) => {
        await lockPost(tx, postId);
        await tx.destination.updateMany({
          where: { id: dest.id, status: "REMOTE_SCHEDULED" },
          data: { status: "CANCELLED", lastErrorCode: null, lastError: "Programmation annulée sur la plateforme ; le contenu y est conservé en privé." },
        });
      });
      await audit({ actor, action: "destination.remote_cancel", entity: "destination", entityId: dest.id });
    } catch (error) {
      errors.push(`${dest.account.displayName} : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors;
}

export class DestinationActionError extends Error {}

/** Nouvelle tentative manuelle d'une destination en échec ou manquée (nouvelle date possible). */
export async function retryDestination(id: string, actor: string, at: Date = new Date()): Promise<void> {
  const { postId } = await prisma.destination.findUniqueOrThrow({ where: { id }, select: { postId: true } });
  await prisma.$transaction(async (tx) => {
    await lockPost(tx, postId);
    const { count } = await tx.destination.updateMany({
      where: { id, status: { in: ["FAILED", "MISSED"] } },
      data: { status: "RETRY_WAIT", nextAttemptAt: at, attempts: 0, lastError: null, lastErrorCode: null },
    });
    if (count === 0) throw new DestinationActionError("Seule une destination en échec ou manquée peut être relancée.");
    await recomputePostStatus(postId, tx);
    await audit({ actor, action: "destination.retry", entity: "destination", entityId: id, meta: { at: at.toISOString() } }, tx);
  });
}

/**
 * Résout manuellement un résultat incertain : `published` si tu as constaté la publication,
 * `retry` pour renvoyer (risque de doublon assumé explicitement).
 */
export async function resolveUncertain(id: string, decision: "published" | "retry", actor: string, url?: string): Promise<void> {
  const { postId } = await prisma.destination.findUniqueOrThrow({ where: { id }, select: { postId: true } });
  await prisma.$transaction(async (tx) => {
    await lockPost(tx, postId);
    const data: Prisma.DestinationUpdateManyMutationInput =
      decision === "published"
        ? { status: "PUBLISHED", publishedAt: new Date(), remoteUrl: url ?? null, lastError: null, lastErrorCode: null }
        : { status: "RETRY_WAIT", nextAttemptAt: new Date(), lastError: null, lastErrorCode: null };
    const { count } = await tx.destination.updateMany({ where: { id, status: "UNCERTAIN" }, data });
    if (count === 0) throw new DestinationActionError("Cette destination n'est pas dans un état incertain.");
    await recomputePostStatus(postId, tx);
    await audit({ actor, action: `destination.uncertain_${decision}`, entity: "destination", entityId: id }, tx);
  });
}

export function listDestinations(where: Prisma.DestinationWhereInput = {}, take = 200) {
  return prisma.destination.findMany({
    where,
    take,
    orderBy: { scheduledAt: "desc" },
    include: { account: true, post: { select: { id: true, title: true, timezone: true } }, history: { orderBy: { startedAt: "desc" }, take: 10 } },
  });
}

export function listAccounts() {
  return prisma.connectedAccount.findMany({ orderBy: [{ platform: "asc" }, { displayName: "asc" }] });
}

/** Ajoute un compte du connecteur de simulation (jamais un réseau réel). */
export async function createTestAccount(displayName: string, actor: string) {
  const account = await prisma.connectedAccount.create({
    data: { connector: "test", platform: "TEST", externalId: crypto.randomUUID(), displayName: displayName.trim().slice(0, 80) || "Compte de test" },
  });
  await audit({ actor, action: "account.create_test", entity: "account", entityId: account.id });
  return account;
}

/** Remet un compte en état prêt (simulation d'une reconnexion pour le connecteur de test). */
export async function reconnectTestAccount(id: string, actor: string) {
  const account = await prisma.connectedAccount.update({ where: { id, connector: "test" }, data: { status: "READY", statusDetail: null, rateLimitedUntil: null } });
  await audit({ actor, action: "account.reconnect", entity: "account", entityId: id });
  return account;
}
