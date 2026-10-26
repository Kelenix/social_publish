import { prisma } from "@app/db";
import { SIMULATION_SCENARIOS, type SimulationScenario } from "./scenarios";
import { ConnectorError, type Capabilities, type Connector, type PublishContext, type PublishResult } from "./types";

const CAPABILITIES: Capabilities = {
  contentTypes: ["TEXT", "IMAGE", "VIDEO", "CAROUSEL"],
  immediatePublish: true,
  nativeScheduling: false,
  statusTracking: true,
  cancellation: false,
  reconciliation: true,
  permissions: [],
  limits: {
    textMax: 2000,
    titleMax: 100,
    hashtagsMax: 30,
    mediaMin: 0,
    mediaMax: 10,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"],
  },
  notes: ["Simulation locale : aucune donnée n'est envoyée à un réseau social."],
};

function scenarioOf(ctx: PublishContext): SimulationScenario {
  const isScenario = (v: unknown): v is SimulationScenario => typeof v === "string" && v in SIMULATION_SCENARIOS;
  const fromVariant = ctx.content.options.simulate;
  const fromAccount = (ctx.account.metadata as Record<string, unknown>).simulate;
  return isScenario(fromVariant) ? fromVariant : isScenario(fromAccount) ? fromAccount : "success";
}

async function record(ctx: PublishContext, state: "published" | "processing") {
  // Lit réellement chaque média depuis le stockage durable (prouve l'indépendance vis-à-vis de la source).
  let bytes = 0;
  for (const m of ctx.media) for await (const chunk of await m.open()) bytes += (chunk as Buffer).length;
  return prisma.simulatedPublication.create({
    data: { accountId: ctx.account.id, idempotencyKey: ctx.idempotencyKey, payload: { state, caption: ctx.caption, title: ctx.content.title, mediaBytes: bytes } },
  });
}

export const testConnector: Connector = {
  id: "test",
  platform: "TEST",
  label: "Test (simulation)",
  simulated: true,
  isConfigured: () => true,
  capabilities: () => CAPABILITIES,

  async publish(ctx): Promise<PublishResult> {
    switch (scenarioOf(ctx)) {
      case "fatal":
        throw new ConnectorError("fatal", "CONTENT_REJECTED", "Contenu refusé par la plateforme simulée.");
      case "auth":
        throw new ConnectorError("auth", "TOKEN_EXPIRED", "Jeton expiré (simulation).");
      case "retryable":
        throw new ConnectorError("retryable", "UNAVAILABLE", "Service temporairement indisponible (simulation).", 2_000);
      case "rate_limit":
        throw new ConnectorError("retryable", "RATE_LIMITED", "Quota dépassé (simulation).", 60_000);
      case "retry_once":
        if (ctx.attempt === 1) throw new ConnectorError("retryable", "UNAVAILABLE", "Erreur temporaire (simulation).");
        break;
      case "uncertain":
        // La publication a lieu, mais la réponse est perdue.
        await record(ctx, "published");
        throw new ConnectorError("uncertain", "TIMEOUT", "Délai dépassé après l'envoi (simulation).");
      case "processing": {
        const pub = await record(ctx, "processing");
        return { status: "processing", remoteId: pub.id, pollAfterMs: 1_000 };
      }
      case "success":
        break;
    }
    const pub = await record(ctx, "published");
    return { status: "published", remoteId: pub.id, url: `simulation://publication/${pub.id}` };
  },

  async getStatus(ctx) {
    const pub = await prisma.simulatedPublication.findUniqueOrThrow({ where: { id: ctx.remoteId } });
    await prisma.simulatedPublication.update({ where: { id: pub.id }, data: { payload: { ...(pub.payload as object), state: "published" } } });
    return { status: "published", remoteId: pub.id, url: `simulation://publication/${pub.id}` };
  },

  async reconcile(ctx) {
    const pub = await prisma.simulatedPublication.findFirst({ where: { idempotencyKey: ctx.idempotencyKey, accountId: ctx.account.id } });
    return pub ? { found: true, remoteId: pub.id, url: `simulation://publication/${pub.id}` } : { found: false };
  },
};
