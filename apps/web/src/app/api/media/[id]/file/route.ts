import { z } from "zod";
import { getMedia } from "@app/core/media";
import { serveStoredFile } from "@/lib/serve-media";
import { getCurrentUser } from "@/lib/session";

export async function GET(request: Request, { params }: RouteContext<"/api/media/[id]/file">) {
  if (!(await getCurrentUser())) return new Response("Non authentifié", { status: 401 });
  const id = z.uuid().safeParse((await params).id);
  const asset = id.success ? await getMedia(id.data) : null;
  if (!asset) return new Response("Introuvable", { status: 404 });
  return serveStoredFile(request, asset.storageKey, asset.mimeType);
}
