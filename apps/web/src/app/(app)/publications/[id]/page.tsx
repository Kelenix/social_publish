import { notFound } from "next/navigation";
import { z } from "zod";
import { listMedia } from "@app/core/media";
import { getPost, toInput } from "@app/core/posts";
import { PostEditor } from "@/components/post-editor";
import { PostRowActions } from "@/components/post-row-actions";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { POST_STATUS, timezones } from "@/lib/post-status";
import { requireUser } from "@/lib/session";
import { toMediaView } from "@/lib/views";

export const metadata = { title: "Publication" };

export default async function PostPage({ params }: PageProps<"/publications/[id]">) {
  await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [post, media] = await Promise.all([getPost(id.data), listMedia()]);
  if (!post) notFound();
  const status = POST_STATUS[post.status];
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
      <PostEditor
        key={post.id}
        postId={post.id}
        version={post.version}
        initial={toInput(post)}
        library={media.map(toMediaView)}
        timezones={timezones()}
        editable={post.status === "DRAFT"}
      />
    </>
  );
}
