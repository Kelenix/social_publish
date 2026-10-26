import { redirect } from "next/navigation";
import { OAuthFlowError, startAuthorization } from "@app/core/connectors";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Démarre la connexion OAuth d'un compte (redirection vers la plateforme). */
export async function GET(_request: Request, { params }: RouteContext<"/api/oauth/[connector]/start">) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const { connector } = await params;
  let url: string;
  try {
    url = await startAuthorization(connector, user.email);
  } catch (error) {
    const message = error instanceof OAuthFlowError ? error.message : "Connecteur inconnu.";
    redirect(`/comptes?erreur=${encodeURIComponent(message)}`);
  }
  redirect(url);
}
