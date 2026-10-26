import { describe, expect, it } from "vitest";
import { validateContent } from "../connectors/validate";
import type { Capabilities } from "../connectors/types";
import { aggregateStatus, retryDelayMs } from "./status";

describe("aggregateStatus", () => {
  it.each([
    [[], "DRAFT"],
    [["PENDING", "PENDING"], "SCHEDULED"],
    [["PENDING", "PUBLISHING"], "PUBLISHING"],
    [["PUBLISHED", "PUBLISHED"], "PUBLISHED"],
    [["PUBLISHED", "FAILED"], "PARTIAL"],
    [["FAILED", "FAILED"], "FAILED"],
    [["PUBLISHED", "CANCELLED"], "PUBLISHED"],
    [["CANCELLED"], "CANCELLED"],
    [["PUBLISHED", "UNCERTAIN"], "NEEDS_ATTENTION"],
    [["MISSED", "PENDING"], "NEEDS_ATTENTION"],
  ] as const)("%j → %s", (statuses, expected) => {
    expect(aggregateStatus([...statuses])).toBe(expected);
  });
});

describe("retryDelayMs", () => {
  it("double à chaque tentative, plafonné à 1 h", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(240_000);
    expect(retryDelayMs(20)).toBe(3_600_000);
  });

  it("respecte un Retry-After plus long", () => {
    expect(retryDelayMs(1, 300_000)).toBe(300_000);
  });
});

describe("validateContent", () => {
  const caps: Capabilities = {
    contentTypes: ["VIDEO"],
    immediatePublish: true,
    nativeScheduling: false,
    statusTracking: false,
    cancellation: false,
    reconciliation: false,
    permissions: [],
    limits: { textMax: 10, titleRequired: true, titleMax: 5, mediaMin: 1, mediaMax: 1, mimeTypes: ["video/mp4"], videoMaxDurationMs: 60_000, aspectRatio: { min: 0.5, max: 0.6 } },
    notes: [],
  };
  const content = { platform: "TEST" as const, text: "", title: "", description: "", hashtags: [], mediaIds: [], options: {} };
  const video = { id: "v", kind: "VIDEO" as const, mimeType: "video/mp4", sizeBytes: 10, width: 1080, height: 1920, durationMs: 30_000 };

  it("accepte un contenu conforme", () => {
    expect(validateContent({ ...content, title: "Ok" }, "court", [video], caps)).toEqual([]);
  });

  it("signale chaque limite dépassée, sans recadrer", () => {
    const messages = validateContent(content, "beaucoup trop long", [{ ...video, mimeType: "video/webm", durationMs: 90_000, width: 1920, height: 1080 }], caps).map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Texte trop long"),
        "Titre obligatoire.",
        expect.stringContaining("format video/webm"),
        expect.stringContaining("durée"),
        expect.stringContaining("Aucun recadrage automatique"),
      ]),
    );
  });

  it("exige un média quand le texte seul n'est pas pris en charge", () => {
    expect(validateContent({ ...content, title: "Ok" }, "", [], caps).map((i) => i.field)).toContain("media");
  });
});
