import "server-only";
import type { listDestinations } from "@app/core/scheduling";
import type { DestinationView } from "@/components/destination-list";

type Row = Awaited<ReturnType<typeof listDestinations>>[number];

export function toDestinationView(d: Row): DestinationView {
  return {
    id: d.id,
    postId: d.post.id,
    postTitle: d.post.title,
    account: d.account.displayName,
    simulated: d.account.connector === "test",
    platform: d.platform,
    status: d.status,
    scheduledAt: d.scheduledAt.toISOString(),
    publishedAt: d.publishedAt?.toISOString() ?? null,
    attempts: d.attempts,
    remoteUrl: d.remoteUrl,
    lastError: d.lastError,
    history: d.history.map((h) => ({ id: h.id, kind: h.kind, startedAt: h.startedAt.toISOString(), outcome: h.outcome, errorMessage: h.errorMessage })),
  };
}
