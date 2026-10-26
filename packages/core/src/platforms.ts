/** Plateformes ciblées. Module pur : utilisable côté client. */
export const PLATFORMS = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X", "LINKEDIN"] as const;
export type PlatformId = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  X: "X",
  LINKEDIN: "LinkedIn",
};

/**
 * Champs de contenu utilisés par chaque plateforme (pour l'éditeur et l'aperçu).
 * Les limites chiffrées (caractères, durées, formats) viennent des capacités des connecteurs.
 */
export const PLATFORM_FIELDS: Record<PlatformId, readonly ("text" | "title" | "description")[]> = {
  INSTAGRAM: ["text"],
  TIKTOK: ["text"],
  YOUTUBE: ["title", "description"],
  X: ["text"],
  LINKEDIN: ["text"],
};
