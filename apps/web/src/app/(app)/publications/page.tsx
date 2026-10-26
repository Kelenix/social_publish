import Link from "next/link";
import { Plus } from "lucide-react";
import { listPosts } from "@app/core/posts";
import { PLATFORM_LABELS } from "@app/core/platforms";
import { getSettings } from "@app/core/settings";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PostRowActions } from "@/components/post-row-actions";
import { POST_STATUS } from "@/lib/post-status";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Publications" };

export default async function PostsPage() {
  await requireUser();
  const [posts, settings] = await Promise.all([listPosts(), getSettings()]);
  return (
    <>
      <PageHeader
        title="Publications"
        actions={
          <Link href="/publications/nouvelle" className={buttonVariants({ variant: "primary" })}>
            <Plus /> Nouvelle publication
          </Link>
        }
      />
      {posts.length === 0 ? (
        <p className="text-sm text-muted">Aucune publication. Commence par en créer une.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {posts.map((post) => (
            <li key={post.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/publications/${post.id}`} className="font-medium hover:underline">
                  {post.title}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge tone={POST_STATUS[post.status].tone}>{POST_STATUS[post.status].label}</Badge>
                  {post.variants.map((v) => (
                    <Badge key={v.platform}>{PLATFORM_LABELS[v.platform]}</Badge>
                  ))}
                  <span>· modifiée le {formatDateTime(post.updatedAt, settings.defaultTimezone)}</span>
                </p>
              </div>
              <PostRowActions id={post.id} deletable={post.status === "DRAFT"} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
