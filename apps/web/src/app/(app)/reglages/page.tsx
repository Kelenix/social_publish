import { getSettings } from "@app/core/settings";
import { PasswordForm, SettingsForm } from "@/components/settings-forms";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { timezones } from "@/lib/post-status";
import { requireUser } from "@/lib/session";
import { logout } from "../../connexion/actions";

export const metadata = { title: "Réglages" };

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Réglages" />
      <div className="grid gap-6 lg:grid-cols-2">
        <SettingsForm defaultTimezone={settings.defaultTimezone} missedPolicy={settings.missedPolicy} timezones={timezones()} />
        <PasswordForm />
        <Card>
          <CardTitle className="mb-2">Session</CardTitle>
          <p className="mb-3 text-sm text-muted">Connecté en tant que {user.email}.</p>
          <form action={logout}>
            <Button type="submit">Se déconnecter</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
