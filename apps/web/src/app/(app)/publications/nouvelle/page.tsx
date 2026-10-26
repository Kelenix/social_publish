import { listMedia } from "@app/core/media";
import { postInputSchema } from "@app/core/posts/schema";
import Link from "next/link";
import { z } from "zod";
import { listAccounts } from "@app/core/scheduling";
import { draftFromTemplate, getTemplate, listTemplates, templateAccounts } from "@app/core/workflows";
import { buttonVariants } from "@/components/ui/button";
import { scheduleDefaultsFor } from "@/lib/templates";
import { getSettings } from "@app/core/settings";
import { PostEditor } from "@/components/post-editor";
import { PageHeader } from "@/components/ui/page-header";
import { timezones } from "@/lib/post-status";
import { requireUser } from "@/lib/session";
import { toAccountOptions, toMediaView } from "@/lib/views";

export const metadata = { title: "Nouvelle publication" };

export default async function NewPostPage({ searchParams }: PageProps<"/publications/nouvelle">) {
  await requireUser();
  const { modele } = await searchParams;
  const templateId = z.uuid().safeParse(modele).data;
  const [media, settings, accounts, templates, template] = await Promise.all([
    listMedia(),
    getSettings(),
    listAccounts(),
    listTemplates(),
    templateId ? getTemplate(templateId) : null,
  ]);
  const initial = postInputSchema.parse(
    template
      ? draftFromTemplate(template, await templateAccounts(template), "Nouvelle publication")
      : { title: "Nouvelle publication", timezone: settings.defaultTimezone },
  );
  return (
    <>
      <PageHeader title="Nouvelle publication" description={template ? `Modèle : ${template.name}` : undefined} />
      {templates.length > 0 && (
        <nav aria-label="Partir d'un modèle" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Partir d&apos;un modèle :</span>
          {templates.map((t) => (
            <Link key={t.id} href={`/publications/nouvelle?modele=${t.id}`} className={buttonVariants({ size: "sm", variant: t.id === template?.id ? "primary" : "secondary" })}>
              {t.name}
            </Link>
          ))}
          {template && (
            <Link href="/publications/nouvelle" className={buttonVariants({ size: "sm", variant: "ghost" })}>
              Sans modèle
            </Link>
          )}
        </nav>
      )}
      <PostEditor
        postId={null}
        version={null}
        initial={initial}
        library={media.map(toMediaView)}
        timezones={timezones()}
        editable
        accounts={toAccountOptions(accounts)}
        scheduleDefaults={await scheduleDefaultsFor(template)}
        key={template?.id ?? "sans-modele"}
      />
    </>
  );
}
