import { listMedia } from "@app/core/media";
import { getConfig } from "@app/core/config";
import { PageHeader } from "@/components/ui/page-header";
import { MediaUploader } from "@/components/media-uploader";
import { MediaGrid } from "@/components/media-grid";
import { requireUser } from "@/lib/session";
import { toMediaView } from "@/lib/views";

export const metadata = { title: "Médias" };

export default async function MediaPage() {
  await requireUser();
  const media = (await listMedia()).map(toMediaView);
  return (
    <>
      <PageHeader title="Bibliothèque de médias" description="Les originaux sont conservés tels quels dans le stockage de l'application." />
      <MediaUploader maxBytes={getConfig().MEDIA_MAX_BYTES} />
      <MediaGrid media={media} />
    </>
  );
}
