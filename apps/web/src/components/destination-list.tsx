"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DESTINATION_STATUS_LABELS } from "@app/core/scheduling/status";
import { PLATFORM_LABELS, type PlatformId } from "@app/core/platforms";
import type { DestinationStatus } from "@app/db";
import { resolveUncertainAction, retryDestinationAction } from "@/app/(app)/programmation-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type DestinationView = {
  id: string;
  postId: string;
  postTitle: string;
  account: string;
  simulated: boolean;
  platform: PlatformId;
  status: DestinationStatus;
  scheduledAt: string;
  publishedAt: string | null;
  attempts: number;
  remoteUrl: string | null;
  lastError: string | null;
  history: { id: string; kind: string; startedAt: string; outcome: string | null; errorMessage: string | null }[];
};

const TONE: Record<DestinationStatus, "neutral" | "accent" | "success" | "danger" | "warning"> = {
  PENDING: "accent",
  PUBLISHING: "accent",
  PROCESSING: "accent",
  RETRY_WAIT: "warning",
  PUBLISHED: "success",
  FAILED: "danger",
  UNCERTAIN: "warning",
  MISSED: "warning",
  CANCELLED: "neutral",
};

function Actions({ d }: { d: DestinationView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<{ error?: string }>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    startTransition(async () => setError((await action()).error ?? null));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(d.status === "FAILED" || d.status === "MISSED") && (
        <Button size="sm" disabled={pending} onClick={() => run(() => retryDestinationAction(d.id))}>
          {d.status === "MISSED" ? "Publier maintenant" : "Réessayer"}
        </Button>
      )}
      {d.status === "UNCERTAIN" && (
        <>
          <Button size="sm" disabled={pending} onClick={() => run(() => resolveUncertainAction(d.id, "published"))}>
            C&apos;est bien publié
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => run(() => resolveUncertainAction(d.id, "retry"), "Renvoyer peut créer un doublon si la publication existe déjà. Continuer ?")}
          >
            Renvoyer quand même
          </Button>
        </>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function DestinationList({ destinations, timezone, showPost = false }: { destinations: DestinationView[]; timezone: string; showPost?: boolean }) {
  const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  if (destinations.length === 0) return <p className="text-sm text-muted">Aucune destination.</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {destinations.map((d) => (
        <li key={d.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              {showPost && (
                <Link href={`/publications/${d.postId}`} className="block truncate font-medium hover:underline">
                  {d.postTitle}
                </Link>
              )}
              <p className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className={showPost ? "text-muted" : "font-medium"}>{d.account}</span>
                <Badge>{PLATFORM_LABELS[d.platform]}</Badge>
                {d.simulated && <Badge tone="warning">Simulation</Badge>}
              </p>
            </div>
            <Badge tone={TONE[d.status]}>{DESTINATION_STATUS_LABELS[d.status]}</Badge>
          </div>
          <p className="font-mono text-xs text-muted">
            Prévue : {fmt(d.scheduledAt)}
            {d.publishedAt && ` · publiée : ${fmt(d.publishedAt)}`} · tentatives : {d.attempts}
            {d.remoteUrl && (
              <>
                {" · "}
                {d.remoteUrl.startsWith("https://") ? (
                  <a href={d.remoteUrl} target="_blank" rel="noreferrer" className="underline">
                    voir
                  </a>
                ) : (
                  d.remoteUrl
                )}
              </>
            )}
          </p>
          {d.lastError && <p className="text-sm text-danger">{d.lastError}</p>}
          <Actions d={d} />
          {d.history.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Historique des tentatives</summary>
              <ul className="mt-2 space-y-1 font-mono">
                {d.history.map((h) => (
                  <li key={h.id}>
                    {fmt(h.startedAt)} · {h.kind} · {h.outcome ?? "en cours"}
                    {h.errorMessage && ` · ${h.errorMessage}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
