/**
 * Tests de CONTRAT des connecteurs Instagram, LinkedIn et X : un faux serveur reproduit les échanges
 * documentés. Ils ne prouvent pas le fonctionnement contre les vraies API (identifiants requis).
 */
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { escapeLittleText } from "./linkedin";

/* eslint-disable @typescript-eslint/no-explicit-any -- corps JSON libres échangés avec le faux serveur */

describe("format little de LinkedIn", () => {
  it("échappe les caractères réservés mais conserve les hashtags", () => {
    expect(escapeLittleText("Prix (promo) : 5* @moi [x] <b> ~ # seul\n\n#ete_2026 #Lancement")).toBe(
      "Prix \\(promo\\) : 5\\* \\@moi \\[x\\] \\<b\\> \\~ \\# seul\n\n#ete_2026 #Lancement",
    );
    expect(escapeLittleText("a\\b|c{d}e_f")).toBe("a\\\\b\\|c\\{d\\}e\\_f");
  });
});

const enabled = Boolean(process.env.TEST_DATABASE_URL);

type Req = { method: string; path: string; query: URLSearchParams; headers: IncomingMessage["headers"]; body: Buffer };

function fakePlatforms() {
  const calls: Req[] = [];
  const state = {
    igContainers: new Map<string, { status: string; params: Record<string, string> }>(),
    igPublishCount: 0,
    igDropPublishOnce: false,
    igError: null as null | { code: number; message: string },
    liPosts: [] as any[],
    liDropPostOnce: false,
    liVideoStatus: "PROCESSING",
    liRateLimited: false,
    xChallenges: [] as string[],
    xTweets: [] as any[],
    xMediaStatus: [] as string[],
    xError: null as null | { status: number; body: unknown; headers?: Record<string, string> },
    xRefreshCount: 0,
  };
  const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) =>
    res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));
  let seq = 0;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const r: Req = { method: req.method!, path: url.pathname, query: url.searchParams, headers: req.headers, body: Buffer.concat(chunks) };
    calls.push(r);
    const form = () => new URLSearchParams(r.body.toString());
    const p = url.pathname;

    // ---------- Instagram ----------
    if (p === "/ig/token") return json(res, 200, { data: [{ access_token: "ig-short", user_id: "17841", permissions: "instagram_business_basic,instagram_business_content_publish" }] });
    if (p === "/ig/graph/access_token") return json(res, 200, { access_token: "ig-long", token_type: "bearer", expires_in: 5183944 });
    if (p.startsWith("/ig/graph/v26.0/")) {
      const rest = p.slice("/ig/graph/v26.0/".length);
      const params = Object.fromEntries(r.method === "GET" ? url.searchParams : form());
      if (state.igError) return json(res, 400, { error: { ...state.igError, type: "OAuthException" } });
      if (rest === "me") return json(res, 200, { user_id: "17841", username: "studio_test", account_type: "BUSINESS" });
      if (rest === "17841/media") {
        const id = `c${++seq}`;
        state.igContainers.set(id, { status: "IN_PROGRESS", params });
        return json(res, 200, { id });
      }
      if (rest === "17841/media_publish") {
        const c = state.igContainers.get(params.creation_id!);
        if (!c || c.status !== "FINISHED") return json(res, 400, { error: { code: 9007, message: "not ready" } });
        state.igPublishCount++;
        c.status = "PUBLISHED";
        if (state.igDropPublishOnce) {
          state.igDropPublishOnce = false;
          return req.socket.destroy();
        }
        return json(res, 200, { id: `m-${params.creation_id}` });
      }
      if (state.igContainers.has(rest)) return json(res, 200, { id: rest, status_code: state.igContainers.get(rest)!.status });
      if (rest.startsWith("m-")) return json(res, 200, { id: rest, permalink: `https://www.instagram.com/p/${rest}/` });
    }

    // ---------- LinkedIn ----------
    if (p === "/li/token") return json(res, 200, { access_token: "li-token", expires_in: 5_184_000, scope: "openid,profile,w_member_social,w_organization_social,r_organization_admin" });
    if (p === "/li/v2/userinfo") return json(res, 200, { sub: "abc123", name: "Lionel Test" });
    if (p === "/li/rest/organizationAcls") return json(res, 200, { elements: [{ organization: "urn:li:organization:777" }] });
    if (p === "/li/rest/organizations/777") return json(res, 200, { localizedName: "Studio SARL" });
    if (p.startsWith("/li/rest/")) {
      if (r.headers["linkedin-version"] !== "202610" || r.headers["x-restli-protocol-version"] !== "2.0.0") return json(res, 400, { message: "en-têtes manquants" });
      if (state.liRateLimited) return json(res, 429, { message: "Too Many Requests" }, { "Retry-After": "120" });
      if (p === "/li/rest/images" && url.searchParams.get("action") === "initializeUpload") {
        return json(res, 200, { value: { uploadUrl: `http://${req.headers.host}/li/upload/img1`, image: "urn:li:image:IMG1" } });
      }
      if (p === "/li/rest/videos" && url.searchParams.get("action") === "initializeUpload") {
        const size = JSON.parse(r.body.toString()).initializeUploadRequest.fileSizeBytes as number;
        const half = Math.floor(size / 2);
        return json(res, 200, {
          value: {
            video: "urn:li:video:VID1",
            uploadToken: "tok",
            uploadInstructions: [
              { uploadUrl: `http://${req.headers.host}/li/upload/part0`, firstByte: 0, lastByte: half - 1 },
              { uploadUrl: `http://${req.headers.host}/li/upload/part1`, firstByte: half, lastByte: size - 1 },
            ],
          },
        });
      }
      if (p === "/li/rest/videos" && url.searchParams.get("action") === "finalizeUpload") return json(res, 200, {});
      if (p.startsWith("/li/rest/videos/")) return json(res, 200, { id: "urn:li:video:VID1", status: state.liVideoStatus });
      if (p === "/li/rest/posts") {
        const id = `urn:li:share:${++seq}`;
        state.liPosts.push(JSON.parse(r.body.toString()));
        if (state.liDropPostOnce) {
          state.liDropPostOnce = false;
          return req.socket.destroy();
        }
        return res.writeHead(201, { "x-restli-id": id }).end();
      }
    }
    if (p.startsWith("/li/upload/")) return res.writeHead(201, { etag: `etag-${p.split("/").pop()}-${r.body.length}` }).end();

    // ---------- X ----------
    if (p === "/x/2/oauth2/token") {
      const f = form();
      if (r.headers.authorization !== `Basic ${Buffer.from("x-client:x-secret").toString("base64")}`) return json(res, 401, { error: "unauthorized_client" });
      if (f.get("grant_type") === "authorization_code") {
        const challenge = createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url");
        if (!state.xChallenges.includes(challenge)) return json(res, 400, { error: "invalid_request", error_description: "PKCE invalide" });
        return json(res, 200, { access_token: "x-at", refresh_token: "x-rt-1", expires_in: 7200, scope: "tweet.read tweet.write users.read media.write offline.access" });
      }
      state.xRefreshCount++;
      return json(res, 200, { access_token: `x-at-${state.xRefreshCount + 1}`, refresh_token: `x-rt-${state.xRefreshCount + 1}`, expires_in: 7200 });
    }
    if (p === "/x/2/users/me") return json(res, 200, { data: { id: "42", username: "studio", name: "Studio" } });
    if (p.startsWith("/x/2/")) {
      if (state.xError) return json(res, state.xError.status, state.xError.body, state.xError.headers);
      if (p === "/x/2/media/upload/initialize") return json(res, 200, { data: { id: `${++seq}`, media_key: "k", expires_after_secs: 86400 } });
      if (/^\/x\/2\/media\/upload\/\d+\/append$/.test(p)) return res.writeHead(204).end();
      if (/^\/x\/2\/media\/upload\/\d+\/finalize$/.test(p)) {
        const pending = state.xMediaStatus.length > 0;
        return json(res, 200, { data: { id: p.split("/")[5], ...(pending ? { processing_info: { state: "pending", check_after_secs: 1 } } : {}) } });
      }
      if (p === "/x/2/media/upload" && url.searchParams.get("command") === "STATUS") {
        const next = state.xMediaStatus.shift() ?? "succeeded";
        return json(res, 200, { data: { processing_info: { state: next, check_after_secs: 1 } } });
      }
      if (p === "/x/2/tweets") {
        state.xTweets.push(JSON.parse(r.body.toString()));
        return json(res, 201, { data: { id: `t${++seq}`, text: "ok" } });
      }
    }
    json(res, 404, { message: `inconnu ${p}` });
  });
  return { server, state, calls };
}

describe.skipIf(!enabled)("connecteurs Instagram, LinkedIn, X (contrat)", async () => {
  const fake = fakePlatforms();
  await new Promise<void>((r) => fake.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    PUBLIC_BASE_URL: "https://studio.example.com",
    MEDIA_URL_SIGNING_KEY: randomBytes(32).toString("hex"),
    INSTAGRAM_APP_ID: "ig-app",
    INSTAGRAM_APP_SECRET: "ig-secret",
    INSTAGRAM_TOKEN_URL: `${base}/ig/token`,
    INSTAGRAM_GRAPH_URL: `${base}/ig/graph`,
    INSTAGRAM_AUTHORIZE_URL: `${base}/ig/authorize`,
    LINKEDIN_CLIENT_ID: "li-client",
    LINKEDIN_CLIENT_SECRET: "li-secret",
    LINKEDIN_ORGANIZATIONS: "true",
    LINKEDIN_TOKEN_URL: `${base}/li/token`,
    LINKEDIN_API_URL: `${base}/li`,
    LINKEDIN_AUTHORIZE_URL: `${base}/li/authorize`,
    X_CLIENT_ID: "x-client",
    X_CLIENT_SECRET: "x-secret",
    X_API_URL: `${base}/x`,
    X_AUTHORIZE_URL: `${base}/x/authorize`,
  });

  const { prisma } = await import("@app/db");
  const oauth = await import("./oauth");
  const { readCredentials } = await import("./credentials");
  const { encryptJson } = await import("../crypto");
  const posts = await import("../posts/service");
  const scheduling = await import("../scheduling/service");
  const executor = await import("../scheduling/executor");
  const { importMedia } = await import("../media");
  const { instagramConnector } = await import("./instagram");

  const dir = mkdtempSync(path.join(os.tmpdir(), "social-"));
  const media: Record<string, string> = {};
  const W = "worker-social";
  const later = (ms: number) => new Date(Date.now() + ms);
  const dest = (id: string) => prisma.destination.findUniqueOrThrow({ where: { id } });

  async function make(name: string, args: string[]) {
    const file = path.join(dir, name);
    execFileSync("ffmpeg", ["-v", "error", "-y", ...args, file]);
    media[name] = (await importMedia(createReadStream(file), name, "test")).id;
  }
  async function connect(connector: string) {
    const url = new URL(await oauth.startAuthorization(connector, "test"));
    if (url.searchParams.get("code_challenge")) fake.state.xChallenges.push(url.searchParams.get("code_challenge")!);
    return { url, account: await oauth.completeAuthorization(connector, { code: "code", state: url.searchParams.get("state") }, "test") };
  }
  async function scheduleNow(accountId: string, input: Parameters<typeof posts.createDraft>[0]) {
    const post = await posts.createDraft(input, "test");
    const r = await scheduling.schedulePost(post.id, [accountId], { mode: "now" }, "test");
    if (!r.ok) return { post, error: r };
    return { post, id: r.destinationIds[0]! };
  }

  beforeAll(async () => {
    await make("portrait.jpg", ["-f", "lavfi", "-i", "color=c=blue:size=1080x1350", "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg"]);
    await make("story.jpg", ["-f", "lavfi", "-i", "color=c=blue:size=1080x1920", "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg"]);
    await make("image.png", ["-f", "lavfi", "-i", "color=c=red:size=1080x1080", "-frames:v", "1", "-f", "image2", "-c:v", "png"]);
    await make("clip.mp4", ["-f", "lavfi", "-i", "testsrc=size=720x1280:rate=30:duration=4", "-pix_fmt", "yuv420p", "-f", "mp4"]);
  });
  afterAll(async () => {
    fake.server.close();
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    Object.assign(fake.state, { igError: null, igDropPublishOnce: false, liDropPostOnce: false, liRateLimited: false, xError: null, xMediaStatus: [] });
  });

  describe("Instagram", () => {
    let accountId = "";

    it("n'est configuré qu'avec une URL publique HTTPS", () => {
      const saved = process.env.PUBLIC_BASE_URL;
      process.env.PUBLIC_BASE_URL = "http://localhost:3000";
      expect(instagramConnector.isConfigured()).toBe(false);
      process.env.PUBLIC_BASE_URL = saved;
      expect(instagramConnector.isConfigured()).toBe(true);
    });

    it("connecte un compte professionnel avec un jeton longue durée chiffré", async () => {
      const { url, account } = await connect("instagram");
      expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
      expect(account).toMatchObject({ platform: "INSTAGRAM", externalId: "17841", displayName: "@studio_test", status: "READY" });
      expect(readCredentials<{ accessToken: string }>(account).accessToken).toBe("ig-long");
      expect(account.credentials).not.toContain("ig-long");
      accountId = account.id;
    });

    it("refuse un PNG et une image hors ratio 4:5 – 1.91:1", async () => {
      for (const id of [media["image.png"]!, media["story.jpg"]!]) {
        const r = await scheduleNow(accountId, { title: "x", body: "x", mediaIds: [id], variants: [{ platform: "INSTAGRAM" }] });
        expect(r.error).toMatchObject({ code: "INVALID_CONTENT" });
      }
    });

    it("publie une image via une URL HTTPS signée, après traitement du conteneur", async () => {
      const { id } = await scheduleNow(accountId, { title: "Image", body: "Bonjour", hashtags: ["ig"], mediaIds: [media["portrait.jpg"]!], variants: [{ platform: "INSTAGRAM" }] });
      expect(await executor.executeDestination(id!, W)).toBe("PROCESSING");
      const [cid, container] = [...fake.state.igContainers.entries()].at(-1)!;
      expect(container.params.image_url).toMatch(/^https:\/\/studio\.example\.com\/api\/public\/media\/[0-9a-f-]+\?exp=\d+&sig=/);
      expect(container.params.caption).toBe("Bonjour\n\n#ig");
      container.status = "FINISHED";
      expect(await executor.executeDestination(id!, W, later(61_000))).toBe("PUBLISHED");
      expect((await dest(id!)).remoteUrl).toBe(`https://www.instagram.com/p/m-${cid}/`);
    });

    it("crée un carrousel (enfants puis parent) et un Reel pour une vidéo seule", async () => {
      const before = fake.state.igContainers.size;
      const { id } = await scheduleNow(accountId, { title: "C", body: "Carrousel", mediaIds: [media["portrait.jpg"]!, media["clip.mp4"]!], variants: [{ platform: "INSTAGRAM" }] });
      await executor.executeDestination(id!, W);
      const created = [...fake.state.igContainers.values()].slice(before);
      expect(created.map((c) => c.params.is_carousel_item ?? c.params.media_type)).toEqual(["true", "true", "CAROUSEL"]);
      expect(created[1]!.params.media_type).toBe("VIDEO");

      const reel = await scheduleNow(accountId, { title: "R", body: "Reel", mediaIds: [media["clip.mp4"]!], variants: [{ platform: "INSTAGRAM", options: { shareToFeed: false } }] });
      await executor.executeDestination(reel.id!, W);
      expect([...fake.state.igContainers.values()].at(-1)!.params).toMatchObject({ media_type: "REELS", share_to_feed: "false" });
    });

    it("réponse perdue après media_publish : rapprochement, aucune seconde publication", async () => {
      const { id } = await scheduleNow(accountId, { title: "U", body: "Incertain", mediaIds: [media["portrait.jpg"]!], variants: [{ platform: "INSTAGRAM" }] });
      await executor.executeDestination(id!, W);
      [...fake.state.igContainers.values()].at(-1)!.status = "FINISHED";
      fake.state.igDropPublishOnce = true;
      const count = fake.state.igPublishCount;
      expect(await executor.executeDestination(id!, W, later(61_000))).toBe("UNCERTAIN");
      expect(await executor.executeDestination(id!, W, later(61_000 + executor.RECONCILE_DELAY_MS + 1_000))).toBe("PROCESSING");
      expect(await executor.executeDestination(id!, W, later(61_000 + executor.RECONCILE_DELAY_MS + 2_000))).toBe("PUBLISHED");
      expect(fake.state.igPublishCount).toBe(count + 1);
    });

    it("jeton invalide (code 190) : échec et compte à reconnecter", async () => {
      fake.state.igError = { code: 190, message: "Error validating access token" };
      const { id } = await scheduleNow(accountId, { title: "T", body: "x", mediaIds: [media["portrait.jpg"]!], variants: [{ platform: "INSTAGRAM" }] });
      expect(await executor.executeDestination(id!, W)).toBe("FAILED");
      expect((await prisma.connectedAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("RECONNECT_REQUIRED");
    });
  });

  describe("LinkedIn", () => {
    let member = "";
    let page = "";

    it("connecte le profil et les pages administrées", async () => {
      const { account } = await connect("linkedin");
      expect(account).toMatchObject({ platform: "LINKEDIN", externalId: "urn:li:person:abc123", displayName: "Lionel Test", status: "READY" });
      const org = await prisma.connectedAccount.findFirstOrThrow({ where: { connector: "linkedin", externalId: "urn:li:organization:777" } });
      expect(org.displayName).toBe("Studio SARL (page)");
      member = account.id;
      page = org.id;
    });

    it("publie un texte avec en-têtes versionnés et texte échappé", async () => {
      const { id } = await scheduleNow(member, { title: "T", body: "Lancement (bêta) !", hashtags: ["produit"], variants: [{ platform: "LINKEDIN" }] });
      expect(await executor.executeDestination(id!, W)).toBe("PUBLISHED");
      expect(fake.state.liPosts.at(-1)).toMatchObject({
        author: "urn:li:person:abc123",
        commentary: "Lancement \\(bêta\\) !\n\n#produit",
        visibility: "PUBLIC",
        lifecycleState: "PUBLISHED",
      });
      expect((await dest(id!)).remoteUrl).toMatch(/^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:share:\d+\/$/);
    });

    it("publie une image au nom de la page", async () => {
      const { id } = await scheduleNow(page, { title: "Visuel", body: "Image", mediaIds: [media["portrait.jpg"]!], variants: [{ platform: "LINKEDIN" }] });
      expect(await executor.executeDestination(id!, W)).toBe("PUBLISHED");
      expect(fake.state.liPosts.at(-1)).toMatchObject({ author: "urn:li:organization:777", content: { media: { id: "urn:li:image:IMG1" } } });
    });

    it("vidéo en plusieurs parties : ETags dans l'ordre, attente du traitement", async () => {
      fake.state.liVideoStatus = "PROCESSING";
      const { id } = await scheduleNow(member, { title: "Vidéo", body: "Vidéo", mediaIds: [media["clip.mp4"]!], variants: [{ platform: "LINKEDIN" }] });
      expect(await executor.executeDestination(id!, W)).toBe("PROCESSING");
      const finalize = fake.calls.filter((c) => c.query.get("action") === "finalizeUpload").at(-1)!;
      expect(JSON.parse(finalize.body.toString()).finalizeUploadRequest.uploadedPartIds.map((e: string) => e.split("-")[1])).toEqual(["part0", "part1"]);
      fake.state.liVideoStatus = "AVAILABLE";
      expect(await executor.executeDestination(id!, W, later(31_000))).toBe("PUBLISHED");
      expect(fake.state.liPosts.at(-1).content.media.id).toBe("urn:li:video:VID1");
    });

    it("réponse perdue à la création du post : décision manuelle, aucun renvoi", async () => {
      fake.state.liDropPostOnce = true;
      const { id } = await scheduleNow(member, { title: "U", body: "Incertain", variants: [{ platform: "LINKEDIN" }] });
      const before = fake.state.liPosts.length;
      expect(await executor.executeDestination(id!, W)).toBe("UNCERTAIN");
      expect(await executor.executeDestination(id!, W, later(executor.RECONCILE_DELAY_MS + 1_000))).toBe("UNCERTAIN");
      expect((await dest(id!)).nextAttemptAt.getFullYear()).toBe(9999);
      expect(fake.state.liPosts.length).toBe(before + 1);
    });

    it("limite de requêtes : nouvel essai après Retry-After", async () => {
      fake.state.liRateLimited = true;
      const { id } = await scheduleNow(member, { title: "R", body: "x", variants: [{ platform: "LINKEDIN" }] });
      expect(await executor.executeDestination(id!, W)).toBe("RETRY_WAIT");
      expect((await dest(id!)).nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 110_000);
      await prisma.connectedAccount.updateMany({ where: { connector: "linkedin" }, data: { rateLimitedUntil: null } });
    });
  });

  describe("X", () => {
    let accountId = "";

    it("connecte un compte avec PKCE et authentification du client", async () => {
      const { url, account } = await connect("x");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("scope")).toContain("offline.access");
      expect(account).toMatchObject({ platform: "X", externalId: "42", displayName: "@studio", status: "READY" });
      accountId = account.id;
    });

    it("publie un texte puis une vidéo après traitement", async () => {
      const text = await scheduleNow(accountId, { title: "T", body: "Bonjour X", variants: [{ platform: "X" }] });
      expect(await executor.executeDestination(text.id!, W)).toBe("PUBLISHED");
      expect(fake.state.xTweets.at(-1)).toEqual({ text: "Bonjour X" });
      expect((await dest(text.id!)).remoteUrl).toMatch(/^https:\/\/x\.com\/studio\/status\/t\d+$/);

      fake.state.xMediaStatus = ["in_progress", "succeeded"];
      const video = await scheduleNow(accountId, { title: "V", body: "Vidéo", mediaIds: [media["clip.mp4"]!], variants: [{ platform: "X" }] });
      expect(await executor.executeDestination(video.id!, W)).toBe("PUBLISHED");
      const init = fake.calls.filter((c) => c.path === "/x/2/media/upload/initialize").at(-1)!;
      expect(JSON.parse(init.body.toString())).toMatchObject({ media_type: "video/mp4", media_category: "tweet_video" });
      expect(fake.state.xTweets.at(-1).media.media_ids).toHaveLength(1);
    }, 30_000);

    it("refuse le mélange image + vidéo", async () => {
      const r = await scheduleNow(accountId, { title: "M", body: "x", mediaIds: [media["portrait.jpg"]!, media["clip.mp4"]!], variants: [{ platform: "X" }] });
      expect(r.error).toMatchObject({ code: "INVALID_CONTENT" });
    });

    it("crédits épuisés : échec explicite, sans nouvel essai automatique", async () => {
      fake.state.xError = { status: 402, body: { title: "CreditsDepleted", detail: "Your account has no credits." } };
      const { id } = await scheduleNow(accountId, { title: "C", body: "x", variants: [{ platform: "X" }] });
      expect(await executor.executeDestination(id!, W)).toBe("FAILED");
      expect((await dest(id!)).lastErrorCode).toBe("CREDITS_DEPLETED");
    });

    it("limite de requêtes : attente jusqu'à x-rate-limit-reset", async () => {
      const reset = Math.floor(Date.now() / 1000) + 600;
      fake.state.xError = { status: 429, body: { title: "Too Many Requests" }, headers: { "x-rate-limit-reset": String(reset) } };
      const { id } = await scheduleNow(accountId, { title: "L", body: "x", variants: [{ platform: "X" }] });
      expect(await executor.executeDestination(id!, W)).toBe("RETRY_WAIT");
      expect(Math.abs((await dest(id!)).nextAttemptAt.getTime() - (reset * 1000 + 1000))).toBeLessThan(5_000);
      await prisma.connectedAccount.update({ where: { id: accountId }, data: { rateLimitedUntil: null } });
    });

    it("rafraîchit un jeton expiré et conserve le nouveau jeton de rafraîchissement", async () => {
      await prisma.connectedAccount.update({ where: { id: accountId }, data: { credentials: encryptJson({ accessToken: "old", refreshToken: "x-rt-1", expiresAt: 0 }) } });
      const { id } = await scheduleNow(accountId, { title: "R", body: "Après rafraîchissement", variants: [{ platform: "X" }] });
      expect(await executor.executeDestination(id!, W)).toBe("PUBLISHED");
      const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: accountId } });
      expect(readCredentials<{ refreshToken: string }>(account).refreshToken).toMatch(/^x-rt-\d+$/);
      expect(readCredentials<{ refreshToken: string }>(account).refreshToken).not.toBe("x-rt-1");
    });
  });
});
