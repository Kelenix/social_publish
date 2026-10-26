"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { deleteDraftAction, duplicatePostAction } from "@/app/(app)/publications/actions";
import { Button } from "@/components/ui/button";

export function PostRowActions({ id, deletable }: { id: string; deletable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-1">
      <Button size="sm" disabled={pending} onClick={() => startTransition(() => duplicatePostAction(id))}>
        <Copy /> Dupliquer
      </Button>
      {deletable && (
        <Button
          size="sm"
          variant="danger"
          aria-label="Supprimer le brouillon"
          disabled={pending}
          onClick={() => {
            if (!confirm("Supprimer ce brouillon ?")) return;
            startTransition(async () => {
              const result = await deleteDraftAction(id);
              if (result.error) alert(result.error);
              else router.push("/publications");
            });
          }}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}
