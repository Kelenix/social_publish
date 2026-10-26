"use client";

import { Hint, Label, Select } from "@/components/ui/field";

/** Catégories YouTube courantes (identifiants de l'API). */
const CATEGORIES: [string, string][] = [
  ["22", "Personnes et blogs"],
  ["1", "Films et animations"],
  ["10", "Musique"],
  ["20", "Jeux vidéo"],
  ["24", "Divertissement"],
  ["26", "Vie pratique et style"],
  ["27", "Éducation"],
  ["28", "Science et technologie"],
];

type Props = { options: Record<string, unknown>; onChange: (options: Record<string, unknown>) => void };

export function YouTubeOptions({ options, onChange }: Props) {
  const set = (key: string, value: unknown) => onChange({ ...options, [key]: value });
  const privacy = typeof options.privacyStatus === "string" ? options.privacyStatus : "private";
  return (
    <fieldset className="space-y-4 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">Réglages YouTube</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="yt-privacy">Visibilité</Label>
          <Select id="yt-privacy" value={privacy} onChange={(e) => set("privacyStatus", e.target.value)}>
            <option value="private">Privée</option>
            <option value="unlisted">Non répertoriée</option>
            <option value="public">Publique</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="yt-category">Catégorie</Label>
          <Select id="yt-category" value={typeof options.categoryId === "string" ? options.categoryId : "22"} onChange={(e) => set("categoryId", e.target.value)}>
            {CATEGORIES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div role="radiogroup" aria-labelledby="yt-kids" className="space-y-1">
        <p id="yt-kids" className="text-sm font-medium">
          Vidéo conçue pour les enfants ? <span className="text-danger">*</span>
        </p>
        {[
          [false, "Non, elle n'est pas conçue pour les enfants"],
          [true, "Oui, elle est conçue pour les enfants"],
        ].map(([value, label]) => (
          <label key={String(value)} className="flex items-center gap-2 text-sm">
            <input type="radio" name="yt-kids" checked={options.madeForKids === value} onChange={() => set("madeForKids", value)} className="accent-[var(--accent-strong)]" />
            {label}
          </label>
        ))}
        <Hint>Déclaration obligatoire pour YouTube.</Hint>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={options.containsSyntheticMedia === true} onChange={(e) => set("containsSyntheticMedia", e.target.checked)} className="mt-1 accent-[var(--accent-strong)]" />
        Contenu réaliste modifié ou généré (divulgation YouTube)
      </label>
      {privacy === "public" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={options.nativeScheduling !== false} onChange={(e) => set("nativeScheduling", e.target.checked)} className="mt-1 accent-[var(--accent-strong)]" />
          <span>
            Programmation native : la vidéo est envoyée dès la programmation (en privé) et YouTube la rend publique à l&apos;heure prévue, même si
            l&apos;ordinateur est éteint.
          </span>
        </label>
      )}
    </fieldset>
  );
}
