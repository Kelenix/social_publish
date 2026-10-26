"use client";

import { useActionState } from "react";
import { changePasswordAction, saveSettingsAction, type FormState } from "@/app/(app)/reglages/actions";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Hint, Input, Label, Select } from "@/components/ui/field";

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-danger">{state.error}</p>;
  if (state.success) return <p role="status" className="text-sm text-success">{state.success}</p>;
  return null;
}

type SettingsProps = { defaultTimezone: string; missedPolicy: string; timezones: string[] };

export function SettingsForm({ defaultTimezone, missedPolicy, timezones }: SettingsProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettingsAction, {});
  return (
    <Card>
      <form action={action} className="space-y-4">
        <CardTitle>Programmation</CardTitle>
        <div>
          <Label htmlFor="defaultTimezone">Fuseau horaire par défaut</Label>
          <Select id="defaultTimezone" name="defaultTimezone" defaultValue={defaultTimezone}>
            {timezones.map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="missedPolicy">Publications manquées (ordinateur éteint)</Label>
          <Select id="missedPolicy" name="missedPolicy" defaultValue={missedPolicy}>
            <option value="ASK_RESCHEDULE">Me demander de reprogrammer (recommandé)</option>
            <option value="PUBLISH_IF_RECENT">Publier si le retard est faible</option>
            <option value="CANCEL">Annuler</option>
          </Select>
          <Hint>Appliquée par le planificateur au redémarrage.</Hint>
        </div>
        <Feedback state={state} />
        <Button type="submit" variant="primary" disabled={pending}>
          Enregistrer
        </Button>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <Card>
      <form action={action} className="space-y-4">
        <CardTitle>Mot de passe administrateur</CardTitle>
        <div>
          <Label htmlFor="current">Mot de passe actuel</Label>
          <Input id="current" name="current" type="password" autoComplete="current-password" required />
        </div>
        <div>
          <Label htmlFor="next">Nouveau mot de passe</Label>
          <Input id="next" name="next" type="password" autoComplete="new-password" minLength={12} required />
        </div>
        <div>
          <Label htmlFor="confirm">Confirmation</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
        </div>
        <Feedback state={state} />
        <Button type="submit" disabled={pending}>
          Changer le mot de passe
        </Button>
      </form>
    </Card>
  );
}
