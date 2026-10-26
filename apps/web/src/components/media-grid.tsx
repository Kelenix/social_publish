"use client";

import { useRef, useState, useTransition } from "react";
import { Film, Trash2, X } from "lucide-react";
import { deleteMediaAction } from "@/app/(app)/medias/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatDuration, formatRatio } from "@/lib/utils";
import type { MediaView } from "@/lib/views";

export function MediaFacts({ media }: { media: MediaView }) {
  const facts = [
    media.mimeType.split("/")[1]?.toUpperCase(),
    formatBytes(media.sizeBytes),
    media.width && media.height ? `${media.width}×${media.height} (${formatRatio(media.width, media.height)})` : null,
    media.durationMs !== null ? formatDuration(media.durationMs) : null,
  ].filter(Boolean);
  return <p className="font-mono text-xs text-muted">{facts.join(" · ")}</p>;
}

export function MediaThumb({ media, className }: { media: MediaView; className?: string }) {
  return (
    <div className={`relative aspect-square overflow-hidden rounded-md bg-surface-muted ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- vignette privée servie par l'API authentifiée */}
      <img src={`/api/media/${media.id}/thumbnail`} alt="" loading="lazy" className="size-full object-cover" />
      {media.kind === "VIDEO" && (
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
          <Film className="size-3" aria-hidden />
          {media.durationMs !== null ? formatDuration(media.durationMs) : "Vidéo"}
        </span>
      )}
    </div>
  );
}

export function MediaGrid({ media }: { media: MediaView[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<MediaView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (media.length === 0) return <p className="text-sm text-muted">Aucun média pour l&apos;instant.</p>;

  function open(item: MediaView) {
    setPreview(item);
    setError(null);
    dialog.current?.showModal();
  }

  function remove(item: MediaView) {
    if (!confirm(`Supprimer définitivement « ${item.name} » ?`)) return;
    startTransition(async () => {
      const result = await deleteMediaAction(item.id);
      if (result.error) setError(result.error);
      else dialog.current?.close();
    });
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {media.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => open(item)} className="w-full text-left">
              <MediaThumb media={item} />
              <p className="mt-2 truncate text-sm font-medium" title={item.name}>
                {item.name}
              </p>
              <MediaFacts media={item} />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        onClose={() => setPreview(null)}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground backdrop:bg-black/60"
      >
        {preview && (
          <div className="p-4">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{preview.name}</h2>
                <MediaFacts media={preview} />
              </div>
              <Button variant="ghost" size="icon" aria-label="Fermer" onClick={() => dialog.current?.close()}>
                <X />
              </Button>
            </div>
            <div className="grid max-h-[70dvh] place-items-center overflow-hidden rounded-md bg-black">
              {preview.kind === "VIDEO" ? (
                <video src={`/api/media/${preview.id}/file`} controls className="max-h-[70dvh] max-w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- original privé servi par l'API authentifiée
                <img src={`/api/media/${preview.id}/file`} alt={preview.name} className="max-h-[70dvh] max-w-full object-contain" />
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                {preview.videoCodec && <Badge>{preview.videoCodec}</Badge>}
                {preview.usage ? <Badge tone="accent">Utilisé dans {preview.usage} publication(s)</Badge> : null}
              </div>
              <Button variant="danger" size="sm" disabled={pending} onClick={() => remove(preview)}>
                <Trash2 /> Supprimer
              </Button>
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          </div>
        )}
      </dialog>
    </>
  );
}
