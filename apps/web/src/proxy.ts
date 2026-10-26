import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@app/core/auth/cookie";

/**
 * Redirection rapide vers la connexion quand aucun cookie de session n'est présent.
 * La validation réelle de la session est faite côté serveur dans chaque page/action/route.
 * Les routes /api sont exclues : elles vérifient elles-mêmes la session (et les uploads ne
 * doivent pas être mis en mémoire tampon par le proxy).
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/connexion", request.url));
}

export const config = {
  matcher: ["/((?!api/|_next/|connexion|favicon.ico).*)"],
};
