import Link from "next/link";
import { z } from "zod";
import { PLATFORM_LABELS } from "@app/core/platforms";
import { listAccounts } from "@app/core/scheduling";
import { getSettings } from "@app/core/settings";
import { listTemplates } from "@app/core/workflows";
import { deleteTemplateAction } from "./actions";
import { TemplateForm, type TemplateFormValue } from "@/components/template-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { timezones } from "@/lib/post-status";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Modèles" };

export default async function TemplatesPage({ searchParams }: PageProps<"/modeles">) {
  await requireUser();
  const { modifier } = await searchParams;
  const [templates, accounts, settings] = await Promise.all([listTemplates(), listAccounts(), getSettings()]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const editing = templates.find((t) => t.id === z.uuid().safeParse(modifier).data);

  const initial: TemplateFormValue = editing
    ? {
        id: editing.id,
        name: editing.name,
        accountIds: editing.accountIds.filter((id) => byId.has(id)),
        timezone: editing.timezone,
        defaultTime: editing.defaultTime ?? "",
        validationMode: editing.validationMode,
        hashtags: editing.hashtags.map((h) => `#${h}`).join(" "),
        options: editing.options as TemplateFormValue["options"],
      }
    : { id: null, name: "", accountIds: [], timezone: settings.defaultTimezone, defaultTime: "", validationMode: "REVIEW", hashtags: "", options: {} };

  return (
    <>
      <PageHeader title="Modèles de workflow" description="Comptes, formats préférés, fuseau, horaire et mode de validation, réutilisables pour chaque publication." />
      <div className="grid gap-6 lg:grid-cols-[1fr_28rem]">
        <section>
          {templates.length === 0 ? (
            <p className="text-sm text-muted">Aucun modèle pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {templates.map((t) => {
                const targets = t.accountIds.map((id) => byId.get(id)).filter((a) => a !== undefined);
                return (
                  <li key={t.id} className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{t.name}</span>
                      <Badge tone={t.validationMode === "QUICK" ? "accent" : "neutral"}>{t.validationMode === "QUICK" ? "Rapide" : "Relecture"}</Badge>
                    </div>
                    <p className="flex flex-wrap gap-1.5 text-xs text-muted">
                      {targets.map((a) => (
                        <Badge key={a.id}>
                          {a.displayName} · {PLATFORM_LABELS[a.platform]}
                        </Badge>
                      ))}
                      {targets.length < t.accountIds.length && <Badge tone="warning">{t.accountIds.length - targets.length} compte(s) supprimé(s)</Badge>}
                    </p>
                    <p className="font-mono text-xs text-muted">
                      {t.timezone}
                      {t.defaultTime && ` · ${t.defaultTime}`}
                      {t.hashtags.length > 0 && ` · ${t.hashtags.map((h) => `#${h}`).join(" ")}`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/publications/nouvelle?modele=${t.id}`} className={buttonVariants({ size: "sm", variant: "primary" })}>
                        Nouvelle publication
                      </Link>
                      <Link href={`/modeles?modifier=${t.id}`} className={buttonVariants({ size: "sm" })}>
                        Modifier
                      </Link>
                      <form action={deleteTemplateAction.bind(null, t.id)}>
                        <Button size="sm" variant="danger">
                          Supprimer
                        </Button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <TemplateForm
          key={editing?.id ?? "nouveau"}
          initial={initial}
          timezones={timezones()}
          accounts={accounts.map((a) => ({ id: a.id, name: a.displayName, platform: a.platform, ready: a.status === "READY" }))}
        />
      </div>
    </>
  );
}
