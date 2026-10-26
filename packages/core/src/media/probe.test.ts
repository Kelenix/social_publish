import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { interpretProbe, probeFile, UnsupportedMediaError } from "./probe";

describe("interpretProbe", () => {
  it("applique la rotation aux dimensions d'une vidéo verticale", () => {
    const result = interpretProbe({
      format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "12.5", tags: { major_brand: "isom" } },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "30000/1001", side_data_list: [{ rotation: -90 }] },
        { codec_type: "audio", codec_name: "aac" },
      ],
    });
    expect(result).toMatchObject({ kind: "VIDEO", mimeType: "video/mp4", width: 1080, height: 1920, durationMs: 12500, frameRate: 29.97, audioCodec: "aac" });
  });

  it("reconnaît un fichier QuickTime", () => {
    const result = interpretProbe({
      format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "1", tags: { major_brand: "qt  " } },
      streams: [{ codec_type: "video", codec_name: "hevc", width: 10, height: 10 }],
    });
    expect(result.mimeType).toBe("video/quicktime");
  });

  it("refuse un format d'image non pris en charge", () => {
    expect(() =>
      interpretProbe({ format: { format_name: "bmp_pipe" }, streams: [{ codec_type: "video", codec_name: "bmp", width: 1, height: 1 }] }),
    ).toThrow(UnsupportedMediaError);
  });

  it("refuse un fichier audio seul", () => {
    expect(() => interpretProbe({ format: { format_name: "mp3" }, streams: [{ codec_type: "audio", codec_name: "mp3" }] })).toThrow(UnsupportedMediaError);
  });
});

// Vérification réelle avec ffprobe/ffmpeg (ignorée si absents de la machine).
const hasFfmpeg = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)("probeFile (ffprobe réel)", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "probe-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("analyse une vidéo MP4 générée sans se fier à l'extension", async () => {
    const file = path.join(dir, "clip.bin");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=2", "-pix_fmt", "yuv420p", "-f", "mp4", file]);
    const result = await probeFile("ffprobe", file);
    expect(result).toMatchObject({ kind: "VIDEO", mimeType: "video/mp4", width: 320, height: 240, videoCodec: "h264" });
    expect(result.durationMs).toBeGreaterThanOrEqual(1900);
  });

  it("calcule la durée d'un WebM sans durée dans l'en-tête", async () => {
    const file = path.join(dir, "live.webm");
    // Sortie non « seekable » (pipe) : ffmpeg n'écrit pas la durée, comme MediaRecorder.
    const data = execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=25:duration=2", "-c:v", "libvpx", "-f", "webm", "pipe:1"]);
    writeFileSync(file, data);
    const result = await probeFile("ffprobe", file);
    expect(result.mimeType).toBe("video/webm");
    expect(result.durationMs).toBeGreaterThanOrEqual(1900);
  });

  it("analyse une image PNG", async () => {
    const file = path.join(dir, "image");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=yellow:size=64x48", "-frames:v", "1", "-f", "image2", "-c:v", "png", file]);
    expect(await probeFile("ffprobe", file)).toMatchObject({ kind: "IMAGE", mimeType: "image/png", width: 64, height: 48 });
  });

  it("refuse un fichier texte déguisé en vidéo", async () => {
    const file = path.join(dir, "faux.mp4");
    writeFileSync(file, "ceci n'est pas une vidéo");
    await expect(probeFile("ffprobe", file)).rejects.toThrow(UnsupportedMediaError);
  });
});
