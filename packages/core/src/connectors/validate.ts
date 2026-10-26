import type { ResolvedVariant } from "../posts/schema";
import type { Capabilities } from "./types";

export type ValidationIssue = { field: "text" | "title" | "description" | "hashtags" | "media" | "options"; message: string };

type MediaFacts = {
  id: string;
  kind: "IMAGE" | "VIDEO";
  mimeType: string;
  sizeBytes: bigint | number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

const mb = (bytes: number) => `${Math.round(bytes / 1024 ** 2)} Mo`;
const sec = (ms: number) => `${Math.round(ms / 100) / 10} s`;

/**
 * Vérifie un contenu résolu contre les capacités d'un connecteur. Fonction pure : utilisée avant
 * la programmation et de nouveau juste avant l'envoi.
 */
export function validateContent(content: ResolvedVariant, caption: string, media: MediaFacts[], caps: Capabilities): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { limits } = caps;
  const usesTitle = limits.titleMax !== undefined || limits.titleRequired;

  if (limits.textMax !== undefined && caption.length > limits.textMax) {
    issues.push({ field: "text", message: `Texte trop long : ${caption.length} caractères (maximum ${limits.textMax}, hashtags compris).` });
  }
  if (usesTitle && limits.titleRequired && content.title.trim() === "") issues.push({ field: "title", message: "Titre obligatoire." });
  if (limits.titleMax !== undefined && content.title.length > limits.titleMax) {
    issues.push({ field: "title", message: `Titre trop long : ${content.title.length} caractères (maximum ${limits.titleMax}).` });
  }
  if (limits.descriptionMax !== undefined && content.description.length > limits.descriptionMax) {
    issues.push({ field: "description", message: `Description trop longue (maximum ${limits.descriptionMax} caractères).` });
  }
  if (limits.descriptionMaxBytes !== undefined && Buffer.byteLength(content.description, "utf8") > limits.descriptionMaxBytes) {
    issues.push({ field: "description", message: `Description trop longue : ${Buffer.byteLength(content.description, "utf8")} octets (maximum ${limits.descriptionMaxBytes}).` });
  }
  for (const char of limits.forbiddenChars ?? []) {
    if (content.title.includes(char)) issues.push({ field: "title", message: `Caractère « ${char} » interdit dans le titre.` });
    if (content.description.includes(char)) issues.push({ field: "description", message: `Caractère « ${char} » interdit dans la description.` });
  }
  if (limits.tagsMaxChars !== undefined && content.hashtags.join(",").length > limits.tagsMaxChars) {
    issues.push({ field: "hashtags", message: `Tags trop longs : ${content.hashtags.join(",").length} caractères (maximum ${limits.tagsMaxChars}, virgules comprises).` });
  }
  if (limits.hashtagsMax !== undefined && content.hashtags.length > limits.hashtagsMax) {
    issues.push({ field: "hashtags", message: `Trop de hashtags : ${content.hashtags.length} (maximum ${limits.hashtagsMax}).` });
  }

  if (media.length < limits.mediaMin) issues.push({ field: "media", message: `Au moins ${limits.mediaMin} média(s) requis.` });
  if (media.length > limits.mediaMax) issues.push({ field: "media", message: `Au plus ${limits.mediaMax} média(s).` });
  if (media.length > 1 && !caps.contentTypes.includes("CAROUSEL")) issues.push({ field: "media", message: "Plusieurs médias non pris en charge." });

  for (const [i, m] of media.entries()) {
    const label = `Média ${i + 1}`;
    const size = Number(m.sizeBytes);
    if (!caps.contentTypes.includes(m.kind)) {
      const only = caps.contentTypes.includes("VIDEO") ? "vidéos" : "images";
      issues.push({ field: "media", message: `${label} : ${m.kind === "VIDEO" ? "les vidéos ne sont pas acceptées" : "les images ne sont pas acceptées"} ici (${only} uniquement).` });
      continue;
    }
    if (!limits.mimeTypes.includes(m.mimeType)) issues.push({ field: "media", message: `${label} : format ${m.mimeType} non accepté.` });
    const maxBytes = m.kind === "VIDEO" ? limits.videoMaxBytes : limits.imageMaxBytes;
    if (maxBytes !== undefined && size > maxBytes) issues.push({ field: "media", message: `${label} : ${mb(size)} (maximum ${mb(maxBytes)}).` });
    if (m.kind === "VIDEO" && m.durationMs !== null) {
      if (limits.videoMinDurationMs !== undefined && m.durationMs < limits.videoMinDurationMs) {
        issues.push({ field: "media", message: `${label} : durée ${sec(m.durationMs)} (minimum ${sec(limits.videoMinDurationMs)}).` });
      }
      if (limits.videoMaxDurationMs !== undefined && m.durationMs > limits.videoMaxDurationMs) {
        issues.push({ field: "media", message: `${label} : durée ${sec(m.durationMs)} (maximum ${sec(limits.videoMaxDurationMs)}).` });
      }
    }
    const range = m.kind === "IMAGE" && limits.imageAspectRatio ? limits.imageAspectRatio : limits.aspectRatio;
    if (range && m.width && m.height) {
      const ratio = m.width / m.height;
      if (ratio < range.min - 0.005 || ratio > range.max + 0.005) {
        issues.push({ field: "media", message: `${label} : ratio ${ratio.toFixed(2)} hors limites (${range.min.toFixed(2)} à ${range.max.toFixed(2)}). Aucun recadrage automatique.` });
      }
    }
  }
  if (media.length === 0 && !caps.contentTypes.includes("TEXT")) issues.push({ field: "media", message: "Publication texte seul non prise en charge." });
  return issues;
}
