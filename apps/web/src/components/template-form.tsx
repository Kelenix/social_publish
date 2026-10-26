"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_LABELS, PLATFORMS, type PlatformId } from "@app/core/platforms";
import type { TemplateInput } from "@app/core/workflows";
import { saveTemplateAction } from "@/app/(app)/modeles/actions";
import { FacebookOptions, InstagramOptions, LinkedInOptions } from "@/components/platform-options";
import { YouTubeOptions } from "@/components/youtube-options";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Hint, Input, Label, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export type TemplateAccount = { id: string; name: string; platform: PlatformId; ready: boolean };
export type TemplateFormValue = {
  id: string | null;
  name: string;
  accountIds: string[];
  timezone: string;
  defaultTime: string;
  validationMode: "REVIEW" | "QUICK";
  hashtags: string;
  options: Partial<Record<PlatformId, Record<string, unknown>>>;
};

type OptionsProps = { options: Record<string, unknown>; onChange: (o: Record<string, unknown>) => void };
const OPTION_EDITORS: Partial<Record<PlatformId, (p: OptionsProps) => React.ReactNode>> = {
  YOUTUBE: YouTubeOptions,
  INSTAGRAM: InstagramOptions,
  FACEBOOK: FacebookOptions,
  LINKEDIN: LinkedInOptions,
};

export function TemplateForm({ initial, accounts, timezones }: { initial: TemplateFormValue; accounts: TemplateAccount[]; timezones: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<TemplateFormValue>) => setValue((v) => ({ ...v, ...patch }));
  const platforms = PLATFORMS.filter((p) => accounts.some((a) => a.platform === p && value.accountIds.includes(a.id)));

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveTemplateAction(value.id, {
        name: value.name,
        accountIds: value.accountIds,
        timezone: value.timezone,
        defaultTime: value.defaultTime || null,
        validationMode: value.validationMode,
        hashtags: value.hashtags.split(/[\s,]+/).filter(Boolean),
        // Seuls les réglages des plateformes encore ciblées sont conservés.
        options: Object.fromEntries(platforms.map((p) => [p, value.options[p] ?? {}])) as TemplateInput["options"],
      });
      if (!result.ok) return setError(result.error);
      router.push("/modeles");
    });
  }

  return (
    <Card className="space-y-5">
      <CardTitle>{value.id ? "Modifier le modèle" : "Nouveau modèle"}</CardTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="tpl-name">Nom</Label>
          <Input id="tpl-name" value={value.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Vidéo de la semaine" />
        </div>
        <div>
          <Label htmlFor="tpl-hashtags">Hashtags par défaut</Label>
          <Input id="tpl-hashtags" value={value.hashtags} onChange={(e) => set({ hashtags: e.target.value })} placeholder="#marque #serie" />
        </div>
        <div>
          <Label htmlFor="tpl-timezone">Fuseau horaire</Label>
          <Select id="tpl-timezone" value={value.timezone} onChange={(e) => set({ timezone: e.target.value })}>
            {timezones.map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="tpl-time">Heure habituelle de publication</Label>
          <Input id="tpl-time" type="time" value={value.defaultTime} onChange={(e) => set({ defaultTime: e.target.value })} />
          <Hint>Facultatif : proposée au prochain créneau disponible.</Hint>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Comptes cibles</legend>
        {accounts.length === 0 && <p className="text-sm text-muted">Aucun compte : connecte d&apos;abord un réseau dans Comptes.</p>}
        <div className="grid gap-1 sm:grid-cols-2">
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="tpl-accounts"
                value={a.id}
                checked={value.accountIds.includes(a.id)}
                onChange={(e) => set({ accountIds: e.target.checked ? [...value.accountIds, a.id] : value.accountIds.filter((x) => x !== a.id) })}
                className="accent-[var(--accent-strong)]"
              />
              {a.name}
              <span className="text-xs text-muted">{PLATFORM_LABELS[a.platform]}</span>
              {!a.ready && <span className="text-xs text-warning">(à reconnecter)</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">Mode de validation</legend>
        {(
          [
            ["REVIEW", "Relecture", "Le brouillon est créé avec les variantes ; tu choisis ensuite comptes et date."],
            ["QUICK", "Rapide", "Comptes et prochain créneau déjà sélectionnés : tu relis l'aperçu et confirmes."],
          ] as const
        ).map(([mode, label, help]) => (
          <label key={mode} className={cn("flex items-start gap-2 rounded-md border border-border p-2 text-sm", value.validationMode === mode && "border-accent")}>
            <input type="radio" name="tpl-mode" checked={value.validationMode === mode} onChange={() => set({ validationMode: mode })} className="mt-1 accent-[var(--accent-strong)]" />
            <span>
              <span className="font-medium">{label}</span> — <span className="text-muted">{help}</span>
            </span>
          </label>
        ))}
        <Hint>Dans les deux cas, rien n&apos;est publié sans ta confirmation explicite.</Hint>
      </fieldset>

      {platforms.some((p) => OPTION_EDITORS[p]) && (
        <div className="space-y-4">
          <p className="text-sm font-medium">Formats préférés</p>
          {platforms.map((p) => {
            const Editor = OPTION_EDITORS[p];
            return Editor ? (
              <div key={p} className="space-y-2">
                <p className="text-xs font-medium text-muted">{PLATFORM_LABELS[p]}</p>
                <Editor options={value.options[p] ?? {}} onChange={(o) => set({ options: { ...value.options, [p]: o } })} />
              </div>
            ) : null;
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="button" variant="primary" disabled={pending || !value.name || value.accountIds.length === 0} onClick={submit}>
        {pending ? "Enregistrement…" : "Enregistrer le modèle"}
      </Button>
    </Card>
  );
}
