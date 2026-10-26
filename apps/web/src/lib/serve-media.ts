import "server-only";
import { Readable } from "node:stream";
import { getStorage } from "@app/core/storage";

/** Sert un objet du stockage avec prise en charge des requêtes Range (lecture vidéo). */
export async function serveStoredFile(request: Request, key: string, contentType: string): Promise<Response> {
  const storage = getStorage();
  const size = await storage.size(key);
  if (size === null) return new Response("Introuvable", { status: 404 });

  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (match && (match[1] || match[2])) {
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = await storage.read(key, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(await storage.read(key)) as ReadableStream, { headers });
}
