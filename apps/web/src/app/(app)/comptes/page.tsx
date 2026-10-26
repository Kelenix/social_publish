import Link from "next/link";
import { connectorForPlatform, connectorState, getConnector, redirectUriFor, SIMULATION_SCENARIOS, type ConnectorState } from "@app/core/connectors";
import { PLATFORM_LABELS, REAL_PLATFORMS } from "@app/core/platforms";
import { listAccounts } from "@app/core/scheduling";
import { createTestAccountAction, reconnectTestAccountAction } from "../programmation-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Comptes" };

const STATE: Record<ConnectorState, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  NOT_CONFIGURED: { label: "Non configuré", tone: "neutral" },
  CONNECTION_REQUIRED: { label: "Connexion requise", tone: "warning" },
  READY: { label: "Prêt", tone: "success" },
  PERMISSION_MISSING: { label: "Permission manquante", tone: "danger" },
  PLATFORM_REVIEW_REQUIRED: { label: "Validation de la plateforme requise", tone: "warning" },
  RECONNECT_REQUIRED: { label: "Reconnexion nécessaire", tone: "danger" },
  MANUAL_ONLY: { label: "Mode manuel uniquement", tone: "neutral" },
};

/** Variables à renseigner pour activer un connecteur OAuth (procédures dans docs/). */
const SETUP: Record<string, string> = {
  youtube: "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET et TOKEN_ENCRYPTION_KEY dans .env (procédure : docs/youtube.md)",
  instagram: "INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, TOKEN_ENCRYPTION_KEY, ainsi que PUBLIC_BASE_URL (HTTPS public) et MEDIA_URL_SIGNING_KEY (procédure : docs/connecteurs.md)",
  facebook: "FACEBOOK_APP_ID, FACEBOOK_APP_SECRET et TOKEN_ENCRYPTION_KEY (procédure : docs/connecteurs.md)",
  linkedin: "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET et TOKEN_ENCRYPTION_KEY (procédure : docs/connecteurs.md)",
  x: "X_CLIENT_ID, X_CLIENT_SECRET et TOKEN_ENCRYPTION_KEY (procédure : docs/connecteurs.md)",
};

export default async function AccountsPage({ searchParams }: PageProps<"/comptes">) {
  await requireUser();
  const { connecte, erreur } = await searchParams;
  const accounts = await listAccounts();
  const testAccounts = accounts.filter((a) => a.connector === "test");
  const caps = getConnector("test").capabilities();

  return (
    <>
      <PageHeader title="Comptes connectés" description="Connexion uniquement via les API officielles et OAuth." />
      {typeof connecte === "string" && (
        <p role="status" className="mb-4 rounded-md border border-success/40 bg-success/10 p-3 text-sm">
          Compte « {connecte} » connecté.
        </p>
      )}
      {typeof erreur === "string" && (
        <p role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {erreur}
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold">Réseaux sociaux</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REAL_PLATFORMS.map((platform) => {
            const connector = connectorForPlatform(platform)!;
            const state = connectorState(connector, accounts.filter((a) => a.connector === connector.id));
            return (
              <li key={platform} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{PLATFORM_LABELS[platform]}</span>
                  <Badge tone={STATE[state].tone}>{STATE[state].label}</Badge>
                </div>
                {connector.manualOnly && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted">
                    {connector.capabilities().notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
                {connector.oauth && !connector.isConfigured() && (
                  <p className="mt-2 text-xs text-muted">
                    À configurer : {SETUP[connector.id]}. URL de retour OAuth : <code className="font-mono">{redirectUriFor(connector.id)}</code>
                  </p>
                )}
                {connector.oauth && connector.isConfigured() && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted">
                      URL de retour à déclarer chez {PLATFORM_LABELS[platform]} :{" "}
                      <code className="font-mono break-all select-all text-foreground">{redirectUriFor(connector.id)}</code>
                    </p>
                    {accounts
                      .filter((a) => a.connector === connector.id)
                      .map((a) => (
                        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="truncate">{a.displayName}</span>
                          <span className="flex items-center gap-2">
                            <Badge tone={STATE[a.status].tone}>{STATE[a.status].label}</Badge>
                            {a.status !== "READY" && (
                              <Link href={`/api/oauth/${connector.id}/start`} prefetch={false} className={buttonVariants({ size: "sm" })}>
                                Reconnecter
                              </Link>
                            )}
                          </span>
                          {a.statusDetail && <p className="w-full text-xs text-danger">{a.statusDetail}</p>}
                        </div>
                      ))}
                    <Link href={`/api/oauth/${connector.id}/start`} prefetch={false} className={buttonVariants({ size: "sm", variant: "primary" })}>
                      Connecter un compte {PLATFORM_LABELS[platform]}
                    </Link>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted">
                      {connector.capabilities().notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Connecteur de test</h2>
          <Badge tone="warning">Simulation — aucun réseau réel</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Sert à vérifier la programmation, le worker et les reprises sur erreur sans identifiants. Les publications restent dans la base locale.
          Limites simulées : {caps.limits.textMax} caractères, {caps.limits.mediaMax} médias.
        </p>
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {testAccounts.length === 0 && <li className="p-4 text-sm text-muted">Aucun compte de test.</li>}
            {testAccounts.map((a) => {
              const scenario = (a.metadata as { simulate?: keyof typeof SIMULATION_SCENARIOS }).simulate ?? "success";
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <p className="text-sm font-medium">{a.displayName}</p>
                    <p className="text-xs text-muted">
                      Scénario : {SIMULATION_SCENARIOS[scenario]}
                      {a.statusDetail && ` · ${a.statusDetail}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATE[a.status].tone}>{STATE[a.status].label}</Badge>
                    {a.status !== "READY" && (
                      <form action={reconnectTestAccountAction.bind(null, a.id)}>
                        <Button size="sm">Reconnecter</Button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Card>
            <form action={createTestAccountAction} className="space-y-3">
              <CardTitle>Ajouter un compte de test</CardTitle>
              <div>
                <Label htmlFor="name">Nom</Label>
                <Input id="name" name="name" defaultValue="Compte de test" required maxLength={80} />
              </div>
              <div>
                <Label htmlFor="simulate">Comportement</Label>
                <Select id="simulate" name="simulate" defaultValue="success">
                  {Object.entries(SIMULATION_SCENARIOS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" variant="primary">
                Ajouter
              </Button>
            </form>
          </Card>
        </div>
      </section>
    </>
  );
}
