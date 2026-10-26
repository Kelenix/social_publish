import { redirect } from "next/navigation";
import { completeAuthorization, OAuthFlowError } from "@app/core/connectors";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Retour de la plateforme : vérification du state, échange du code, enregistrement chiffré des jetons. */
export async function GET(request: Request, { params }: RouteContext<"/api/oauth/[connector]/callback">) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const { connector } = await params;
  const query = new URL(request.url).searchParams;
  let target: string;
  try {
    const account = await completeAuthorization(connector, { code: query.get("code"), state: query.get("state"), error: query.get("error") }, user.email);
    target = `/comptes?connecte=${encodeURIComponent(account.displayName)}`;
  } catch (error) {
    if (!(error instanceof OAuthFlowError)) console.error("Échec OAuth", error);
    const message = error instanceof OAuthFlowError ? error.message : "Connexion impossible : consulte les journaux du serveur.";
    target = `/comptes?erreur=${encodeURIComponent(message)}`;
  }
  redirect(target);
}
