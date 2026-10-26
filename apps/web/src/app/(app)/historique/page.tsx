import Link from "next/link";
import type { DestinationStatus } from "@app/db";
import { listDestinations } from "@app/core/scheduling";
import { getSettings } from "@app/core/settings";
import { DestinationList } from "@/components/destination-list";
import { PageHeader } from "@/components/ui/page-header";
import { toDestinationView } from "@/lib/destinations";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Historique" };

const FILTERS: { key: string; label: string; statuses?: DestinationStatus[] }[] = [
  { key: "tout", label: "Tout" },
  { key: "a-traiter", label: "À traiter", statuses: ["FAILED", "UNCERTAIN", "MISSED"] },
  { key: "en-cours", label: "En cours", statuses: ["PENDING", "PUBLISHING", "PROCESSING", "RETRY_WAIT"] },
  { key: "publiees", label: "Publiées", statuses: ["PUBLISHED"] },
];

export default async function HistoryPage({ searchParams }: PageProps<"/historique">) {
  await requireUser();
  const { filtre } = await searchParams;
  const active = FILTERS.find((f) => f.key === filtre) ?? FILTERS[0]!;
  const [destinations, settings] = await Promise.all([
    listDestinations(active.statuses ? { status: { in: active.statuses } } : {}),
    getSettings(),
  ]);
  return (
    <>
      <PageHeader title="Historique des publications" description="Chaque destination a son propre état : un échec n'affecte pas les autres." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtres">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/historique?filtre=${f.key}`}
            aria-current={f === active ? "page" : undefined}
            className={cn("rounded-full border border-border px-3 py-1 text-sm", f === active ? "border-accent bg-accent text-accent-foreground" : "hover:bg-surface-muted")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <DestinationList destinations={destinations.map(toDestinationView)} timezone={settings.defaultTimezone} showPost />
    </>
  );
}
