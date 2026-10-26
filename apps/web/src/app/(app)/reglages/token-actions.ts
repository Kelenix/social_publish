"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createApiToken, revokeApiToken, TOKEN_SCOPES } from "@app/core/tokens";
import { requireUser } from "@/lib/session";

const schema = z.object({
  name: z.string().trim().min(1, "Nom obligatoire.").max(80),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1, "Choisis au moins une portée."),
  expiresInDays: z.coerce.number().int().min(0).max(3650),
});

export type TokenFormState = { error?: string; token?: string };

/** Le jeton en clair n'est renvoyé qu'une fois, à l'écran de création. */
export async function createTokenAction(_prev: TokenFormState, form: FormData): Promise<TokenFormState> {
  const user = await requireUser();
  const parsed = schema.safeParse({ name: form.get("name"), scopes: form.getAll("scopes"), expiresInDays: form.get("expiresInDays") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { token } = await createApiToken(parsed.data.name, parsed.data.scopes, parsed.data.expiresInDays || null, user.email);
  revalidatePath("/reglages");
  return { token };
}

export async function revokeTokenAction(id: string): Promise<void> {
  const user = await requireUser();
  await revokeApiToken(z.uuid().parse(id), user.email);
  revalidatePath("/reglages");
}
