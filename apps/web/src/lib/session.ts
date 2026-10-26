import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, SESSION_COOKIE } from "@app/core/auth";
import { getConfig } from "@app/core/config";

export const getCurrentUser = cache(async () => getSessionUser((await cookies()).get(SESSION_COOKIE)?.value));

/** À appeler dans chaque page, action serveur et route protégée. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return user;
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getConfig().APP_URL.startsWith("https://"),
    path: "/",
    expires,
  };
}

/** Protection CSRF des routes API mutantes : l'origine doit être celle de l'application. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(getConfig().APP_URL).origin;
}
