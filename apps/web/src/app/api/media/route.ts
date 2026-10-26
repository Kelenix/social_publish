import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { getConfig } from "@app/core/config";
import { importMedia, MediaTooLargeError, UnsupportedMediaError } from "@app/core/media";
import { getCurrentUser, isSameOrigin } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Import d'un fichier en flux (corps brut, nom dans l'en-tête X-File-Name encodé URI) :
 * aucun fichier n'est chargé entièrement en mémoire.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non authentifié." }, { status: 401 });
  if (!isSameOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  if (!request.body) return Response.json({ error: "Fichier manquant." }, { status: 400 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > getConfig().MEDIA_MAX_BYTES) return Response.json({ error: "Fichier trop volumineux." }, { status: 413 });

  let name = "sans-nom";
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? name);
  } catch {
    // Nom mal encodé : on garde le nom par défaut (purement informatif).
  }

  try {
    const source = Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>);
    const asset = await importMedia(source, name, user.email);
    return Response.json({ id: asset.id }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaTooLargeError) return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof UnsupportedMediaError) return Response.json({ error: error.message }, { status: 415 });
    console.error("Échec de l'import média", error);
    return Response.json({ error: "Échec de l'import." }, { status: 500 });
  }
}
