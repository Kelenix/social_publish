import type { PostStatus } from "@app/db";

export const POST_STATUS: Record<PostStatus, { label: string; tone: "neutral" | "accent" | "success" | "danger" | "warning" }> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  SCHEDULED: { label: "Programmée", tone: "accent" },
  PUBLISHING: { label: "En cours", tone: "accent" },
  PUBLISHED: { label: "Publiée", tone: "success" },
  PARTIAL: { label: "Partielle", tone: "warning" },
  FAILED: { label: "Échec", tone: "danger" },
  CANCELLED: { label: "Annulée", tone: "neutral" },
};

export const timezones = (): string[] => Intl.supportedValuesOf("timeZone");
