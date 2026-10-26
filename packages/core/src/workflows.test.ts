import { afterAll, describe, expect, it } from "vitest";
import { nextSlot } from "./workflows";

describe("nextSlot", () => {
  it("propose aujourd'hui si l'heure est encore à venir, sinon demain", () => {
    expect(nextSlot("18:00", "Europe/Rome", new Date("2026-11-03T10:00:00Z"))).toBe("2026-11-03T18:00");
    expect(nextSlot("09:00", "Europe/Rome", new Date("2026-11-03T10:00:00Z"))).toBe("2026-11-04T09:00");
  });

  it("garde 15 minutes de marge", () => {
    expect(nextSlot("11:10", "Europe/Rome", new Date("2026-11-03T10:00:00Z"))).toBe("2026-11-04T11:10");
  });

  it("le jour du passage à l'heure d'été, prend l'heure valide suivante", () => {
    expect(nextSlot("02:30", "Europe/Rome", new Date("2026-03-28T23:00:00Z"))).toBe("2026-03-29T03:30");
  });
});

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("modèles de workflow (intégration)", async () => {
  const { prisma } = await import("@app/db");
  const workflows = await import("./workflows");
  const posts = await import("./posts/service");
  const { contentFingerprint } = await import("./posts/schema");
  const { createTestAccount } = await import("./scheduling/service");
  afterAll(() => prisma.$disconnect());

  it("enregistre, applique et protège un modèle", async () => {
    const test = await createTestAccount("Compte modèle", "test");
    const yt = await prisma.connectedAccount.create({ data: { connector: "youtube", platform: "YOUTUBE", externalId: crypto.randomUUID(), displayName: "Chaîne" } });
    const name = `Lancement ${Date.now()}`;

    const template = await workflows.saveTemplate(
      null,
      { name, accountIds: [yt.id, test.id], timezone: "America/New_York", defaultTime: "18:30", validationMode: "QUICK", hashtags: ["#studio"], options: { YOUTUBE: { privacyStatus: "private", madeForKids: false } } },
      "test",
    );
    expect(template).toMatchObject({ timezone: "America/New_York", defaultTime: "18:30", validationMode: "QUICK", hashtags: ["studio"] });

    await expect(workflows.saveTemplate(null, { name, accountIds: [test.id] }, "test")).rejects.toThrow("déjà ce nom");
    await expect(workflows.saveTemplate(null, { name: "Autre", accountIds: ["99999999-9999-4999-8999-999999999999"] }, "test")).rejects.toThrow(workflows.TemplateError);
    await expect(workflows.saveTemplate(null, { name: "Heure", accountIds: [test.id], defaultTime: "25:00" }, "test")).rejects.toThrow();

    const draft = workflows.draftFromTemplate(template, await workflows.templateAccounts(template), "Depuis modèle");
    expect(draft).toMatchObject({
      timezone: "America/New_York",
      hashtags: ["studio"],
      templateId: template.id,
      variants: [
        { platform: "YOUTUBE", options: { privacyStatus: "private", madeForKids: false } },
        { platform: "TEST", options: {} },
      ],
    });

    const post = await posts.createDraft(draft, "test");
    expect(post.templateId).toBe(template.id);
    // Le modèle d'origine ne fait pas partie du contenu publiable (pas de nouvelle version).
    const input = posts.toInput(post);
    expect(contentFingerprint({ ...input, templateId: null })).toBe(contentFingerprint(input));

    await workflows.deleteTemplate(template.id, "test");
    expect((await posts.getPost(post.id))?.templateId).toBeNull();
  });
});
