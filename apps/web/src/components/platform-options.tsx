"use client";

import { Hint, Label, Select } from "@/components/ui/field";

type Props = { options: Record<string, unknown>; onChange: (options: Record<string, unknown>) => void };

export function LinkedInOptions({ options, onChange }: Props) {
  return (
    <div>
      <Label htmlFor="li-visibility">Visibilité LinkedIn</Label>
      <Select id="li-visibility" value={options.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC"} onChange={(e) => onChange({ ...options, visibility: e.target.value })}>
        <option value="PUBLIC">Tout le monde</option>
        <option value="CONNECTIONS">Mes relations (profil uniquement)</option>
      </Select>
      <Hint>LinkedIn publie immédiatement : l&apos;API ne permet pas de brouillon.</Hint>
    </div>
  );
}

export function InstagramOptions({ options, onChange }: Props) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        name="ig-share-to-feed"
        checked={options.shareToFeed !== false}
        onChange={(e) => onChange({ ...options, shareToFeed: e.target.checked })}
        className="mt-1 accent-[var(--accent-strong)]"
      />
      Reel : afficher aussi dans le fil (et pas seulement dans l&apos;onglet Reels)
    </label>
  );
}

export function FacebookOptions({ options, onChange }: Props) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        name="fb-native"
        checked={options.nativeScheduling !== false}
        onChange={(e) => onChange({ ...options, nativeScheduling: e.target.checked })}
        className="mt-1 accent-[var(--accent-strong)]"
      />
      <span>Programmation native : Facebook publie lui-même à l&apos;heure prévue (de 15 min à 29 jours), même ordinateur éteint.</span>
    </label>
  );
}
