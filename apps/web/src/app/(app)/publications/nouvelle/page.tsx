import { listMedia } from "@app/core/media";
import { postInputSchema } from "@app/core/posts/schema";
import { getSettings } from "@app/core/settings";
import { PostEditor } from "@/components/post-editor";
import { PageHeader } from "@/components/ui/page-header";
import { timezones } from "@/lib/post-status";
import { requireUser } from "@/lib/session";
import { toMediaView } from "@/lib/views";

export const metadata = { title: "Nouvelle publication" };

export default async function NewPostPage() {
  await requireUser();
  const [media, settings] = await Promise.all([listMedia(), getSettings()]);
  const initial = postInputSchema.parse({ title: "Nouvelle publication", timezone: settings.defaultTimezone });
  return (
    <>
      <PageHeader title="Nouvelle publication" />
      <PostEditor postId={null} version={null} initial={initial} library={media.map(toMediaView)} timezones={timezones()} editable />
    </>
  );
}
