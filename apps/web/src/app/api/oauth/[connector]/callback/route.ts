import { redirect } from "next/navigation";
import { completeAuthorization, OAuthFlowError } from "@app/core/connectors";
import { getConfig } from "@app/core/config";

export const dynamic = "force-dynamic";

/**
 * Retour de la plateforme : vérification et consommation du state (preuve que la demande vient de
 * l'administrateur connecté), échange du code, enregistrement chiffré des jetons. Pas de session
 * exigée : le retour peut arriver par l'adresse publique HTTPS (Instagram). On revient ensuite sur
 * l'application (APP_URL).
 */
export async function GET(request: Request, { params }: RouteContext<"/api/oauth/[connector]/callback">) {
  const { connector } = await params;
  const query = new URL(request.url).searchParams;
  const back = new URL("/comptes", getConfig().APP_URL);
  try {
    const account = await completeAuthorization(connector, { code: query.get("code"), state: query.get("state"), error: query.get("error") });
    back.searchParams.set("connecte", account.displayName);
  } catch (error) {
    if (!(error instanceof OAuthFlowError)) console.error("Échec OAuth", error);
    back.searchParams.set("erreur", error instanceof OAuthFlowError ? error.message : "Connexion impossible : consulte les journaux du serveur.");
  }
  redirect(back.toString());
}
