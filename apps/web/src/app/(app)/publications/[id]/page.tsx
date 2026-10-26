import { notFound } from "next/navigation";
import { z } from "zod";
import { listMedia } from "@app/core/media";
import { getPost, toInput } from "@app/core/posts";
import { listAccounts, listDestinations } from "@app/core/scheduling";
import { ACTIVE_STATUSES } from "@app/core/scheduling/status";
import { getSettings } from "@app/core/settings";
import { CancelScheduleButton } from "@/components/cancel-schedule-button";
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
      <PostEditor
        key={post.id}
        postId={post.id}
        version={post.version}
        initial={toInput(post)}
        library={media.map(toMediaView)}
        timezones={timezones()}
        editable={post.status === "DRAFT"}
        accounts={toAccountOptions(accounts)}
      />
    </>
  );
}
