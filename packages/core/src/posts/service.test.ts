import { execFileSync } from "node:child_process";
import { createReadStream, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("brouillons et médias (intégration PostgreSQL + ffmpeg)", async () => {
  const { prisma } = await import("@app/db");
  const posts = await import("./service");
  const media = await import("../media");
  const dir = mkdtempSync(path.join(os.tmpdir(), "it-"));
  let videoId = "";
  let imageId = "";

  beforeAll(async () => {
    const video = path.join(dir, "clip");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=2", "-pix_fmt", "yuv420p", "-f", "mp4", video]);
    const image = path.join(dir, "img");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=yellow:size=64x48", "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", image]);
    videoId = (await media.importMedia(createReadStream(video), "C:\\Users\\moi\\clip.mp4", "test")).id;
    imageId = (await media.importMedia(createReadStream(image), "photo.jpg", "test")).id;
  });

  afterAll(async () => {
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("archive le média avec ses métadonnées réelles, sans dépendre du fichier source", async () => {
    const asset = await media.getMedia(videoId);
    expect(asset).toMatchObject({ kind: "VIDEO", mimeType: "video/mp4", width: 320, height: 240, originalName: "clip.mp4" });
    expect(asset?.storageKey).toMatch(/^media\/\d{4}\/\d{2}\/[0-9a-f-]+\.mp4$/);
    expect(asset?.thumbKey).toBeTruthy();
  });

  it("refuse un fichier qui n'est pas un média", async () => {
    await expect(media.importMedia(Readable.from([Buffer.from("texte")]), "faux.mp4", "test")).rejects.toThrow(media.UnsupportedMediaError);
  });

  it("n'incrémente la version que pour une modification substantielle", async () => {
    const draft = await posts.createDraft({ title: "Lancement", body: "Texte", mediaIds: [videoId], variants: [{ platform: "YOUTUBE" }] }, "test");
    expect(draft.version).toBe(1);

    const same = await posts.updateDraft(draft.id, posts.toInput(draft), "test");
    expect(same.version).toBe(1);

    const renamed = await posts.updateDraft(draft.id, { ...posts.toInput(draft), timezone: "America/New_York" }, "test");
    expect(renamed.version).toBe(1);

    const changed = await posts.updateDraft(
      draft.id,
      { ...posts.toInput(draft), variants: [{ platform: "YOUTUBE", description: "Description longue" }] },
      "test",
    );
    expect(changed.version).toBe(2);
    expect(changed.variants[0]?.description).toBe("Description longue");
  });

  it("refuse un média inconnu", async () => {
    await expect(
      posts.createDraft({ title: "X", mediaIds: ["99999999-9999-4999-8999-999999999999"] }, "test"),
    ).rejects.toThrow(posts.UnknownMediaError);
  });

  it("duplique une publication en brouillon indépendant", async () => {
    const draft = await posts.createDraft({ title: "Original", mediaIds: [imageId], variants: [{ platform: "INSTAGRAM", text: "Légende" }] }, "test");
    const copy = await posts.duplicatePost(draft.id, "test");
    expect(copy.id).not.toBe(draft.id);
    expect(copy).toMatchObject({ title: "Original (copie)", status: "DRAFT", version: 1 });
    expect(copy.variants[0]?.text).toBe("Légende");
    expect(copy.media.map((m) => m.mediaId)).toEqual([imageId]);
  });

  it("interdit de modifier ou supprimer une publication qui n'est plus un brouillon", async () => {
    const draft = await posts.createDraft({ title: "Programmée" }, "test");
    await prisma.post.update({ where: { id: draft.id }, data: { status: "SCHEDULED" } });
    await expect(posts.updateDraft(draft.id, { title: "Changée" }, "test")).rejects.toThrow(posts.PostNotEditableError);
    await expect(posts.deleteDraft(draft.id, "test")).rejects.toThrow(posts.PostNotEditableError);
  });

  it("protège un média utilisé, y compris dans une variante", async () => {
    await expect(media.deleteMedia(videoId, "test")).rejects.toThrow(media.MediaInUseError);
    const variantOnly = await posts.createDraft({ title: "V", variants: [{ platform: "X", mediaIds: [imageId] }] }, "test");
    expect(variantOnly.variants[0]?.mediaIds).toEqual([imageId]);
    await expect(media.deleteMedia(imageId, "test")).rejects.toThrow(media.MediaInUseError);
  });

  it("journalise les opérations sans secret", async () => {
    const actions = await prisma.auditLog.findMany({ select: { action: true } });
    expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(["media.import", "post.create", "post.update"]));
  });
});
