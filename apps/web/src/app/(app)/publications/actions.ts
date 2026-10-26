"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createDraft, deleteDraft, duplicatePost, PostNotEditableError, UnknownMediaError, updateDraft } from "@app/core/posts";
import { postInputSchema, type PostInput } from "@app/core/posts/schema";
import { requireUser } from "@/lib/session";

export type SaveResult = { ok: true; id: string; version: number } | { ok: false; error: string };

export async function saveDraftAction(id: string | null, input: PostInput): Promise<SaveResult> {
  const user = await requireUser();
  const parsed = postInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "contenu"} : ${i.message}`).join(" ; ") };
  }
  try {
    const post = id ? await updateDraft(z.uuid().parse(id), parsed.data, user.email) : await createDraft(parsed.data, user.email);
    revalidatePath("/publications");
    return { ok: true, id: post.id, version: post.version };
  } catch (error) {
    if (error instanceof PostNotEditableError || error instanceof UnknownMediaError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function duplicatePostAction(id: string): Promise<void> {
  const user = await requireUser();
  const copy = await duplicatePost(z.uuid().parse(id), user.email);
  revalidatePath("/publications");
  redirect(`/publications/${copy.id}`);
}

export async function deleteDraftAction(id: string): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await deleteDraft(z.uuid().parse(id), user.email);
  } catch (error) {
    if (error instanceof PostNotEditableError) return { error: error.message };
    throw error;
  }
  revalidatePath("/publications");
  return {};
}
