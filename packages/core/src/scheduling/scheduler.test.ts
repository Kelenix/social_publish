import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("programmation et exécution (intégration PostgreSQL)", async () => {
  const { prisma } = await import("@app/db");
  const posts = await import("../posts/service");
  const scheduling = await import("./service");
  const executor = await import("./executor");
  const { updateSettings } = await import("../settings");

  const later = (ms: number) => new Date(Date.now() + ms);
  const W = "worker-test";
  let account: { id: string };

  async function draft(simulate?: string, extra: Record<string, unknown> = {}) {
    return posts.createDraft(
      { title: "Test", body: "Bonjour", variants: [{ platform: "TEST", options: simulate ? { simulate } : {} }], ...extra },
      "test",
    );
  }

  async function scheduleNow(postId: string, accountIds = [account.id]) {
    const result = await scheduling.schedulePost(postId, accountIds, { mode: "now" }, "test");
    if (!result.ok) throw new Error(result.message);
    return result.destinationIds;
  }

  const publications = (destId: string) =>
    prisma.destination.findUniqueOrThrow({ where: { id: destId } }).then((d) => prisma.simulatedPublication.count({ where: { idempotencyKey: d.idempotencyKey } }));
  const dest = (id: string) => prisma.destination.findUniqueOrThrow({ where: { id } });
  const postStatus = async (id: string) => (await prisma.post.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    await updateSettings({ defaultTimezone: "Europe/Rome", missedPolicy: "ASK_RESCHEDULE" }, "test");
  });
  beforeEach(async () => {
    account = await scheduling.createTestAccount("Compte A", "test");
  });
  afterAll(() => prisma.$disconnect());

  describe("programmation", () => {
    it("convertit l'heure locale en UTC et refuse une heure ambiguë sans choix", async () => {
      const post = await draft();
      const ambiguous = await scheduling.schedulePost(post.id, [account.id], { mode: "at", local: "2027-10-31T02:30", timezone: "Europe/Rome" }, "test");
      expect(ambiguous).toMatchObject({ ok: false, code: "TIME" });

      const ok = await scheduling.schedulePost(post.id, [account.id], { mode: "at", local: "2027-10-31T02:30", timezone: "Europe/Rome", disambiguation: "later" }, "test");
      expect(ok).toMatchObject({ ok: true, scheduledAt: new Date("2027-10-31T01:30:00Z") });
      expect(await postStatus(post.id)).toBe("SCHEDULED");
    });

    it("refuse une date passée", async () => {
      const post = await draft();
      expect(await scheduling.schedulePost(post.id, [account.id], { mode: "at", local: "2020-01-01T10:00", timezone: "Europe/Rome" }, "test")).toMatchObject({ ok: false, code: "PAST" });
    });

    it("refuse un contenu hors limites du connecteur", async () => {
      const post = await posts.createDraft({ title: "T", body: "x".repeat(2100), variants: [{ platform: "TEST" }] }, "test");
      const result = await scheduling.schedulePost(post.id, [account.id], { mode: "now" }, "test");
      expect(result).toMatchObject({ ok: false, code: "INVALID_CONTENT" });
    });

    it("refuse un compte sans variante active", async () => {
      const post = await posts.createDraft({ title: "T", variants: [{ platform: "X" }] }, "test");
      expect(await scheduling.schedulePost(post.id, [account.id], { mode: "now" }, "test")).toMatchObject({ ok: false, code: "INVALID_CONTENT" });
    });
  });

  describe("exécution", () => {
    it("publie une fois, même avec deux exécutions concurrentes", async () => {
      const [id] = await scheduleNow((await draft()).id);
      const results = await Promise.all([executor.executeDestination(id!, "w1"), executor.executeDestination(id!, "w2")]);
      expect(results.sort()).toEqual(["PUBLISHED", "skipped"]);
      expect(await publications(id!)).toBe(1);
      expect(await executor.executeDestination(id!, W)).toBe("skipped");
    });

    it("n'exécute pas une destination avant son heure", async () => {
      const post = await draft();
      await scheduling.schedulePost(post.id, [account.id], { mode: "at", local: "2030-01-01T10:00", timezone: "Europe/Rome" }, "test");
      const d = await prisma.destination.findFirstOrThrow({ where: { postId: post.id } });
      expect(await executor.executeDestination(d.id, W)).toBe("skipped");
    });

    it("succès partiel : un échec ne republie pas les destinations réussies", async () => {
      const broken = await prisma.connectedAccount.create({
        data: { connector: "test", platform: "TEST", externalId: crypto.randomUUID(), displayName: "Compte B", metadata: { simulate: "fatal" } },
      });
      const post = await draft();
      const [a, b] = await scheduleNow(post.id, [account.id, broken.id]);
      expect(await executor.executeDestination(a!, W)).toBe("PUBLISHED");
      expect(await executor.executeDestination(b!, W)).toBe("FAILED");
      expect(await postStatus(post.id)).toBe("PARTIAL");

      await prisma.connectedAccount.update({ where: { id: broken.id }, data: { metadata: {} } });
      await scheduling.retryDestination(b!, "test");
      expect(await executor.executeDestination(a!, W)).toBe("skipped");
      expect(await executor.executeDestination(b!, W)).toBe("PUBLISHED");
      expect(await publications(a!)).toBe(1);
      expect(await postStatus(post.id)).toBe("PUBLISHED");
    });

    it("état global exact quand deux destinations se terminent en même temps", async () => {
      const broken = await prisma.connectedAccount.create({
        data: { connector: "test", platform: "TEST", externalId: crypto.randomUUID(), displayName: "Compte B", metadata: { simulate: "fatal" } },
      });
      for (let i = 0; i < 5; i++) {
        const post = await draft();
        const [a, b] = await scheduleNow(post.id, [account.id, broken.id]);
        await Promise.all([executor.executeDestination(a!, "w1"), executor.executeDestination(b!, "w2")]);
        expect(await postStatus(post.id)).toBe("PARTIAL");
      }
    });

    it("réessaie après une erreur temporaire avec backoff", async () => {
      const [id] = await scheduleNow((await draft("retry_once")).id);
      expect(await executor.executeDestination(id!, W)).toBe("RETRY_WAIT");
      const waiting = await dest(id!);
      expect(waiting.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
      expect(await executor.executeDestination(id!, W)).toBe("skipped");
      expect(await executor.executeDestination(id!, W, later(61_000))).toBe("PUBLISHED");
      expect((await dest(id!)).attempts).toBe(2);
    });

    it("respecte Retry-After et bloque le compte pendant le quota", async () => {
      const [id] = await scheduleNow((await draft("rate_limit")).id);
      expect(await executor.executeDestination(id!, W)).toBe("RETRY_WAIT");
      const acc = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: account.id } });
      expect(acc.rateLimitedUntil!.getTime()).toBeGreaterThan(Date.now() + 55_000);
      expect((await dest(id!)).nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 55_000);
    });

    it("abandonne après le nombre maximal de tentatives", async () => {
      const [id] = await scheduleNow((await draft("retryable")).id);
      let status: string = "";
      for (let i = 1; i <= executor.MAX_ATTEMPTS; i++) status = await executor.executeDestination(id!, W, later(i * 3_700_000));
      expect(status).toBe("FAILED");
      expect((await dest(id!)).attempts).toBe(executor.MAX_ATTEMPTS);
    });

    it("jeton expiré : échec explicite et compte à reconnecter", async () => {
      const [id] = await scheduleNow((await draft("auth")).id);
      expect(await executor.executeDestination(id!, W)).toBe("FAILED");
      expect((await dest(id!)).lastErrorCode).toBe("TOKEN_EXPIRED");
      expect((await prisma.connectedAccount.findUniqueOrThrow({ where: { id: account.id } })).status).toBe("RECONNECT_REQUIRED");

      const other = await draft();
      expect(await scheduling.schedulePost(other.id, [account.id], { mode: "now" }, "test")).toMatchObject({ ok: false, code: "ACCOUNT_NOT_READY" });
      await scheduling.reconnectTestAccount(account.id, "test");
      expect(await scheduling.schedulePost(other.id, [account.id], { mode: "now" }, "test")).toMatchObject({ ok: true });
    });

    it("suit un traitement différé jusqu'à la publication", async () => {
      const [id] = await scheduleNow((await draft("processing")).id);
      expect(await executor.executeDestination(id!, W)).toBe("PROCESSING");
      expect(await executor.executeDestination(id!, W, later(2_000))).toBe("PUBLISHED");
      expect(await publications(id!)).toBe(1);
    });

    it("refuse d'envoyer un contenu modifié après autorisation", async () => {
      const post = await draft();
      const [id] = await scheduleNow(post.id);
      await prisma.post.update({ where: { id: post.id }, data: { version: { increment: 1 } } });
      expect(await executor.executeDestination(id!, W)).toBe("FAILED");
      expect((await dest(id!)).lastErrorCode).toBe("CONTENT_CHANGED");
    });
  });

  describe("prévention des doublons", () => {
    it("résultat incertain : rapprochement sans renvoi quand la publication existe", async () => {
      const [id] = await scheduleNow((await draft("uncertain")).id);
      expect(await executor.executeDestination(id!, W)).toBe("UNCERTAIN");
      expect(await executor.executeDestination(id!, W)).toBe("skipped");
      expect(await executor.executeDestination(id!, W, later(executor.RECONCILE_DELAY_MS + 1_000))).toBe("PUBLISHED");
      expect(await publications(id!)).toBe(1);
      const history = await prisma.publicationAttempt.findMany({ where: { destinationId: id }, orderBy: { startedAt: "asc" } });
      expect(history.map((h) => h.outcome)).toEqual(["UNCERTAIN", "RECONCILED"]);
    });

    it("reprise après arrêt brutal pendant l'envoi : vérifie avant de renvoyer", async () => {
      const [id] = await scheduleNow((await draft()).id);
      // Simule un worker arrêté juste après avoir pris la destination, avant toute réponse.
      await prisma.destination.update({ where: { id }, data: { status: "PUBLISHING", attempts: 1, lockedBy: "mort", lockedUntil: new Date(Date.now() - 1_000) } });
      await prisma.publicationAttempt.create({ data: { destinationId: id!, kind: "publish", workerId: "mort" } });

      expect(await executor.recoverInterrupted()).toBeGreaterThanOrEqual(1);
      expect((await dest(id!)).status).toBe("UNCERTAIN");
      // Rien n'a été publié : le rapprochement autorise un nouvel envoi, unique.
      expect(await executor.executeDestination(id!, W, later(executor.RECONCILE_DELAY_MS + 1_000))).toBe("RETRY_WAIT");
      expect(await executor.executeDestination(id!, W)).toBe("PUBLISHED");
      expect(await publications(id!)).toBe(1);
    });

    it("reprise après arrêt quand la plateforme avait déjà publié : aucun doublon", async () => {
      const [id] = await scheduleNow((await draft()).id);
      const d = await dest(id!);
      await prisma.simulatedPublication.create({ data: { accountId: account.id, idempotencyKey: d.idempotencyKey, payload: {} } });
      await prisma.destination.update({ where: { id }, data: { status: "PUBLISHING", attempts: 1, lockedBy: "mort", lockedUntil: new Date(Date.now() - 1_000) } });

      await executor.recoverInterrupted();
      expect(await executor.executeDestination(id!, W, later(executor.RECONCILE_DELAY_MS + 1_000))).toBe("PUBLISHED");
      expect(await publications(id!)).toBe(1);
    });
  });

  describe("publications manquées et annulation", () => {
    it("marque à reprogrammer une publication manquée pendant l'arrêt (politique par défaut)", async () => {
      const post = await draft();
      const [id] = await scheduleNow(post.id);
      const past = new Date(Date.now() - 60 * 60_000);
      await prisma.destination.update({ where: { id }, data: { scheduledAt: past, nextAttemptAt: past } });

      await executor.applyMissedPolicy();
      expect((await dest(id!)).status).toBe("MISSED");
      expect(await postStatus(post.id)).toBe("NEEDS_ATTENTION");
      expect(await executor.executeDestination(id!, W)).toBe("skipped");

      await scheduling.retryDestination(id!, "test");
      expect(await executor.executeDestination(id!, W)).toBe("PUBLISHED");
    });

    it("annule une programmation non commencée : retour au brouillon", async () => {
      const post = await draft();
      await scheduling.schedulePost(post.id, [account.id], { mode: "at", local: "2030-06-01T09:00", timezone: "Europe/Rome" }, "test");
      expect(await scheduling.cancelSchedule(post.id, "test")).toEqual({ cancelled: 1, backToDraft: true });
      expect(await postStatus(post.id)).toBe("DRAFT");
      expect(await prisma.destination.count({ where: { postId: post.id } })).toBe(0);
    });

    it("annulation partielle : les destinations déjà publiées restent intactes", async () => {
      const second = await scheduling.createTestAccount("Compte C", "test");
      const post = await draft();
      const [a, b] = await scheduleNow(post.id, [account.id, second.id]);
      await executor.executeDestination(a!, W);
      expect(await scheduling.cancelSchedule(post.id, "test")).toEqual({ cancelled: 1, backToDraft: false });
      expect((await dest(a!)).status).toBe("PUBLISHED");
      expect((await dest(b!)).status).toBe("CANCELLED");
      expect(await executor.executeDestination(b!, W)).toBe("skipped");
    });
  });
});
