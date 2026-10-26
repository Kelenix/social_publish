"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_LABELS, type PlatformId } from "@app/core/platforms";
import { scheduleAction, type ScheduleActionResult } from "@/app/(app)/programmation-actions";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Hint, Input, Label } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export type AccountOption = { id: string; name: string; platform: PlatformId; simulated: boolean };

type Props = {
  accounts: AccountOption[];
  platforms: PlatformId[];
  timezone: string;
  /** Enregistre le brouillon en cours et renvoie son identifiant (null en cas d'erreur). */
  save: () => Promise<string | null>;
};

const fmt = (iso: string, timeZone: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone, timeZoneName: "short" });

export function SchedulePanel({ accounts, platforms, timezone, save }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const usable = accounts.filter((a) => platforms.includes(a.platform));
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"now" | "at">("at");
  const [local, setLocal] = useState("");
  const [result, setResult] = useState<ScheduleActionResult | null>(null);
  const chosen = selected.filter((id) => usable.some((a) => a.id === id));

  function submit(disambiguation?: "earlier" | "later") {
    setResult(null);
    startTransition(async () => {
      const postId = await save();
      if (!postId) return;
      const when = mode === "now" ? { mode } : { mode, local, timezone, disambiguation };
      const res = await scheduleAction(postId, chosen, when);
      setResult(res);
      if (res.ok) router.push(`/publications/${postId}`);
    });
  }

  return (
    <Card className="space-y-4">
      <CardTitle>Publier ou programmer</CardTitle>
      {usable.length === 0 ? (
        <p className="text-sm text-muted">
          Aucun compte prêt pour les plateformes choisies. Ajoute un compte dans <a className="underline" href="/comptes">Comptes</a>.
        </p>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium">Comptes</legend>
            {usable.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.includes(a.id)}
                  onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id)))}
                  className="accent-[var(--accent-strong)]"
                />
                {a.name}
                <span className="text-xs text-muted">{PLATFORM_LABELS[a.platform]}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex gap-1 rounded-md bg-surface-muted p-1 text-sm" role="radiogroup" aria-label="Quand">
            {(["at", "now"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn("flex-1 rounded px-2 py-1", mode === m && "bg-surface font-medium shadow-sm")}
              >
                {m === "at" ? "Programmer" : "Maintenant"}
              </button>
            ))}
          </div>
          {mode === "at" && (
            <div>
              <Label htmlFor="local">Date et heure</Label>
              <Input id="local" type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} />
              <Hint>Fuseau : {timezone}</Hint>
            </div>
          )}
          <Button type="button" variant="primary" className="w-full" disabled={pending || chosen.length === 0 || (mode === "at" && !local)} onClick={() => submit()}>
            {pending ? "Vérification…" : mode === "now" ? "Publier maintenant" : "Programmer"}
          </Button>
          <p className="text-xs text-muted">
            Cette action autorise la publication de la version enregistrée, sur ces comptes, à cette date. Toute modification ultérieure exige
            d&apos;annuler puis de reprogrammer.
          </p>
        </>
      )}

      {result && !result.ok && (
        <div role="alert" className="space-y-2 text-sm text-danger">
          <p>{result.message}</p>
          {result.issues?.map((i) => (
            <div key={i.account}>
              <p className="font-medium">{i.account}</p>
              <ul className="list-disc pl-5">
                {i.messages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ))}
          {result.ambiguous && (
            <div className="flex flex-col gap-2">
              <Button type="button" size="sm" onClick={() => submit("earlier")}>
                Première occurrence ({fmt(result.ambiguous.earlier, timezone)})
              </Button>
              <Button type="button" size="sm" onClick={() => submit("later")}>
                Seconde occurrence ({fmt(result.ambiguous.later, timezone)})
              </Button>
            </div>
          )}
          {result.suggestion && <p>Heure valide suivante : {fmt(result.suggestion, timezone)}.</p>}
        </div>
      )}
      {result?.ok && <p role="status" className="text-sm text-success">{mode === "now" ? "Envoi demandé au worker." : "Publication programmée."}</p>}
    </Card>
  );
}
