/**
 * Tests de CONTRAT du connecteur YouTube : un faux serveur reproduit les échanges documentés par
 * Google (OAuth, upload reprenable, statuts). Ils ne prouvent pas le fonctionnement contre la vraie
 * API, qui nécessite tes identifiants (voir docs/youtube.md).
 */
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

/* eslint-disable @typescript-eslint/no-explicit-any -- corps JSON libres échangés avec le faux serveur */

type Video = { id: string; size: number; received: number; metadata: Record<string, any>; status: Record<string, unknown> };

/** Faux serveur Google : OAuth, chaînes, upload reprenable, vidéos. */
function fakeGoogle() {
  const state = {
    challenges: [] as string[],
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl",
    sessions: new Map<string, Video>(),
    videos: new Map<string, Video>(),
    revokedRefresh: false,
    dropUploadOnce: false,
    uploadError: null as null | { status: number; reason: string },
    updates: [] as Record<string, any>[],
    tokensSeen: [] as string[],
    initCount: 0,
    /** Envois repris à partir d'un octet > 0 (Content-Range). */
    resumedFrom: [] as number[],
  };
  const json = (res: import("node:http").ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) =>
    res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));
  const readBody = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    const auth = req.headers.authorization ?? "";
    if (auth) state.tokensSeen.push(auth.replace("Bearer ", ""));

    if (url.pathname === "/token") {
      const form = new URLSearchParams((await readBody(req)).toString());
      if (form.get("grant_type") === "authorization_code") {
        const challenge = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
        if (form.get("code") !== "good-code" || !state.challenges.includes(challenge)) return json(res, 400, { error: "invalid_grant" });
        return json(res, 200, { access_token: "at-initial", refresh_token: "rt-secret-123", expires_in: 3600, scope: state.scope });
      }
      if (state.revokedRefresh) return json(res, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
      return json(res, 200, { access_token: "at-refreshed", expires_in: 3600 });
    }
    if (auth === "Bearer at-expired") return json(res, 401, { error: { message: "Invalid Credentials", errors: [{ reason: "authError" }] } });

    if (url.pathname === "/api/channels") return json(res, 200, { items: [{ id: "UC-test", snippet: { title: "Ma chaîne" }, status: { longUploadsStatus: "allowed" } }] });

    if (url.pathname === "/upload" && req.method === "POST") {
      if (state.uploadError) return json(res, state.uploadError.status, { error: { message: "refusé", errors: [{ reason: state.uploadError.reason }] } });
      state.initCount++;
      const id = `s${state.initCount}`;
      state.sessions.set(id, { id: "", size: Number(req.headers["x-upload-content-length"]), received: 0, metadata: JSON.parse((await readBody(req)).toString()), status: {} });
      return res.writeHead(200, { Location: `http://${req.headers.host}/session/${id}` }).end();
    }

    if (url.pathname.startsWith("/session/") && req.method === "PUT") {
      const session = state.sessions.get(url.pathname.split("/").pop()!);
      if (!session) return json(res, 404, {});
      const range = req.headers["content-range"] ?? "";
      const finish = () => {
        session.id ||= `vid-${randomBytes(4).toString("hex")}`;
        session.status = { uploadStatus: "uploaded" };
        state.videos.set(session.id, session);
        return json(res, 201, { id: session.id, status: session.status });
      };
      if (range.startsWith("bytes */")) {
        if (session.received === session.size) return finish();
        return res.writeHead(308, session.received > 0 ? { Range: `bytes=0-${session.received - 1}` } : {}).end();
      }
      const start = range ? Number(/bytes (\d+)-/.exec(range)![1]) : 0;
      if (start !== session.received) return json(res, 400, { error: { message: "non contigu" } });
      if (start > 0) state.resumedFrom.push(start);
      let dropped = false;
      for await (const chunk of req) {
        session.received += (chunk as Buffer).length;
        if (state.dropUploadOnce && session.received >= session.size / 2) {
          state.dropUploadOnce = false;
          dropped = true;
          req.socket.destroy();
          break;
        }
      }
      if (dropped) return;
      return finish();
    }

    if (url.pathname === "/api/videos" && req.method === "GET") {
      const video = state.videos.get(url.searchParams.get("id")!);
      return json(res, 200, { items: video ? [{ id: video.id, status: video.status }] : [] });
    }
    if (url.pathname === "/api/videos" && req.method === "PUT") {
      const body = JSON.parse((await readBody(req)).toString());
      state.updates.push(body);
      const video = state.videos.get(body.id);
      if (video) video.status = { ...video.status, ...body.status, publishAt: undefined };
      return json(res, 200, body);
    }
    json(res, 404, {});
  });
  return { server, state };
}

describe.skipIf(!enabled)("connecteur YouTube (contrat, faux serveur Google)", async () => {
  const fake = fakeGoogle();
  let base = "";
  await new Promise<void>((r) => fake.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    YOUTUBE_CLIENT_ID: "client-test",
    YOUTUBE_CLIENT_SECRET: "secret-test",
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    GOOGLE_OAUTH_AUTHORIZE_URL: `${base}/authorize`,
    GOOGLE_OAUTH_TOKEN_URL: `${base}/token`,
    YOUTUBE_API_URL: `${base}/api`,
    YOUTUBE_UPLOAD_URL: `${base}/upload`,
  });

  const { prisma } = await import("@app/db");
  const oauth = await import("./oauth");
  const { youtubeConnector } = await import("./youtube");
  const { encryptJson } = await import("../crypto");
  const posts = await import("../posts/service");
  const scheduling = await import("../scheduling/service");
  const executor = await import("../scheduling/executor");
  const { importMedia } = await import("../media");

  const dir = mkdtempSync(path.join(os.tmpdir(), "yt-"));
  let videoId = "";
  let imageId = "";
  let account: Awaited<ReturnType<typeof oauth.completeAuthorization>>;
  const W = "worker-yt";
  const later = (ms: number) => new Date(Date.now() + ms);

  async function connect() {
    const url = new URL(await oauth.startAuthorization("youtube", "test"));
    fake.state.challenges.push(url.searchParams.get("code_challenge")!);
    return { url, state: url.searchParams.get("state")! };
  }

  beforeAll(async () => {
    const file = path.join(dir, "clip");
    // ~600 Ko : assez pour couper l'upload en deux.
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=6", "-pix_fmt", "yuv420p", "-b:v", "800k", "-f", "mp4", file]);
    videoId = (await importMedia(createReadStream(file), "clip.mp4", "test")).id;
    const image = path.join(dir, "img");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:size=64x64", "-frames:v", "1", "-f", "image2", "-c:v", "png", image]);
    imageId = (await importMedia(createReadStream(image), "img.png", "test")).id;
  });
  afterAll(async () => {
    fake.server.close();
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    Object.assign(fake.state, { revokedRefresh: false, dropUploadOnce: false, uploadError: null });
  });

  async function youtubeDraft(options: Record<string, string | boolean> = { madeForKids: false }, extra: Record<string, unknown> = {}) {
    return posts.createDraft({ title: "Ma vidéo", body: "Description", hashtags: ["tuto", "studio"], mediaIds: [videoId], variants: [{ platform: "YOUTUBE", options }], ...extra }, "test");
  }
  async function scheduleNow(postId: string) {
    const r = await scheduling.schedulePost(postId, [account.id], { mode: "now" }, "test");
    if (!r.ok) throw new Error(`${r.code} ${r.message} ${JSON.stringify(r.issues)}`);
    return r.destinationIds[0]!;
  }
  const dest = (id: string) => prisma.destination.findUniqueOrThrow({ where: { id } });

  describe("OAuth", () => {
    it("construit une URL d'autorisation avec state, PKCE S256 et accès hors ligne", async () => {
      const { url } = await connect();
      expect(url.origin + url.pathname).toBe(`${base}/authorize`);
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        client_id: "client-test",
        response_type: "code",
        access_type: "offline",
        code_challenge_method: "S256",
        redirect_uri: oauth.redirectUriFor("youtube"),
      });
      expect(url.searchParams.get("scope")).toContain("youtube.upload");
    });

    it("refuse un state inconnu et n'accepte un state qu'une seule fois", async () => {
      await expect(oauth.completeAuthorization("youtube", { code: "good-code", state: "faux" }, "test")).rejects.toThrow(oauth.OAuthFlowError);
      const { state } = await connect();
      account = await oauth.completeAuthorization("youtube", { code: "good-code", state }, "test");
      await expect(oauth.completeAuthorization("youtube", { code: "good-code", state }, "test")).rejects.toThrow(oauth.OAuthFlowError);
    });

    it("enregistre le compte avec des jetons chiffrés", async () => {
      expect(account).toMatchObject({ platform: "YOUTUBE", externalId: "UC-test", displayName: "Ma chaîne", status: "READY" });
      const raw = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: account.id } });
      expect(raw.credentials).toBeTruthy();
      expect(raw.credentials).not.toContain("rt-secret-123");
      expect(raw.credentials).not.toContain("at-initial");
    });

    it("signale une permission manquante si une portée n'est pas accordée", async () => {
      fake.state.scope = "https://www.googleapis.com/auth/youtube.upload";
      const { state } = await connect();
      const partial = await oauth.completeAuthorization("youtube", { code: "good-code", state }, "test");
      expect(partial.status).toBe("PERMISSION_MISSING");
      fake.state.scope = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl";
      const { state: again } = await connect();
      account = await oauth.completeAuthorization("youtube", { code: "good-code", state: again }, "test");
      expect(account.status).toBe("READY");
    });

    it("rapporte un refus de l'utilisateur", async () => {
      await expect(oauth.completeAuthorization("youtube", { error: "access_denied" }, "test")).rejects.toThrow("Autorisation refusée");
    });
  });

  describe("validation", () => {
    it("exige la déclaration « conçue pour les enfants »", async () => {
      const post = await youtubeDraft({});
      const r = await scheduling.schedulePost(post.id, [account.id], { mode: "now" }, "test");
      expect(r).toMatchObject({ ok: false, code: "INVALID_CONTENT" });
    });

    it("refuse une image, un titre avec < >, un titre de plus de 100 caractères", async () => {
      for (const extra of [{ mediaIds: [imageId] }, { title: "Titre <b>" }, { title: "x".repeat(101) }]) {
        const post = await youtubeDraft({ madeForKids: false }, extra);
        expect(await scheduling.schedulePost(post.id, [account.id], { mode: "now" }, "test")).toMatchObject({ ok: false, code: "INVALID_CONTENT" });
      }
    });
  });

  describe("publication", () => {
    it("upload reprenable, puis distinction upload / traitement / publication", async () => {
      const id = await scheduleNow((await youtubeDraft()).id);
      expect(await executor.executeDestination(id, W)).toBe("PROCESSING");
      const session = [...fake.state.sessions.values()].at(-1)!;
      expect(session.metadata).toMatchObject({
        snippet: { title: "Ma vidéo", description: "Description", tags: ["tuto", "studio"], categoryId: "22" },
        status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
      });
      expect(session.received).toBe(session.size);

      // Toujours en traitement chez YouTube.
      expect(await executor.executeDestination(id, W, later(31_000))).toBe("PROCESSING");
      fake.state.videos.get(session.id)!.status = { uploadStatus: "processed", privacyStatus: "private" };
      expect(await executor.executeDestination(id, W, later(62_000))).toBe("PUBLISHED");
      expect((await dest(id)).remoteUrl).toBe(`https://www.youtube.com/watch?v=${session.id}`);
    });

    it("reprend un upload coupé au milieu sans créer de seconde vidéo", async () => {
      fake.state.dropUploadOnce = true;
      fake.state.resumedFrom.length = 0;
      const before = fake.state.initCount;
      const id = await scheduleNow((await youtubeDraft()).id);
      expect(await executor.executeDestination(id, W)).toBe("PROCESSING");
      expect(fake.state.initCount).toBe(before + 1);
      const session = [...fake.state.sessions.values()].at(-1)!;
      expect(session.received).toBe(session.size);
      // La reprise est partie du milieu du fichier, pas du début.
      expect(fake.state.resumedFrom).toHaveLength(1);
      expect(fake.state.resumedFrom[0]).toBeGreaterThan(session.size / 3);
    });

    it("après un arrêt pendant l'upload, retrouve la vidéo par la session enregistrée", async () => {
      const id = await scheduleNow((await youtubeDraft()).id);
      expect(await executor.executeDestination(id, W)).toBe("PROCESSING");
      const d = await dest(id);
      const videoIdRemote = d.remoteId!;
      const sessionUrl = [...fake.state.sessions.entries()].at(-1)!;
      // Simule un arrêt après l'envoi des octets mais avant l'enregistrement du résultat.
      await prisma.destination.update({
        where: { id },
        data: { status: "PUBLISHING", remoteId: null, lockedBy: "mort", lockedUntil: new Date(Date.now() - 1000), connectorState: { uploadUrl: `${base}/session/${sessionUrl[0]}`, uploadSize: sessionUrl[1].size } },
      });
      const sessionsBefore = fake.state.initCount;
      await executor.recoverInterrupted();
      expect((await dest(id)).status).toBe("UNCERTAIN");
      expect(await executor.executeDestination(id, W, later(executor.RECONCILE_DELAY_MS + 1000))).toBe("PROCESSING");
      expect((await dest(id)).remoteId).toBe(videoIdRemote);
      expect(fake.state.initCount).toBe(sessionsBefore);
    });

    it("rafraîchit un jeton expiré avant l'appel", async () => {
      await prisma.connectedAccount.update({ where: { id: account.id }, data: { credentials: encryptJson({ accessToken: "at-expired", refreshToken: "rt-secret-123", expiresAt: Date.now() - 1000 }) } });
      fake.state.tokensSeen.length = 0;
      const id = await scheduleNow((await youtubeDraft()).id);
      expect(await executor.executeDestination(id, W)).toBe("PROCESSING");
      expect(fake.state.tokensSeen).not.toContain("at-expired");
      expect(fake.state.tokensSeen).toContain("at-refreshed");
    });

    it("autorisation révoquée : échec explicite et compte à reconnecter", async () => {
      await prisma.connectedAccount.update({ where: { id: account.id }, data: { credentials: encryptJson({ accessToken: "x", refreshToken: "rt", expiresAt: 0 }) } });
      fake.state.revokedRefresh = true;
      const id = await scheduleNow((await youtubeDraft()).id);
      expect(await executor.executeDestination(id, W)).toBe("FAILED");
      expect((await dest(id)).lastErrorCode).toBe("INVALID_GRANT");
      expect((await prisma.connectedAccount.findUniqueOrThrow({ where: { id: account.id } })).status).toBe("RECONNECT_REQUIRED");
      // Reconnexion pour la suite des tests.
      const { state } = await connect();
      account = await oauth.completeAuthorization("youtube", { code: "good-code", state }, "test");
    });

    it("quota d'uploads épuisé : attente jusqu'à la réinitialisation, sans échec définitif", async () => {
      fake.state.uploadError = { status: 403, reason: "uploadLimitExceeded" };
      const id = await scheduleNow((await youtubeDraft()).id);
      expect(await executor.executeDestination(id, W)).toBe("RETRY_WAIT");
      const d = await dest(id);
      expect(d.lastErrorCode).toBe("QUOTA_EXCEEDED");
      expect(d.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
      await prisma.connectedAccount.update({ where: { id: account.id }, data: { rateLimitedUntil: null } });
    });

    it("vidéo refusée par YouTube : échec avec la raison", async () => {
      const id = await scheduleNow((await youtubeDraft()).id);
      await executor.executeDestination(id, W);
      fake.state.videos.get((await dest(id)).remoteId!)!.status = { uploadStatus: "rejected", rejectionReason: "duplicate" };
      expect(await executor.executeDestination(id, W, later(31_000))).toBe("FAILED");
      expect((await dest(id)).lastErrorCode).toBe("REJECTED_duplicate");
    });
  });

  describe("programmation native", () => {
    it("envoie tout de suite en privé avec publishAt, puis annule sur YouTube", async () => {
      const post = await youtubeDraft({ madeForKids: false, privacyStatus: "public" });
      const r = await scheduling.schedulePost(post.id, [account.id], { mode: "at", local: "2030-05-01T18:00", timezone: "Europe/Rome" }, "test");
      expect(r.ok).toBe(true);
      const d = await prisma.destination.findFirstOrThrow({ where: { postId: post.id } });
      expect(d.nextAttemptAt.getTime()).toBeLessThan(Date.now() + 5_000);

      expect(await executor.executeDestination(d.id, W)).toBe("PROCESSING");
      const session = [...fake.state.sessions.values()].at(-1)!;
      expect(session.metadata.status).toMatchObject({ privacyStatus: "private", publishAt: "2030-05-01T16:00:00.000Z" });

      fake.state.videos.get(session.id)!.status = { uploadStatus: "processed", privacyStatus: "private", publishAt: "2030-05-01T16:00:00.000Z" };
      expect(await executor.executeDestination(d.id, W, later(31_000))).toBe("REMOTE_SCHEDULED");
      expect(await prisma.post.findUniqueOrThrow({ where: { id: post.id } }).then((p) => p.status)).toBe("SCHEDULED");

      const cancelled = await scheduling.cancelSchedule(post.id, "test");
      expect(cancelled.remoteErrors).toEqual([]);
      expect(fake.state.updates.at(-1)).toMatchObject({ id: session.id, status: { privacyStatus: "private" } });
      expect(fake.state.updates.at(-1)!.status.publishAt).toBeUndefined();
      expect((await dest(d.id)).status).toBe("CANCELLED");
    });

    it("n'utilise pas la programmation native pour une vidéo privée", async () => {
      const post = await youtubeDraft({ madeForKids: false, privacyStatus: "private" });
      await scheduling.schedulePost(post.id, [account.id], { mode: "at", local: "2030-05-01T18:00", timezone: "Europe/Rome" }, "test");
      const d = await prisma.destination.findFirstOrThrow({ where: { postId: post.id } });
      expect(d.nextAttemptAt.toISOString()).toBe("2030-05-01T16:00:00.000Z");
    });
  });

  it("expose ses capacités, dont la limite de durée selon la chaîne", () => {
    const caps = youtubeConnector.capabilities(account);
    expect(caps).toMatchObject({ nativeScheduling: true, reconciliation: true, contentTypes: ["VIDEO"] });
    expect(caps.limits.videoMaxDurationMs).toBe(12 * 3_600_000);
    expect(youtubeConnector.capabilities().limits.videoMaxDurationMs).toBe(15 * 60_000);
  });
});
