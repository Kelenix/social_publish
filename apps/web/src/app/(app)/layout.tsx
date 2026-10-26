import { LogOut } from "lucide-react";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { logout } from "../connexion/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="md:grid md:min-h-dvh md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 z-10 flex flex-col border-b border-border bg-surface md:h-dvh md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 md:py-5">
          <span className="flex items-center gap-2 font-semibold">
            <span className="size-2.5 rounded-full bg-accent" aria-hidden />
            Studio
          </span>
          <div className="flex md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:pb-0">
          <NavLinks />
        </nav>
        <div className="hidden items-center justify-between gap-2 border-t border-border p-3 md:flex">
          <span className="truncate text-xs text-muted" title={user.email}>
            {user.email}
          </span>
          <div className="flex">
            <ThemeToggle />
            <form action={logout}>
              <Button variant="ghost" size="icon" aria-label="Se déconnecter">
                <LogOut />
              </Button>
            </form>
          </div>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
