"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { changePassword } from "@app/core/auth";
import { audit } from "@app/core/audit";
import { isValidTimeZone } from "@app/core/posts/schema";
import { updateSettings } from "@app/core/settings";
import { requireUser } from "@/lib/session";

export type FormState = { error?: string; success?: string };

const settingsSchema = z.object({
  defaultTimezone: z.string().refine(isValidTimeZone, "Fuseau horaire invalide."),
  missedPolicy: z.enum(["ASK_RESCHEDULE", "PUBLISH_IF_RECENT", "CANCEL"]),
});

export async function saveSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await updateSettings(parsed.data, user.email);
  revalidatePath("/reglages");
  return { success: "Réglages enregistrés." };
}

const passwordSchema = z
  .object({ current: z.string().min(1), next: z.string().min(12, "12 caractères minimum.").max(512), confirm: z.string() })
  .refine((d) => d.next === d.confirm, "Les deux mots de passe ne correspondent pas.");

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!(await changePassword(user.id, parsed.data.current, parsed.data.next))) return { error: "Mot de passe actuel incorrect." };
  await audit({ actor: user.email, action: "auth.password_changed" });
  // Toutes les sessions ont été révoquées : reconnexion obligatoire.
  redirect("/connexion");
}
