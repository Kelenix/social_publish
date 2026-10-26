import { z } from "zod";
import { prisma, type ConnectedAccount, type Prisma, type WorkflowTemplate } from "@app/db";
import { audit } from "./audit";
import { PLATFORMS, type PlatformId } from "./platforms";
import { isValidTimeZone, postInputSchema, type PostInput } from "./posts/schema";
import { utcToZonedInput, zonedToUtc } from "./time";

/** Modèles de workflow : comptes cibles, formats préférés, fuseau, horaire et mode de validation. */

export const VALIDATION_MODES = ["REVIEW", "QUICK"] as const;

export const templateInputSchema = z.object({
  name: z.string().trim().min(1, "Nom obligatoire.").max(80),
  accountIds: z.array(z.uuid()).min(1, "Choisis au moins un compte.").max(20),
  timezone: z.string().refine(isValidTimeZone, "Fuseau horaire IANA invalide.").default("Europe/Rome"),
  defaultTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure au format HH:mm.")
    .nullish()
    .transform((v) => v ?? null),
  validationMode: z.enum(VALIDATION_MODES).default("REVIEW"),
  hashtags: postInputSchema.shape.hashtags,
  /** Réglages préférés par plateforme, appliqués aux variantes créées depuis le modèle. */
  options: z.partialRecord(z.enum(PLATFORMS), z.record(z.string(), z.json())).default({}),
});
export type TemplateInput = z.input<typeof templateInputSchema>;

export class TemplateError extends Error {}

async function assertAccounts(tx: Prisma.TransactionClient, ids: string[]) {
  const found = await tx.connectedAccount.count({ where: { id: { in: ids } } });
  if (found !== new Set(ids).size) throw new TemplateError("Un ou plusieurs comptes sont introuvables.");
}

export function listTemplates() {
  return prisma.workflowTemplate.findMany({ orderBy: { name: "asc" } });
}

export function getTemplate(id: string) {
  return prisma.workflowTemplate.findUnique({ where: { id } });
}

export async function saveTemplate(id: string | null, raw: TemplateInput, actor: string): Promise<WorkflowTemplate> {
  const data = templateInputSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await assertAccounts(tx, data.accountIds);
    const duplicate = await tx.workflowTemplate.findFirst({ where: { name: data.name, ...(id ? { id: { not: id } } : {}) } });
    if (duplicate) throw new TemplateError("Un modèle porte déjà ce nom.");
    const values = { ...data, accountIds: [...new Set(data.accountIds)], options: data.options as Prisma.InputJsonObject };
    const template = id ? await tx.workflowTemplate.update({ where: { id }, data: values }) : await tx.workflowTemplate.create({ data: values });
    await audit({ actor, action: id ? "template.update" : "template.create", entity: "template", entityId: template.id }, tx);
    return template;
  });
}

export async function deleteTemplate(id: string, actor: string): Promise<void> {
  await prisma.workflowTemplate.delete({ where: { id } });
  await audit({ actor, action: "template.delete", entity: "template", entityId: id });
}

/** Comptes du modèle encore existants (un compte supprimé est ignoré). */
export async function templateAccounts(template: WorkflowTemplate): Promise<ConnectedAccount[]> {
  return prisma.connectedAccount.findMany({ where: { id: { in: template.accountIds } }, orderBy: { platform: "asc" } });
}

/** Contenu de départ d'une publication créée depuis le modèle (une variante par plateforme ciblée). */
export function draftFromTemplate(template: WorkflowTemplate, accounts: Pick<ConnectedAccount, "platform">[], title: string): PostInput {
  const options = template.options as Partial<Record<PlatformId, Record<string, never>>>;
  const platforms = PLATFORMS.filter((p) => accounts.some((a) => a.platform === p));
  return {
    title,
    hashtags: template.hashtags,
    timezone: template.timezone,
    templateId: template.id,
    variants: platforms.map((platform) => ({ platform, options: options[platform] ?? {} })),
  };
}

/**
 * Prochain créneau à l'heure habituelle du modèle (« AAAA-MM-JJTHH:mm » local) : aujourd'hui si
 * l'heure est à plus de 15 min, sinon demain. Un jour de changement d'heure, l'heure valide suivante.
 */
export function nextSlot(defaultTime: string, timeZone: string, now = new Date()): string {
  const today = utcToZonedInput(now, timeZone).slice(0, 10);
  for (let day = 0; day < 3; day++) {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + day);
    const local = `${date.toISOString().slice(0, 10)}T${defaultTime}`;
    const r = zonedToUtc(local, timeZone, "earlier");
    const utc = r.ok ? r.utc : r.reason === "NONEXISTENT" ? r.suggestion : null;
    if (utc && utc.getTime() > now.getTime() + 15 * 60_000) return utcToZonedInput(utc, timeZone);
  }
  throw new Error("Créneau introuvable.");
}
