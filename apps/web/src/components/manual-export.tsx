"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { PLATFORM_LABELS, type PlatformId } from "@app/core/platforms";
import { markManualPublishedAction } from "@/app/(app)/programmation-actions";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { MediaFacts } from "@/components/media-grid";
import type { MediaView } from "@/lib/views";

export type ManualExportView = { platform: PlatformId; caption: string; media: MediaView[]; notes: string[]; markedAt: string | null };

/** Export pour publication manuelle (plateformes sans publication automatique autorisée). */
export function ManualExport({ postId, item, timezone }: { postId: string; item: ManualExportView; timezone: string }) {
  const [copied, setCopied] = useState(false);
  const [marked, setMarked] = useState(item.markedAt);
  const [pending, startTransition] = useTransition();
  return (
    <Card className="space-y-3">
      <CardTitle>Publication manuelle — {PLATFORM_LABELS[item.platform]}</CardTitle>
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted">
        {item.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <Textarea readOnly value={item.caption} rows={4} aria-label="Texte à publier" />
      <Button
        type="button"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(item.caption);
          setCopied(true);
        }}
      >
        {copied ? "Texte copié" : "Copier le texte"}
      </Button>
      <ul className="space-y-2">
        {item.media.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate">{m.name}</span>
              <MediaFacts media={m} />
            </span>
            <a href={`/api/media/${m.id}/file?telecharger`} className="inline-flex items-center gap-1 text-sm underline">
              <Download className="size-4" aria-hidden /> Télécharger l&apos;original
            </a>
          </li>
        ))}
      </ul>
      {marked ? (
        <p role="status" className="text-sm text-success">
          Marquée comme publiée manuellement le {new Date(marked).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: timezone })}.
        </p>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(async () => setMarked((await markManualPublishedAction(postId, item.platform)).markedAt))}
        >
          J&apos;ai publié sur {PLATFORM_LABELS[item.platform]}
        </Button>
      )}
    </Card>
  );
}
