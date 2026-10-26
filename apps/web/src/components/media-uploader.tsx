"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

type Item = { name: string; progress: number; error?: string; done?: boolean };

function upload(file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status === 201) return resolve();
      let message = `Erreur ${xhr.status}`;
      try {
        message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
      } catch {
        // Réponse non JSON : message générique.
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Connexion interrompue."));
    xhr.send(file);
  });
}

export function MediaUploader({ maxBytes }: { maxBytes: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    const offset = items.length;
    setItems((prev) => [...prev, ...list.map((f) => ({ name: f.name, progress: 0 }))]);
    const update = (i: number, patch: Partial<Item>) => setItems((prev) => prev.map((it, j) => (j === offset + i ? { ...it, ...patch } : it)));

    for (const [i, file] of list.entries()) {
      if (file.size > maxBytes) {
        update(i, { error: `Trop volumineux (max ${formatBytes(maxBytes)}).` });
        continue;
      }
      try {
        await upload(file, (progress) => update(i, { progress }));
        update(i, { progress: 1, done: true });
      } catch (error) {
        update(i, { error: (error as Error).message });
      }
    }
    router.refresh();
  }

  return (
    <div className="mb-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center",
          dragging && "border-accent-strong bg-accent/10",
        )}
      >
        <Upload className="size-6 text-muted" aria-hidden />
        <p className="text-sm text-muted">Glisse des images ou des vidéos ici (JPEG, PNG, WebP, MP4, MOV, WebM).</p>
        <Button type="button" variant="primary" onClick={() => input.current?.click()}>
          Choisir des fichiers
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            void handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {items.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.error ? (
                <span className="text-danger">{item.error}</span>
              ) : item.done ? (
                <span className="text-success">Importé</span>
              ) : (
                <span className="w-32">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <span className="block h-full bg-accent" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </span>
                  <span className="sr-only">{Math.round(item.progress * 100)} %</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
