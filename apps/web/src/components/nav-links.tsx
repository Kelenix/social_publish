"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, History, Image as ImageIcon, LayoutDashboard, Layers, Link2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/publications", label: "Publications", icon: FileText },
  { href: "/calendrier", label: "Calendrier", icon: CalendarDays },
  { href: "/historique", label: "Historique", icon: History },
  { href: "/modeles", label: "Modèles", icon: Layers },
  { href: "/medias", label: "Médias", icon: ImageIcon },
  { href: "/comptes", label: "Comptes", icon: Link2 },
  { href: "/reglages", label: "Réglages", icon: Settings },
];

export function NavLinks() {
  const pathname = usePathname();
  return LINKS.map(({ href, label, icon: Icon }) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
          active && "bg-surface-muted font-medium text-foreground",
        )}
      >
        <Icon className={cn("size-4", active && "text-accent-strong")} />
        {label}
      </Link>
    );
  });
}
