"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@app/core/audit";
import { createSession, deleteSession, SESSION_COOKIE, verifyCredentials } from "@app/core/auth";
import { sessionCookieOptions } from "@/lib/session";
import { loginLimiter } from "@/lib/rate-limit";

const schema = z.object({ email: z.email().max(320), password: z.string().min(1).max(512) });

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "E-mail ou mot de passe invalide." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  // Clé par e-mail (l'en-tête x-forwarded-for est falsifiable) : bloque la force brute quelle que soit l'IP.
  const key = parsed.data.email.toLowerCase();
  const wait = loginLimiter.retryAfterSeconds(key);
  if (wait > 0) return { error: `Trop de tentatives. Réessaie dans ${Math.ceil(wait / 60)} min.` };

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    loginLimiter.fail(key);
    await audit({ actor: "anonymous", action: "auth.login_failed", meta: { ip } });
    return { error: "E-mail ou mot de passe invalide." };
  }

  loginLimiter.reset(key);
  const session = await createSession(user.id);
  (await cookies()).set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  await audit({ actor: user.email, action: "auth.login", meta: { ip } });
  redirect("/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
  redirect("/connexion");
}
