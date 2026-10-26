/**
 * Tests de CONTRAT du connecteur Facebook (Pages) : faux serveur Graph API reproduisant les échanges
 * documentés. Ils ne prouvent pas le fonctionnement contre la vraie API (identifiants requis).
 */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

/** Champs d'un formulaire multipart reçu (valeurs texte ; fichiers résumés par leur taille). */
async function readForm(req: Request): Promise<Record<string, string>> {
  if (req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(await req.text()));
  const data = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of data.entries()) out[k] = typeof v === "string" ? v : `<fichier ${v.size} octets>`;
  return out;
}

function fakeGraph() {
  const state = {
    photos: [] as Record<string, string>[],
    feedPosts: [] as (Record<string, string> & { id: string; created_time: string })[],
    videos: [] as Record<string, string>[],
    uploadedBytes: 0,
    deleted: [] as string[],
    published: new Map<string, boolean>(),
    dropFeedOnce: false,
    error: null as null | { code: number; message: string },
  };
  const json = (res: ServerResponse, status: number, body: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  let seq = 0;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const p = url.pathname.replace(/^\/v26\.0\//, "");
    const asRequest = () => new Request("http://x", { method: "POST", headers: { "content-type": req.headers["content-type"] ?? "" }, body });

    if (p === "oauth/access_token") {
      return json(res, 200, url.searchParams.get("grant_type") === "fb_exchange_token" ? { access_token: "user-long", expires_in: 5_184_000 } : { access_token: "user-short" });
    }
    if (p === "me/permissions") return json(res, 200, { data: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"].map((permission) => ({ permission, status: "granted" })) });
    if (p === "me/accounts") {
      return json(res, 200, {
        data: [
          { id: "111", name: "Ma Page", access_token: "page-token-secret", tasks: ["CREATE_CONTENT", "MANAGE", "MODERATE"] },
          { id: "222", name: "Page en lecture", access_token: "page-token-2", tasks: ["ANALYZE"] },
        ],
      });
    }
    if (state.error && req.method !== "GET") return json(res, 400, { error: { ...state.error, type: "OAuthException" } });
    if (p === "111/photos") {
      state.photos.push(await readForm(asRequest()));
      return json(res, 200, { id: `ph${++seq}` });
    }
    if (p === "111/feed" && req.method === "POST") {
      const fields = await readForm(asRequest());
      const post = { ...fields, id: `111_${++seq}`, created_time: new Date().toISOString() };
      state.feedPosts.push(post);
      state.published.set(post.id, fields.published !== "false");
      if (state.dropFeedOnce) {
        state.dropFeedOnce = false;
        return req.socket.destroy();
      }
      return json(res, 200, { id: post.id });
    }
    if (p === "111/feed" && req.method === "GET") {
      return json(res, 200, { data: state.feedPosts.filter((x) => state.published.get(x.id)).map((x) => ({ id: x.id, message: x.message, created_time: x.created_time })) });
    }
    if (p === "app-test/uploads") return json(res, 200, { id: "upload:sess1" });
    if (p === "upload:sess1" && req.method === "GET") return json(res, 200, { id: "upload:sess1", file_offset: state.uploadedBytes });
    if (p === "upload:sess1" && req.method === "POST") {
      if (req.headers.authorization !== "OAuth user-long") return json(res, 401, { error: { code: 190, message: "jeton" } });
      state.uploadedBytes += body.length;
      return json(res, 200, { h: "video-handle" });
    }
    if (p === "111/videos") {
      const fields = await readForm(asRequest());
      state.videos.push(fields);
      const id = `v${++seq}`;
      state.published.set(id, fields.published !== "false");
      return json(res, 200, { id });
    }
    if (req.method === "DELETE") {
      state.deleted.push(p);
      return json(res, 200, { success: true });
    }
    if (state.published.has(p)) return json(res, 200, { id: p, is_published: state.published.get(p) });
    json(res, 404, { error: { code: 100, message: `inconnu ${p}` } });
  });
  return { server, state };
}

describe.skipIf(!enabled)("connecteur Facebook (contrat, faux serveur Graph)", async () => {
  const fake = fakeGraph();
  await new Promise<void>((r) => fake.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    FACEBOOK_APP_ID: "app-test",
    FACEBOOK_APP_SECRET: "secret-test",
    FACEBOOK_GRAPH_URL: base,
    FACEBOOK_GRAPH_VIDEO_URL: base,
    FACEBOOK_DIALOG_URL: `${base}/dialog/oauth`,
  });

  const { prisma } = await import("@app/db");
  const oauth = await import("./oauth");
  const posts = await import("../posts/service");
  const scheduling = await import("../scheduling/service");
  const executor = await import("../scheduling/executor");
  const { importMedia } = await import("../media");

  const dir = mkdtempSync(path.join(os.tmpdir(), "fb-"));
  const media: Record<string, string> = {};
  const W = "worker-fb";
  let pageId = "";
  const later = (ms: number) => new Date(Date.now() + ms);
  const dest = (id: string) => prisma.destination.findUniqueOrThrow({ where: { id } });

  async function make(name: string, args: string[]) {
    const file = path.join(dir, name);
    execFileSync("ffmpeg", ["-v", "error", "-y", ...args, file]);
    media[name] = (await importMedia(createReadStream(file), name, "test")).id;
  }
  async function schedule(input: Parameters<typeof posts.createDraft>[0], when: Parameters<typeof scheduling.schedulePost>[2] = { mode: "now" }) {
    const post = await posts.createDraft(input, "test");
    const r = await scheduling.schedulePost(post.id, [pageId], when, "test");
    return r.ok ? { post, id: r.destinationIds[0]! } : { post, error: r };
  }

  beforeAll(async () => {
    await make("a.jpg", ["-f", "lavfi", "-i", "color=c=blue:size=800x800", "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg"]);
    await make("b.png", ["-f", "lavfi", "-i", "color=c=red:size=600x400", "-frames:v", "1", "-f", "image2", "-c:v", "png"]);
    await make("v.mp4", ["-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=3", "-pix_fmt", "yuv420p", "-f", "mp4"]);
  });
  afterAll(async () => {
    fake.server.close();
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    fake.state.error = null;
    fake.state.dropFeedOnce = false;
  });

  it("connecte les Pages gérées ; une Page sans droit de publication est signalée", async () => {
    const url = new URL(await oauth.startAuthorization("facebook", "test"));
    expect(url.searchParams.get("scope")).toBe("pages_show_list,pages_read_engagement,pages_manage_posts");
    const page = await oauth.completeAuthorization("facebook", { code: "c", state: url.searchParams.get("state") }, "test");
    expect(page).toMatchObject({ platform: "FACEBOOK", externalId: "111", displayName: "Ma Page", status: "READY" });
    expect(page.credentials).not.toContain("page-token-secret");
    const other = await prisma.connectedAccount.findFirstOrThrow({ where: { connector: "facebook", externalId: "222" } });
    expect(other.status).toBe("PERMISSION_MISSING");
    pageId = page.id;
  });

  it("publie un texte immédiatement", async () => {
    const { id } = await schedule({ title: "T", body: "Bonjour la Page", hashtags: ["fb"], variants: [{ platform: "FACEBOOK" }] });
    expect(await executor.executeDestination(id!, W)).toBe("PUBLISHED");
    expect(fake.state.feedPosts.at(-1)).toMatchObject({ message: "Bonjour la Page\n\n#fb" });
    expect(fake.state.feedPosts.at(-1)!.published).toBeUndefined();
    expect((await dest(id!)).remoteUrl).toMatch(/^https:\/\/www\.facebook\.com\/111_\d+$/);
  });

  it("publie plusieurs photos : envoi non publié puis rattachement au post", async () => {
    const before = fake.state.photos.length;
    const { id } = await schedule({ title: "P", body: "Album", mediaIds: [media["a.jpg"]!, media["b.png"]!], variants: [{ platform: "FACEBOOK" }] });
    expect(await executor.executeDestination(id!, W)).toBe("PUBLISHED");
    const photos = fake.state.photos.slice(before);
    expect(photos).toHaveLength(2);
    expect(photos.every((p) => p.published === "false" && p.source?.startsWith("<fichier") && p.temporary === undefined)).toBe(true);
    const post = fake.state.feedPosts.at(-1)!;
    expect(JSON.parse(post["attached_media[0]"]!)).toHaveProperty("media_fbid");
    expect(JSON.parse(post["attached_media[1]"]!)).toHaveProperty("media_fbid");
  });

  it("programmation native : Facebook publie à l'heure prévue ; annulation par suppression du post programmé", async () => {
    const { post, id } = await schedule(
      { title: "S", body: "Programmé", mediaIds: [media["a.jpg"]!], variants: [{ platform: "FACEBOOK" }] },
      { mode: "at", local: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 16), timezone: "UTC" },
    );
    expect((await dest(id!)).nextAttemptAt.getTime()).toBeLessThan(Date.now() + 5_000);
    expect(await executor.executeDestination(id!, W)).toBe("REMOTE_SCHEDULED");
    expect(fake.state.photos.at(-1)).toMatchObject({ published: "false", temporary: "true" });
    const fbPost = fake.state.feedPosts.at(-1)!;
    expect(fbPost).toMatchObject({ published: "false", unpublished_content_type: "SCHEDULED" });
    expect(Number(fbPost.scheduled_publish_time)).toBe(Math.floor((await dest(id!)).scheduledAt.getTime() / 1000));

    const result = await scheduling.cancelSchedule(post.id, "test");
    expect(result.remoteErrors).toEqual([]);
    expect(fake.state.deleted).toContain(fbPost.id);
    expect((await dest(id!)).status).toBe("CANCELLED");
  });

  it("vérifie la mise en ligne d'une publication programmée", async () => {
    const { id } = await schedule(
      { title: "S2", body: "Programmé 2", variants: [{ platform: "FACEBOOK" }] },
      { mode: "at", local: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16), timezone: "UTC" },
    );
    expect(await executor.executeDestination(id!, W)).toBe("REMOTE_SCHEDULED");
    fake.state.published.set((await dest(id!)).remoteId!, true);
    expect(await executor.executeDestination(id!, W, later(86_400_000 + 6 * 60_000))).toBe("PUBLISHED");
  });

  it("publie une vidéo par upload reprenable", async () => {
    const { id } = await schedule({ title: "Ma vidéo", body: "Description", mediaIds: [media["v.mp4"]!], variants: [{ platform: "FACEBOOK" }] });
    expect(await executor.executeDestination(id!, W)).toBe("PUBLISHED");
    expect(fake.state.uploadedBytes).toBeGreaterThan(0);
    expect(fake.state.videos.at(-1)).toMatchObject({ title: "Ma vidéo", description: "Description", fbuploader_video_file_chunk: "video-handle" });
  });

  it("réponse perdue : retrouve le post publié, aucun doublon", async () => {
    fake.state.dropFeedOnce = true;
    const before = fake.state.feedPosts.length;
    const { id } = await schedule({ title: "U", body: `Incertain ${Date.now()}\nsur deux lignes`, hashtags: ["fb"], variants: [{ platform: "FACEBOOK" }] });
    expect(await executor.executeDestination(id!, W)).toBe("UNCERTAIN");
    expect(await executor.executeDestination(id!, W, later(executor.RECONCILE_DELAY_MS + 1_000))).toBe("PROCESSING");
    expect(await executor.executeDestination(id!, W, later(executor.RECONCILE_DELAY_MS + 2_000))).toBe("PUBLISHED");
    expect(fake.state.feedPosts.length).toBe(before + 1);
  });

  it("refuse le mélange photo + vidéo", async () => {
    const r = await schedule({ title: "M", body: "x", mediaIds: [media["a.jpg"]!, media["v.mp4"]!], variants: [{ platform: "FACEBOOK" }] });
    expect(r.error).toMatchObject({ code: "INVALID_CONTENT" });
  });

  it("jeton invalide (190) : échec et Page à reconnecter", async () => {
    fake.state.error = { code: 190, message: "Error validating access token" };
    const { id } = await schedule({ title: "E", body: "x", variants: [{ platform: "FACEBOOK" }] });
    expect(await executor.executeDestination(id!, W)).toBe("FAILED");
    expect((await prisma.connectedAccount.findUniqueOrThrow({ where: { id: pageId } })).status).toBe("RECONNECT_REQUIRED");
  });
});
