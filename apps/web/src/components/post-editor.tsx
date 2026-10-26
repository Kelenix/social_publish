"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_FIELDS, PLATFORM_LABELS, PLATFORMS, type PlatformId } from "@app/core/platforms";
import { composeCaption, parseHashtags, resolveVariant, type ParsedPostInput, type PostInput } from "@app/core/posts/schema";
import { SIMULATION_SCENARIOS } from "@app/core/connectors/scenarios";
import { saveDraftAction } from "@/app/(app)/publications/actions";
import { SchedulePanel, type AccountOption } from "@/components/schedule-panel";
import { YouTubeOptions } from "@/components/youtube-options";
import { MediaPicker } from "@/components/media-picker";
import { MediaThumb } from "@/components/media-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { MediaView } from "@/lib/views";

type VariantDraft = { text: string; title: string; description: string; hashtags: string; mediaIds: string[]; options: Record<string, unknown> };
const emptyVariant: VariantDraft = { text: "", title: "", description: "", hashtags: "", mediaIds: [], options: {} };

type Props = {
  postId: string | null;
  version: number | null;
  initial: ParsedPostInput;
  library: MediaView[];
  timezones: string[];
  editable: boolean;
  /** Comptes prêts, proposés pour programmer (absent : pas de programmation possible ici). */
  accounts?: AccountOption[];
};

const FIELD_LABELS = { text: "Texte", title: "Titre", description: "Description" } as const;

export function PostEditor({ postId, version, initial, library, timezones, editable, accounts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [hashtags, setHashtags] = useState(initial.hashtags.map((t) => `#${t}`).join(" "));
  const [mediaIds, setMediaIds] = useState(initial.mediaIds);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [selected, setSelected] = useState<PlatformId[]>(initial.variants.map((v) => v.platform));
  const [variants, setVariants] = useState<Record<PlatformId, VariantDraft>>(() => {
    const map = Object.fromEntries(PLATFORMS.map((p) => [p, { ...emptyVariant }])) as Record<PlatformId, VariantDraft>;
    for (const v of initial.variants) {
      map[v.platform] = {
        text: v.text ?? "",
        title: v.title ?? "",
        description: v.description ?? "",
        hashtags: v.hashtags.map((t) => `#${t}`).join(" "),
        mediaIds: v.mediaIds,
        options: v.options,
      };
    }
    return map;
  });
  const [tab, setTab] = useState<PlatformId | null>(selected[0] ?? null);
  const activeTab = tab && selected.includes(tab) ? tab : (selected[0] ?? null);

  const toInput = (): PostInput => ({
    title,
    body,
    hashtags: parseHashtags(hashtags),
    mediaIds,
    timezone,
    variants: selected.map((platform) => {
      const v = variants[platform];
      return { platform, enabled: true, text: v.text, title: v.title, description: v.description, hashtags: parseHashtags(v.hashtags), mediaIds: v.mediaIds, options: v.options as Record<string, never> };
    }),
  });

  const togglePlatform = (p: PlatformId) => {
    setSelected((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || prev.includes(x))));
    setTab(p);
  };
  const updateVariant = (p: PlatformId, patch: Partial<VariantDraft>) => setVariants((prev) => ({ ...prev, [p]: { ...prev[p], ...patch } }));

  /** Enregistre le brouillon ; renvoie son identifiant, ou null en cas d'erreur. */
  async function persist(): Promise<string | null> {
    setMessage(null);
    const result = await saveDraftAction(postId, toInput());
    if (!result.ok) {
      setMessage({ tone: "danger", text: result.error });
      return null;
    }
    setMessage({ tone: "success", text: `Brouillon enregistré (version ${result.version}).` });
    return result.id;
  }

  function save() {
    startTransition(async () => {
      const id = await persist();
      if (id && !postId) router.replace(`/publications/${id}`);
      else if (id) router.refresh();
    });
  }

  const mainTags = parseHashtags(hashtags).map((t) => t.replace(/^#+/, ""));
  const preview = (p: PlatformId) => {
    const v = variants[p];
    return resolveVariant(
      { title, body, hashtags: mainTags, mediaIds },
      {
        platform: p,
        text: v.text.trim() || null,
        title: v.title.trim() || null,
        description: v.description.trim() || null,
        hashtags: parseHashtags(v.hashtags).map((t) => t.replace(/^#+/, "")),
        mediaIds: v.mediaIds,
        options: {},
      },
    );
  };
  const byId = new Map(library.map((m) => [m.id, m]));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <fieldset disabled={!editable || pending} className="min-w-0 space-y-6">
        <Card className="space-y-4">
          <CardTitle>Contenu principal</CardTitle>
          <div>
            <Label htmlFor="title">Titre</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
            <Hint>Sert de nom interne et de titre par défaut (YouTube…).</Hint>
          </div>
          <div>
            <Label htmlFor="body">Texte</Label>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
            <Hint>{body.length} caractères</Hint>
          </div>
          <div>
            <Label htmlFor="hashtags">Hashtags</Label>
            <Input id="hashtags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#voyage #photo" />
          </div>
          <div>
            <Label>Médias</Label>
            <MediaPicker library={library} value={mediaIds} onChange={setMediaIds} />
          </div>
          <div className="max-w-xs">
            <Label htmlFor="timezone">Fuseau horaire</Label>
            <Select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {timezones.map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </Select>
          </div>
        </Card>

        <Card className="space-y-4">
          <CardTitle>Plateformes et variantes</CardTitle>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Plateformes cibles">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={selected.includes(p)}
                onClick={() => togglePlatform(p)}
                className={cn(
                  "rounded-full border border-border px-3 py-1 text-sm",
                  selected.includes(p) ? "border-accent bg-accent text-accent-foreground" : "hover:bg-surface-muted",
                )}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>

          {activeTab && (
            <div>
              <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
                {selected.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="tab"
                    aria-selected={p === activeTab}
                    onClick={() => setTab(p)}
                    className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-sm", p === activeTab ? "border-accent-strong font-medium" : "text-muted")}
                  >
                    {PLATFORM_LABELS[p]}
                  </button>
                ))}
              </div>
              <div className="space-y-4" role="tabpanel">
                <p className="text-xs text-muted">Un champ vide reprend le contenu principal.</p>
                {PLATFORM_FIELDS[activeTab].map((field) => {
                  const id = `${activeTab}-${field}`;
                  const inherited = field === "title" ? title : body;
                  return (
                    <div key={field}>
                      <Label htmlFor={id}>{FIELD_LABELS[field]}</Label>
                      {field === "title" ? (
                        <Input id={id} value={variants[activeTab][field]} placeholder={inherited} onChange={(e) => updateVariant(activeTab, { [field]: e.target.value })} />
                      ) : (
                        <Textarea id={id} rows={5} value={variants[activeTab][field]} placeholder={inherited} onChange={(e) => updateVariant(activeTab, { [field]: e.target.value })} />
                      )}
                    </div>
                  );
                })}
                {activeTab === "YOUTUBE" && <YouTubeOptions options={variants.YOUTUBE.options} onChange={(options) => updateVariant("YOUTUBE", { options })} />}
                {activeTab === "TEST" && (
                  <div>
                    <Label htmlFor="TEST-simulate">Scénario simulé</Label>
                    <Select
                      id="TEST-simulate"
                      value={String(variants.TEST.options.simulate ?? "")}
                      onChange={(e) => updateVariant("TEST", { options: e.target.value ? { simulate: e.target.value } : {} })}
                    >
                      <option value="">Selon le compte (réussite par défaut)</option>
                      {Object.entries(SIMULATION_SCENARIOS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    <Hint>Simulation locale : rien n&apos;est envoyé à un réseau social.</Hint>
                  </div>
                )}
                <div>
                  <Label htmlFor={`${activeTab}-hashtags`}>Hashtags spécifiques</Label>
                  <Input id={`${activeTab}-hashtags`} value={variants[activeTab].hashtags} placeholder={hashtags} onChange={(e) => updateVariant(activeTab, { hashtags: e.target.value })} />
                </div>
                <div>
                  <Label>Médias spécifiques</Label>
                  <MediaPicker
                    library={library}
                    value={variants[activeTab].mediaIds}
                    onChange={(ids) => updateVariant(activeTab, { mediaIds: ids })}
                    emptyLabel="Médias du contenu principal."
                  />
                </div>
              </div>
            </div>
          )}
        </Card>
      </fieldset>

      <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle>Enregistrement</CardTitle>
            {version !== null && <Badge>v{version}</Badge>}
          </div>
          {editable ? (
            <Button type="button" variant="primary" className="w-full" onClick={save} disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer le brouillon"}
            </Button>
          ) : (
            <p className="text-sm text-muted">Cette publication n&apos;est plus un brouillon : elle n&apos;est pas modifiable.</p>
          )}
          {message && (
            <p role="status" className={cn("text-sm", message.tone === "danger" ? "text-danger" : "text-success")}>
              {message.text}
            </p>
          )}
        </Card>

        {editable && accounts && <SchedulePanel accounts={accounts} platforms={selected} timezone={timezone} save={persist} />}

        <Card className="space-y-4">
          <CardTitle>Aperçu</CardTitle>
          {selected.length === 0 && <p className="text-sm text-muted">Choisis au moins une plateforme.</p>}
          {selected.map((p) => {
            const r = preview(p);
            const fields = PLATFORM_FIELDS[p];
            const caption = composeCaption(fields.includes("text") ? r.text : r.description, r.hashtags);
            const media = r.mediaIds.map((id) => byId.get(id)).filter((m): m is MediaView => Boolean(m));
            return (
              <article key={p} className="rounded-md border border-border p-3">
                <header className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{PLATFORM_LABELS[p]}</span>
                  <span className="font-mono text-xs text-muted">{caption.length} car.</span>
                </header>
                {media.length > 0 && (
                  <div className="mb-2 flex gap-1 overflow-x-auto">
                    {media.map((m) => (
                      <MediaThumb key={m.id} media={m} className="size-16 shrink-0" />
                    ))}
                  </div>
                )}
                {fields.includes("title") && <p className="text-sm font-semibold">{r.title}</p>}
                <p className="text-sm whitespace-pre-wrap text-muted">{caption || "—"}</p>
              </article>
            );
          })}
          <p className="text-xs text-muted">Les limites propres à chaque réseau seront vérifiées par les connecteurs.</p>
        </Card>
      </aside>
    </div>
  );
}
