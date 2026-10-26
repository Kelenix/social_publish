import { z } from "zod";
import { PLATFORMS } from "../platforms";

/** Module pur (sans accès base) : partagé par l'UI, l'API, le worker et le MCP. */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const hashtag = z
  .string()
  .trim()
  .transform((s) => s.replace(/^#+/, ""))
  .pipe(z.string().min(1).max(100).regex(/^[\p{L}\p{N}_]+$/u, "Hashtag invalide (lettres, chiffres et _ uniquement)."));

const hashtags = z
  .array(hashtag)
  .max(100)
  .transform((tags) => [...new Set(tags)]);

/** Accepte « #a #b, c » ou une liste. */
export function parseHashtags(input: string): string[] {
  return input.split(/[\s,]+/).filter(Boolean);
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined || v === null || v.trim() === "" ? null : v));

export const variantInputSchema = z.object({
  platform: z.enum(PLATFORMS),
  enabled: z.boolean().default(true),
  text: optionalText(65_000),
  title: optionalText(500),
  description: optionalText(65_000),
  hashtags: hashtags.default([]),
  mediaIds: z.array(z.uuid()).max(35).default([]),
  options: z.record(z.string(), z.json()).default({}),
});

export const postInputSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(200),
  body: z.string().max(65_000).default(""),
  hashtags: hashtags.default([]),
  mediaIds: z
    .array(z.uuid())
    .max(35)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, "Média en double."),
  timezone: z.string().refine(isValidTimeZone, "Fuseau horaire IANA invalide.").default("Europe/Rome"),
  variants: z
    .array(variantInputSchema)
    .default([])
    .refine((v) => new Set(v.map((x) => x.platform)).size === v.length, "Une seule variante par plateforme."),
});

export type PostInput = z.input<typeof postInputSchema>;
export type ParsedPostInput = z.output<typeof postInputSchema>;
export type VariantInput = z.output<typeof variantInputSchema>;

type ContentSource = {
  title: string;
  body: string;
  hashtags: string[];
  mediaIds: string[];
};

export type ResolvedVariant = {
  platform: VariantInput["platform"];
  text: string;
  title: string;
  description: string;
  hashtags: string[];
  mediaIds: string[];
  options: Record<string, unknown>;
};

/** Contenu effectif d'une plateforme : un champ de variante vide hérite du contenu principal. */
export function resolveVariant(post: ContentSource, variant: Omit<VariantInput, "enabled">): ResolvedVariant {
  return {
    platform: variant.platform,
    text: variant.text ?? post.body,
    title: variant.title ?? post.title,
    description: variant.description ?? post.body,
    hashtags: variant.hashtags.length > 0 ? variant.hashtags : post.hashtags,
    mediaIds: variant.mediaIds.length > 0 ? variant.mediaIds : post.mediaIds,
    options: variant.options as Record<string, unknown>,
  };
}

/** Texte final tel qu'il sera publié (texte + hashtags). */
export function composeCaption(text: string, tags: string[]): string {
  const suffix = tags.map((t) => `#${t}`).join(" ");
  return [text.trim(), suffix].filter(Boolean).join("\n\n");
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  }
  return value;
}

/**
 * Empreinte du contenu publiable. Le titre interne n'en fait partie que via les variantes
 * qui l'héritent. Une empreinte différente = modification substantielle (incrément de version).
 */
export function contentFingerprint(input: ParsedPostInput): string {
  const variants = [...input.variants]
    .sort((a, b) => a.platform.localeCompare(b.platform))
    .map((v) => ({ enabled: v.enabled, ...resolveVariant(input, v) }));
  return JSON.stringify(stable({ body: input.body, hashtags: input.hashtags, mediaIds: input.mediaIds, variants }));
}
