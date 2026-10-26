"use client";

import { useActionState, useState } from "react";
import { TOKEN_SCOPE_LABELS, TOKEN_SCOPES } from "@app/core/tokens/scopes";
import { createTokenAction, revokeTokenAction, type TokenFormState } from "@/app/(app)/reglages/token-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Hint, Input, Label, Select } from "@/components/ui/field";

export type TokenView = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; expiresAt: string | null; revoked: boolean };

export function TokenManager({ tokens, mcpUrl }: { tokens: TokenView[]; mcpUrl: string }) {
  const [state, action, pending] = useActionState<TokenFormState, FormData>(createTokenAction, {});
  const [copied, setCopied] = useState(false);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium" });
  const command = state.token ? `claude mcp add --transport http studio ${mcpUrl} --header "Authorization: Bearer ${state.token}"` : "";

  return (
    <Card className="space-y-4 lg:col-span-2">
      <CardTitle>Jetons API et MCP (Claude Code)</CardTitle>
      <form action={action} className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div>
          <Label htmlFor="token-name">Nom</Label>
          <Input id="token-name" name="name" defaultValue="Claude Code" maxLength={80} required />
        </div>
        <div>
          <Label htmlFor="token-expiry">Expiration</Label>
          <Select id="token-expiry" name="expiresInDays" defaultValue="90">
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
            <option value="365">1 an</option>
            <option value="0">Jamais</option>
          </Select>
        </div>
        <Button type="submit" variant="primary" disabled={pending}>
          Créer le jeton
        </Button>
        <fieldset className="space-y-1 md:col-span-3">
          <legend className="mb-1 text-sm font-medium">Portées</legend>
          {TOKEN_SCOPES.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="scopes" value={scope} defaultChecked={scope !== "publish"} className="accent-[var(--accent-strong)]" />
              <span className="font-mono text-xs">{scope}</span> — {TOKEN_SCOPE_LABELS[scope]}
            </label>
          ))}
          <Hint>« publish » permet à Claude de programmer et publier. Ne l&apos;accorde que si tu le souhaites.</Hint>
        </fieldset>
      </form>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.token && (
        <div role="status" className="space-y-2 rounded-md border border-accent bg-accent/10 p-3 text-sm">
          <p className="font-medium">Copie ce jeton maintenant : il ne sera plus jamais affiché.</p>
          <code className="block overflow-x-auto rounded bg-surface p-2 font-mono text-xs">{command}</code>
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(command);
              setCopied(true);
            }}
          >
            {copied ? "Copié" : "Copier la commande Claude Code"}
          </Button>
        </div>
      )}
      <ul className="divide-y divide-border rounded-md border border-border">
        {tokens.length === 0 && <li className="p-3 text-sm text-muted">Aucun jeton.</li>}
        {tokens.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div>
              <p className="font-medium">
                {t.name} <span className="font-mono text-xs text-muted">{t.prefix}…</span>
              </p>
              <p className="text-xs text-muted">
                {t.scopes.join(", ")} · créé le {fmt(t.createdAt)}
                {t.lastUsedAt && ` · utilisé le ${fmt(t.lastUsedAt)}`}
                {t.expiresAt && ` · expire le ${fmt(t.expiresAt)}`}
              </p>
            </div>
            {t.revoked ? (
              <Badge>Révoqué</Badge>
            ) : (
              <form action={revokeTokenAction.bind(null, t.id)}>
                <Button size="sm" variant="danger">
                  Révoquer
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
