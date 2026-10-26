"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteMedia, MediaInUseError } from "@app/core/media";
import { requireUser } from "@/lib/session";

export async function deleteMediaAction(id: string): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await deleteMedia(z.uuid().parse(id), user.email);
  } catch (error) {
    if (error instanceof MediaInUseError) return { error: error.message };
    throw error;
  }
  revalidatePath("/medias");
  return {};
}
