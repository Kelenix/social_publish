import type { MediaAsset } from "@app/db";

/** Représentation sérialisable d'un média pour les composants client. */
export type MediaView = {
  id: string;
  name: string;
  kind: "IMAGE" | "VIDEO";
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  videoCodec: string | null;
  createdAt: string;
  usage?: number;
};

export function toMediaView(asset: MediaAsset & { _count?: { posts: number } }): MediaView {
  return {
    id: asset.id,
    name: asset.originalName,
    kind: asset.kind,
    mimeType: asset.mimeType,
    sizeBytes: Number(asset.sizeBytes),
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    videoCodec: asset.videoCodec,
    createdAt: asset.createdAt.toISOString(),
    usage: asset._count?.posts,
  };
}
