import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type ProbeResult = {
  kind: "IMAGE" | "VIDEO";
  mimeType: string;
  extension: string;
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
  /** Dimensions d'affichage (rotation appliquée). */
  width: number;
  height: number;
  durationMs: number | null;
  frameRate: number | null;
};

export class UnsupportedMediaError extends Error {}

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
};
export type FfprobeOutput = {
  format?: { format_name?: string; duration?: string; tags?: { major_brand?: string } };
  streams?: FfprobeStream[];
};

const IMAGE_CODECS: Record<string, { mimeType: string; extension: string }> = {
  mjpeg: { mimeType: "image/jpeg", extension: "jpg" },
  png: { mimeType: "image/png", extension: "png" },
  webp: { mimeType: "image/webp", extension: "webp" },
};

function parseRate(rate: string | undefined): number | null {
  const [num, den] = (rate ?? "").split("/").map(Number);
  if (!num || !den) return null;
  return Math.round((num / den) * 1000) / 1000;
}

/**
 * Interprète la sortie JSON de ffprobe. Le type est déterminé par le contenu réel du fichier,
 * jamais par l'extension ou le Content-Type déclaré.
 */
export function interpretProbe(data: FfprobeOutput): ProbeResult {
  const formatName = data.format?.format_name ?? "";
  const video = data.streams?.find((s) => s.codec_type === "video");
  const audio = data.streams?.find((s) => s.codec_type === "audio");
  if (!video?.width || !video.height || !video.codec_name) {
    throw new UnsupportedMediaError("Aucune piste image/vidéo lisible dans ce fichier.");
  }

  const rotation = Math.abs(Number(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0));
  const [width, height] = rotation % 180 === 90 ? [video.height, video.width] : [video.width, video.height];
  const base = { width, height, videoCodec: video.codec_name, container: formatName };

  if (formatName.endsWith("_pipe") || formatName === "image2") {
    const image = IMAGE_CODECS[video.codec_name];
    if (!image) throw new UnsupportedMediaError(`Format d'image non pris en charge (${video.codec_name}). Formats acceptés : JPEG, PNG, WebP.`);
    return { ...base, ...image, kind: "IMAGE", audioCodec: null, durationMs: null, frameRate: null };
  }

  const durationMs = data.format?.duration ? Math.round(Number(data.format.duration) * 1000) : null;
  const common = { ...base, kind: "VIDEO" as const, audioCodec: audio?.codec_name ?? null, durationMs, frameRate: parseRate(video.avg_frame_rate) };
  if (formatName.includes("mp4") || formatName.includes("mov")) {
    const isQuickTime = data.format?.tags?.major_brand?.trim() === "qt";
    return { ...common, mimeType: isQuickTime ? "video/quicktime" : "video/mp4", extension: isQuickTime ? "mov" : "mp4" };
  }
  if (formatName.includes("webm")) return { ...common, mimeType: "video/webm", extension: "webm" };
  throw new UnsupportedMediaError(`Conteneur non pris en charge (${formatName}). Formats acceptés : MP4, MOV, WebM, JPEG, PNG, WebP.`);
}

export async function probeFile(ffprobePath: string, filePath: string): Promise<ProbeResult> {
  let stdout: string;
  try {
    ({ stdout } = await run(ffprobePath, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath], {
      maxBuffer: 10 * 1024 * 1024,
    }));
  } catch {
    throw new UnsupportedMediaError("Fichier illisible : ce n'est pas une image ou une vidéo valide.");
  }
  const result = interpretProbe(JSON.parse(stdout) as FfprobeOutput);
  if (result.kind === "VIDEO" && result.durationMs === null) result.durationMs = await durationFromPackets(ffprobePath, filePath);
  return result;
}

/** Durée réelle quand l'en-tête ne la fournit pas (ex. WebM enregistré par un navigateur). */
async function durationFromPackets(ffprobePath: string, filePath: string): Promise<number | null> {
  const { stdout } = await run(
    ffprobePath,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,duration_time", "-of", "csv=p=0", filePath],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  let end = 0;
  for (const line of stdout.split("\n")) {
    const [pts, duration] = line.split(",").map(Number);
    if (Number.isFinite(pts)) end = Math.max(end, pts! + (Number.isFinite(duration) ? duration! : 0));
  }
  return end > 0 ? Math.round(end * 1000) : null;
}

/** Vignette JPEG (480 px de large) ; pour une vidéo, image prise à 1 s ou au milieu si plus courte. */
export async function createThumbnail(ffmpegPath: string, input: string, output: string, durationMs: number | null): Promise<void> {
  const seek = durationMs ? Math.min(1, durationMs / 2000) : 0;
  await run(ffmpegPath, ["-v", "error", "-y", "-ss", String(seek), "-i", input, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", "-f", "mjpeg", output]);
}
