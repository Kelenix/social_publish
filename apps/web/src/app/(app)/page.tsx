import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@app/db";
import { workerHealth } from "@app/core/scheduling/executor";
import { ACTIVE_STATUSES, DESTINATION_STATUS_LABELS } from "@app/core/scheduling/status";
import { PLATFORM_LABELS } from "@app/core/platforms";
import { getSettings } from "@app/core/settings";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  await requireUser();
  const [settings, worker, upcoming, problems, accounts, drafts, mediaCount, activeCount, problemCount] = await Promise.all([
    getSettings(),
    workerHealth(),
    prisma.destination.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      orderBy: { nextAttemptAt: "asc" },
      take: 6,
      include: { post: { select: { id: true, title: true } }, account: { select: { displayName: true } } },
    }),
    prisma.destination.findMany({
      where: { status: { in: ["FAILED", "UNCERTAIN", "MISSED"] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { post: { select: { id: true, title: true } }, account: { select: { displayName: true } } },
    }),
    prisma.connectedAccount.findMany({ where: { status: { not: "READY" } } }),
    prisma.post.count({ where: { status: "DRAFT" } }),
    prisma.mediaAsset.count(),
    prisma.destination.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    prisma.destination.count({ where: { status: { in: ["FAILED", "UNCERTAIN", "MISSED"] } } }),
  ]);
  const tz = settings.defaultTimezone;

  return (
    <>
      <PageHeader title="Tableau de bord" />

      <div role="note" className="mb-6 flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          Programmation locale : les publications ne partent que si cet ordinateur est allumé, connecté à Internet, hors veille, avec Docker Desktop
          actif. Une publication manquée pendant un arrêt est traitée selon la règle choisie dans{" "}
          <Link href="/reglages" className="underline">
            Réglages
          </Link>
          .
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted">Worker</p>
          <p className="mt-1 flex items-center gap-2 font-semibold">
            <span className={`size-2.5 rounded-full ${worker.alive ? "bg-success" : "bg-danger"}`} aria-hidden />
            {worker.alive ? "Actif" : "Arrêté"}
          </p>
          <p className="mt-1 text-xs text-muted">{worker.lastSeenAt ? `Vu : ${formatDateTime(worker.lastSeenAt, tz)}` : "Jamais démarré"}</p>
        </Card>
        {[
          { label: "En attente d'envoi", value: activeCount, href: "/historique?filtre=en-cours" },
          { label: "À traiter", value: problemCount, href: "/historique?filtre=a-traiter", danger: true },
          { label: "Brouillons · médias", value: `${drafts} · ${mediaCount}`, href: "/publications" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="rounded-lg border border-border bg-surface p-4 hover:border-accent">
            <p className="text-sm text-muted">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${s.danger && Number(s.value) > 0 ? "text-danger" : ""}`}>{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Prochains envois</CardTitle>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">Rien de programmé.</p>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/publications/${d.post.id}`} className="min-w-0 truncate hover:underline">
                    {d.post.title} <span className="text-muted">· {d.account.displayName} ({PLATFORM_LABELS[d.platform]})</span>
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-muted">{formatDateTime(d.nextAttemptAt, tz)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle className="mb-3">Erreurs et décisions en attente</CardTitle>
          {problems.length === 0 && accounts.length === 0 ? (
            <p className="text-sm text-muted">Aucun problème.</p>
          ) : (
            <ul className="divide-y divide-border">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href="/comptes" className="truncate hover:underline">
                    Compte « {a.displayName} »
                  </Link>
                  <Badge tone="danger">À reconnecter</Badge>
                </li>
              ))}
              {problems.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/publications/${d.post.id}`} className="min-w-0 truncate hover:underline">
                    {d.post.title} <span className="text-muted">· {d.account.displayName}</span>
                  </Link>
                  <Badge tone={d.status === "FAILED" ? "danger" : "warning"}>{DESTINATION_STATUS_LABELS[d.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
