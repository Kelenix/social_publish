import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <div className="mb-6 flex items-center gap-2">
          <span className="size-3 rounded-full bg-accent" aria-hidden />
          <h1 className="text-lg font-semibold">Studio de publication</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
