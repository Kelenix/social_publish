import type { DestinationStatus, PostStatus } from "@app/db";

/** Module pur : règles d'état partagées (UI, worker, MCP). */

export const ACTIVE_STATUSES: DestinationStatus[] = ["PENDING", "PUBLISHING", "PROCESSING", "RETRY_WAIT", "REMOTE_SCHEDULED"];
export const ATTENTION_STATUSES: DestinationStatus[] = ["UNCERTAIN", "MISSED"];

/** État global d'une publication déduit de ses destinations (chacune reste indépendante). */
export function aggregateStatus(statuses: DestinationStatus[]): PostStatus {
  if (statuses.length === 0) return "DRAFT";
  const has = (s: DestinationStatus) => statuses.includes(s);
  if (statuses.some((s) => ATTENTION_STATUSES.includes(s))) return "NEEDS_ATTENTION";
  if (statuses.some((s) => ACTIVE_STATUSES.includes(s))) {
    return statuses.every((s) => s === "PENDING" || s === "REMOTE_SCHEDULED" || s === "CANCELLED") ? "SCHEDULED" : "PUBLISHING";
  }
  if (statuses.every((s) => s === "CANCELLED")) return "CANCELLED";
  if (has("PUBLISHED")) return has("FAILED") ? "PARTIAL" : "PUBLISHED";
  return "FAILED";
}

/** Délai avant la tentative n (n ≥ 1) : 1, 2, 4, 8… min, plafonné à 1 h, au moins le Retry-After. */
export function retryDelayMs(attempt: number, retryAfterMs?: number): number {
  const backoff = Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1));
  return Math.max(backoff, retryAfterMs ?? 0);
}

export const DESTINATION_STATUS_LABELS: Record<DestinationStatus, string> = {
  PENDING: "Programmée",
  PUBLISHING: "Envoi en cours",
  PROCESSING: "Traitement par la plateforme",
  REMOTE_SCHEDULED: "Programmée sur la plateforme",
  RETRY_WAIT: "Nouvelle tentative prévue",
  PUBLISHED: "Publiée",
  FAILED: "Échec",
  UNCERTAIN: "Résultat incertain",
  MISSED: "Manquée (à reprogrammer)",
  CANCELLED: "Annulée",
};
