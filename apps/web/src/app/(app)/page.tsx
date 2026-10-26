import Link from "next/link";
import { prisma } from "@app/db";
import { getSettings } from "@app/core/settings";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { POST_STATUS } from "@/lib/post-status";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  await requireUser();
  const [byStatus, mediaCount, recent, settings] = await Promise.all([
    prisma.post.groupBy({ by: ["status"], _count: true }),
    prisma.mediaAsset.count(),
    prisma.post.findMany({ orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, title: true, status: true, updatedAt: true } }),
    getSettings(),
  ]);
  const count = (...statuses: (keyof typeof POST_STATUS)[]) =>
    byStatus.filter((s) => statuses.includes(s.status)).reduce((sum, s) => sum + s._count, 0);

  const stats = [
    { label: "Brouillons", value: count("DRAFT"), href: "/publications" },
    { label: "Programmées", value: count("SCHEDULED", "PUBLISHING"), href: "/publications" },
    { label: "En erreur", value: count("FAILED", "PARTIAL"), href: "/publications", danger: true },
    { label: "Médias", value: mediaCount, href: "/medias" },
  ];

  return (
    <>
      <PageHeader title="Tableau de bord" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-lg border border-border bg-surface p-4 hover:border-accent">
            <p className="text-sm text-muted">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${s.danger && s.value > 0 ? "text-danger" : ""}`}>{s.value}</p>
          </Link>
        ))}
      </div>
      <Card>
        <CardTitle className="mb-3">Dernières publications modifiées</CardTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">Rien pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/publications/${p.id}`} className="truncate hover:underline">
                  {p.title}
                </Link>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  <Badge tone={POST_STATUS[p.status].tone}>{POST_STATUS[p.status].label}</Badge>
                  {formatDateTime(p.updatedAt, settings.defaultTimezone)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
