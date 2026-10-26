"use client";

import { useState, useTransition } from "react";
import { cancelScheduleAction } from "@/app/(app)/programmation-actions";
import { Button } from "@/components/ui/button";

export function CancelScheduleButton({ postId }: { postId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm("Annuler les envois pas encore commencés ?")) return;
          startTransition(async () => setMessage((await cancelScheduleAction(postId)).message));
        }}
      >
        Annuler la programmation
      </Button>
      {message && <p role="status" className="text-sm text-muted">{message}</p>}
    </div>
  );
}
