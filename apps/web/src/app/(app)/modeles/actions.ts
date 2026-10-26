"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteTemplate, saveTemplate, TemplateError, type TemplateInput } from "@app/core/workflows";
import { requireUser } from "@/lib/session";

export type TemplateResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveTemplateAction(id: string | null, input: TemplateInput): Promise<TemplateResult> {
  const user = await requireUser();
  try {
    const template = await saveTemplate(id ? z.uuid().parse(id) : null, input, user.email);
    revalidatePath("/modeles");
    return { ok: true, id: template.id };
  } catch (error) {
    if (error instanceof TemplateError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues.map((i) => i.message).join(" ") };
    throw error;
  }
}

export async function deleteTemplateAction(id: string): Promise<void> {
  const user = await requireUser();
  await deleteTemplate(z.uuid().parse(id), user.email);
  revalidatePath("/modeles");
}
