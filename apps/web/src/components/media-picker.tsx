"use client";

import { useRef } from "react";
import { ArrowDown, ArrowUp, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaFacts, MediaThumb } from "@/components/media-grid";
import { cn } from "@/lib/utils";
import type { MediaView } from "@/lib/views";

type Props = {
  library: MediaView[];
  value: string[];
  onChange: (ids: string[]) => void;
  emptyLabel?: string;
};

/** Sélection ordonnée de médias depuis la bibliothèque. */
export function MediaPicker({ library, value, onChange, emptyLabel = "Aucun média sélectionné." }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const byId = new Map(library.map((m) => [m.id, m]));
  const selected = value.map((id) => byId.get(id)).filter((m): m is MediaView => Boolean(m));

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const move = (index: number, delta: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    onChange(next);
  };

  return (
    <div>
      {selected.length === 0 ? (
        <p className="text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ol className="space-y-2">
          {selected.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3 rounded-md border border-border p-2">
              <MediaThumb media={m} className="size-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{m.name}</p>
                <MediaFacts media={m} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Descendre" disabled={i === selected.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Retirer" onClick={() => toggle(m.id)}>
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <Button type="button" size="sm" className="mt-2" onClick={() => dialog.current?.showModal()}>
        <Plus /> Choisir dans la bibliothèque
      </Button>

      <dialog ref={dialog} className="m-auto w-[min(48rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-4 text-foreground backdrop:bg-black/60">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Bibliothèque</h2>
          <Button type="button" variant="primary" size="sm" onClick={() => dialog.current?.close()}>
            Terminé
          </Button>
        </div>
        {library.length === 0 ? (
          <p className="text-sm text-muted">La bibliothèque est vide : importe d&apos;abord des médias.</p>
        ) : (
          <ul className="grid max-h-[65dvh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            {library.map((m) => {
              const active = value.includes(m.id);
              return (
                <li key={m.id}>
                  <button type="button" aria-pressed={active} aria-label={m.name} onClick={() => toggle(m.id)} className="relative w-full text-left">
                    <MediaThumb media={m} className={cn("ring-2 ring-transparent", active && "ring-accent")} />
                    {active && (
                      <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-accent text-accent-foreground">
                        <Check className="size-3" />
                      </span>
                    )}
                    <p className="mt-1 truncate text-xs">{m.name}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </dialog>
    </div>
  );
}
