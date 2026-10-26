"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SIMULATION_SCENARIOS } from "@app/core/connectors";
import {
  cancelSchedule,
  createTestAccount,
  DestinationActionError,
  reconnectTestAccount,
  resolveUncertain,
  retryDestination,
  schedulePost,
  type ScheduleOutcome,
} from "@app/core/scheduling";
import { isValidTimeZone } from "@app/core/posts/schema";
import { prisma } from "@app/db";
import { requireUser } from "@/lib/session";

const whenSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("now") }),
  z.object({
    mode: z.literal("at"),
    local: z.string(),
    timezone: z.string().refine(isValidTimeZone),
    disambiguation: z.enum(["earlier", "later"]).optional(),
  }),
]);

/** Sérialisable pour le client (dates en ISO). */
export type ScheduleActionResult =
  | { ok: true }
  | { ok: false; message: string; issues?: { account: string; messages: string[] }[]; ambiguous?: { earlier: string; later: string }; suggestion?: string };

function revalidateAll() {
  for (const path of ["/", "/publications", "/calendrier", "/historique", "/comptes"]) revalidatePath(path);
}

export async function scheduleAction(postId: string, accountIds: string[], when: unknown): Promise<ScheduleActionResult> {
  const user = await requireUser();
  const parsedWhen = whenSchema.safeParse(when);
  if (!parsedWhen.success) return { ok: false, message: "Date ou fuseau invalide." };
  const outcome: ScheduleOutcome = await schedulePost(z.uuid().parse(postId), z.array(z.uuid()).parse(accountIds), parsedWhen.data, user.email);
  revalidateAll();
  if (outcome.ok) return { ok: true };

  const result: ScheduleActionResult = { ok: false, message: outcome.message };
  if (outcome.issues) {
    const accounts = await prisma.connectedAccount.findMany({ where: { id: { in: outcome.issues.map((i) => i.accountId) } } });
    const name = new Map(accounts.map((a) => [a.id, a.displayName]));
    result.issues = outcome.issues.map((i) => ({ account: name.get(i.accountId) ?? i.accountId, messages: i.issues.map((x) => x.message) }));
  }
  if (outcome.time && !outcome.time.ok) {
    if (outcome.time.reason === "AMBIGUOUS") result.ambiguous = { earlier: outcome.time.earlier.toISOString(), later: outcome.time.later.toISOString() };
    if (outcome.time.reason === "NONEXISTENT") result.suggestion = outcome.time.suggestion.toISOString();
  }
  return result;
}

export async function cancelScheduleAction(postId: string): Promise<{ message: string }> {
  const user = await requireUser();
  const result = await cancelSchedule(z.uuid().parse(postId), user.email);
  revalidateAll();
  return {
    message: result.backToDraft
      ? "Programmation annulée : la publication est de nouveau un brouillon."
      : `${result.cancelled} destination(s) annulée(s) ; celles déjà traitées sont conservées.`,
  };
}

async function destinationAction(run: () => Promise<void>): Promise<{ error?: string }> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DestinationActionError) return { error: error.message };
    throw error;
  }
  revalidateAll();
  return {};
}

export async function retryDestinationAction(id: string) {
  const user = await requireUser();
  return destinationAction(() => retryDestination(z.uuid().parse(id), user.email));
}

export async function resolveUncertainAction(id: string, decision: "published" | "retry") {
  const user = await requireUser();
  return destinationAction(() => resolveUncertain(z.uuid().parse(id), z.enum(["published", "retry"]).parse(decision), user.email));
}

const testAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  simulate: z.enum(Object.keys(SIMULATION_SCENARIOS) as [keyof typeof SIMULATION_SCENARIOS]),
});

export async function createTestAccountAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const data = testAccountSchema.parse(Object.fromEntries(form));
  const account = await createTestAccount(data.name, user.email);
  if (data.simulate !== "success") await prisma.connectedAccount.update({ where: { id: account.id }, data: { metadata: { simulate: data.simulate } } });
  revalidateAll();
}

export async function reconnectTestAccountAction(id: string): Promise<void> {
  const user = await requireUser();
  await reconnectTestAccount(z.uuid().parse(id), user.email);
  revalidateAll();
}
