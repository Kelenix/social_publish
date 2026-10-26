import "server-only";
import type { WorkflowTemplate } from "@app/db";
import { nextSlot, templateAccounts } from "@app/core/workflows";
import type { ScheduleDefaults } from "@/components/schedule-panel";

/** Mode « Rapide » : comptes prêts du modèle et prochain créneau habituel ; mode « Relecture » : rien. */
export async function scheduleDefaultsFor(template: WorkflowTemplate | null): Promise<ScheduleDefaults | undefined> {
  if (!template || template.validationMode !== "QUICK") return undefined;
  const accounts = await templateAccounts(template);
  return {
    templateName: template.name,
    accountIds: accounts.filter((a) => a.status === "READY").map((a) => a.id),
    local: template.defaultTime ? nextSlot(template.defaultTime, template.timezone) : "",
  };
}
