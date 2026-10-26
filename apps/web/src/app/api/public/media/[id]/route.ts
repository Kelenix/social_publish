import { z } from "zod";
import { getMedia } from "@app/core/media";
import { verifyMediaSignature } from "@app/core/media/public-url";
import { serveStoredFile } from "@/lib/serve-media";

export const dynamic = "force-dynamic";

/**
 * Accès public à un média, uniquement avec une signature valide et non expirée (téléchargement par
 * une plateforme comme Instagram). Aucune session requise ; rien d'autre n'est exposé.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/public/media/[id]">) {
  const id = z.uuid().safeParse((await params).id);
  const query = new URL(request.url).searchParams;
  if (!id.success || !verifyMediaSignature(id.data, query.get("exp"), query.get("sig"))) return new Response("Accès refusé", { status: 403 });
  const asset = await getMedia(id.data);
  if (!asset) return new Response("Introuvable", { status: 404 });
  return serveStoredFile(request, asset.storageKey, asset.mimeType);
}
