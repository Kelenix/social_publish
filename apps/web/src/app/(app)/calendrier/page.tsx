import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@app/db";
import { getSettings } from "@app/core/settings";
import { utcToZonedInput, zonedToUtc } from "@app/core/time";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { POST_STATUS } from "@/lib/post-status";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendrier" };

const DAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const TONE_DOT = { neutral: "bg-muted", accent: "bg-accent-strong", success: "bg-success", danger: "bg-danger", warning: "bg-warning" };

/** Minuit local du 1er jour d'un mois, en UTC (minuit n'est jamais sauté en Europe ; repli sur l'heure suivante sinon). */
function monthStart(year: number, month: number, timeZone: string): Date {
  const local = `${year}-${String(month).padStart(2, "0")}-01T00:00`;
  const r = zonedToUtc(local, timeZone, "earlier");
  return r.ok ? r.utc : r.reason === "NONEXISTENT" ? r.suggestion : new Date(`${local}:00Z`);
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendrier">) {
  await requireUser();
  const { defaultTimezone: tz } = await getSettings();
  const { mois } = await searchParams;
  const today = utcToZonedInput(new Date(), tz);
  const [year, month] = (typeof mois === "string" && /^\d{4}-\d{2}$/.test(mois) ? mois : today.slice(0, 7)).split("-").map(Number) as [number, number];

  const start = monthStart(year, month, tz);
  const end = monthStart(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, tz);
  const posts = await prisma.post.findMany({
    where: { scheduledAt: { gte: start, lt: end }, status: { not: "DRAFT" } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, title: true, status: true, scheduledAt: true },
  });
  const byDay = new Map<string, typeof posts>();
  for (const p of posts) {
    const day = utcToZonedInput(p.scheduledAt!, tz).slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), p]);
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array<null>(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const key = (d: number) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const shift = (delta: number) => {
    const m = month + delta;
    const y = year + Math.floor((m - 1) / 12);
    return `${y}-${String(((m - 1 + 12) % 12) + 1).padStart(2, "0")}`;
  };
  const title = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader
        title="Calendrier"
        description={`Heures affichées dans le fuseau ${tz}.`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/calendrier?mois=${shift(-1)}`} className={buttonVariants({ size: "icon" })} aria-label="Mois précédent">
              <ChevronLeft />
            </Link>
            <span className="min-w-36 text-center text-sm font-medium capitalize">{title}</span>
            <Link href={`/calendrier?mois=${shift(1)}`} className={buttonVariants({ size: "icon" })} aria-label="Mois suivant">
              <ChevronRight />
            </Link>
          </div>
        }
      />
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
        {DAYS.map((d) => (
          <div key={d} className="bg-surface-muted px-2 py-1 text-xs text-muted">
            {d}
          </div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className={cn("min-h-20 bg-surface p-1.5 sm:min-h-28", day === null && "bg-surface-muted/50")}>
            {day !== null && (
              <>
                <span className={cn("text-xs", key(day) === today.slice(0, 10) && "rounded bg-accent px-1 font-semibold text-accent-foreground")}>{day}</span>
                <ul className="mt-1 space-y-1">
                  {byDay.get(key(day))?.map((p) => (
                    <li key={p.id}>
                      <Link href={`/publications/${p.id}`} className="flex items-center gap-1 truncate rounded px-1 text-xs hover:bg-surface-muted" title={`${p.title} — ${POST_STATUS[p.status].label}`}>
                        <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[POST_STATUS[p.status].tone])} aria-hidden />
                        <span className="font-mono">{utcToZonedInput(p.scheduledAt!, tz).slice(11)}</span>
                        <span className="hidden truncate sm:inline">{p.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
