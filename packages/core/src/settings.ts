import { prisma, type MissedPostPolicy } from "@app/db";
import { audit } from "./audit";
import { isValidTimeZone } from "./posts/schema";

export function getSettings() {
  return prisma.appSettings.upsert({ where: { id: 1 }, create: {}, update: {} });
}

export async function updateSettings(data: { defaultTimezone: string; missedPolicy: MissedPostPolicy }, actor: string) {
  if (!isValidTimeZone(data.defaultTimezone)) throw new Error("Fuseau horaire IANA invalide.");
  const settings = await prisma.appSettings.upsert({ where: { id: 1 }, create: data, update: data });
  await audit({ actor, action: "settings.update", meta: data });
  return settings;
}
