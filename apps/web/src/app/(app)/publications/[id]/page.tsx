import { notFound } from "next/navigation";
import { z } from "zod";
import { listMedia } from "@app/core/media";
import { prisma } from "@app/db";
import { listConnectors } from "@app/core/connectors";
import { getPost, toInput } from "@app/core/posts";
import { composeCaption, resolveVariant } from "@app/core/posts/schema";
import { listAccounts, listDestinations } from "@app/core/scheduling";
import { ACTIVE_STATUSES } from "@app/core/scheduling/status";
import { getSettings } from "@app/core/settings";
import { getTemplate } from "@app/core/workflows";
import { scheduleDefaultsFor } from "@/lib/templates";
import { CancelScheduleButton } from "@/components/cancel-schedule-button";
import { ManualExport, type ManualExportView } from "@/components/manual-export";
import { DestinationList } from "@/components/destination-list";
import { PostEditor } from "@/components/post-editor";
import { PostRowActions } from "@/components/post-row-actions";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { toDestinationView } from "@/lib/destinations";
import { POST_STATUS, timezones } from "@/lib/post-status";
import { requireUser } from "@/lib/session";
import { toAccountOptions, toMediaView } from "@/lib/views";

export const metadata = { title: "Publication" };

export default async function PostPage({ params }: PageProps<"/publications/[id]">) {
  await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [post, media, accounts, destinations, settings] = await Promise.all([
    getPost(id.data),
    listMedia(),
    listAccounts(),
    listDestinations({ postId: id.data }),
    getSettings(),
  ]);
  if (!post) notFound();
  const status = POST_STATUS[post.status];
  const library = media.map(toMediaView);

  // Plateformes en mode manuel : texte final et médias à télécharger.
  const input = toInput(post);
  const manualMarks = await prisma.auditLog.findMany({ where: { entity: "post", entityId: post.id, action: "post.manual_published" }, orderBy: { at: "desc" } });
  const manualExports: ManualExportView[] = listConnectors()
    .filter((c) => c.manualOnly)
    .flatMap((c) => {
      const variant = input.variants.find((v) => v.platform === c.platform && v.enabled);
      if (!variant) return [];
      const r = resolveVariant(input, variant);
      const mark = manualMarks.find((m) => (m.meta as { platform?: string }).platform === c.platform);
      return [{
        platform: c.platform,
        caption: composeCaption(r.text, r.hashtags),
        media: r.mediaIds.map((id) => library.find((m) => m.id === id)).filter((m) => m !== undefined),
        notes: c.capabilities().notes,
        markedAt: mark?.at.toISOString() ?? null,
      }];
    });
  const cancellable = destinations.some((d) => ACTIVE_STATUSES.includes(d.status) || d.status === "MISSED");
  return (
    <>
      <PageHeader
        title={post.title}
        description={`Fuseau : ${post.timezone}`}
        actions={
          <>
            <Badge tone={status.tone} className="self-center">
              {status.label}
            </Badge>
            <PostRowActions id={post.id} deletable={post.status === "DRAFT"} />
          </>
        }
      />
      {destinations.length > 0 && (
        <section className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Destinations</h2>
            {cancellable && <CancelScheduleButton postId={post.id} />}
          </div>
          <DestinationList destinations={destinations.map(toDestinationView)} timezone={settings.defaultTimezone} />
        </section>
      )}
      {manualExports.length > 0 && (
        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          {manualExports.map((item) => (
            <ManualExport key={item.platform} postId={post.id} item={item} timezone={settings.defaultTimezone} />
          ))}
        </section>
      )}
      <PostEditor
        key={post.id}
        postId={post.id}
        version={post.version}
        initial={toInput(post)}
        library={library}
        timezones={timezones()}
        editable={post.status === "DRAFT"}
        accounts={toAccountOptions(accounts)}
        scheduleDefaults={post.status === "DRAFT" && post.templateId ? await scheduleDefaultsFor(await getTemplate(post.templateId)) : undefined}
      />
    </>
  );
}
