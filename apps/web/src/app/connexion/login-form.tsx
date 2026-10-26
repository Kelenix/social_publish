"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div>
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
