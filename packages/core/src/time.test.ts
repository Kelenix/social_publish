import { describe, expect, it } from "vitest";
import { utcToZonedInput, zonedToUtc } from "./time";

const ROME = "Europe/Rome";

describe("zonedToUtc", () => {
  it("convertit une heure d'hiver (UTC+1) et d'été (UTC+2)", () => {
    expect(zonedToUtc("2026-01-15T10:00", ROME)).toEqual({ ok: true, utc: new Date("2026-01-15T09:00:00Z") });
    expect(zonedToUtc("2026-07-15T10:00", ROME)).toEqual({ ok: true, utc: new Date("2026-07-15T08:00:00Z") });
  });

  it("refuse une heure inexistante (29 mars 2026, 02:30) et propose 03:30", () => {
    const result = zonedToUtc("2026-03-29T02:30", ROME);
    expect(result).toMatchObject({ ok: false, reason: "NONEXISTENT" });
    if (!result.ok && result.reason === "NONEXISTENT") expect(utcToZonedInput(result.suggestion, ROME)).toBe("2026-03-29T03:30");
  });

  it("signale une heure ambiguë (25 octobre 2026, 02:30) sans choisir arbitrairement", () => {
    expect(zonedToUtc("2026-10-25T02:30", ROME)).toEqual({
      ok: false,
      reason: "AMBIGUOUS",
      earlier: new Date("2026-10-25T00:30:00Z"),
      later: new Date("2026-10-25T01:30:00Z"),
    });
  });

  it("applique le choix explicite pour une heure ambiguë", () => {
    expect(zonedToUtc("2026-10-25T02:30", ROME, "later")).toEqual({ ok: true, utc: new Date("2026-10-25T01:30:00Z") });
  });

  it("gère un autre fuseau (New York, changement d'heure différent)", () => {
    expect(zonedToUtc("2026-03-08T02:30", "America/New_York")).toMatchObject({ ok: false, reason: "NONEXISTENT" });
    expect(zonedToUtc("2026-03-29T02:30", "America/New_York")).toEqual({ ok: true, utc: new Date("2026-03-29T06:30:00Z") });
  });

  it("refuse une date invalide", () => {
    expect(zonedToUtc("2026-02-30T10:00", ROME)).toEqual({ ok: false, reason: "INVALID" });
    expect(zonedToUtc("demain", ROME)).toEqual({ ok: false, reason: "INVALID" });
  });

  it("conserve la même heure murale après changement de fuseau de la publication", () => {
    const utc = new Date("2026-11-02T09:00:00Z");
    expect(utcToZonedInput(utc, ROME)).toBe("2026-11-02T10:00");
    expect(utcToZonedInput(utc, "Asia/Tokyo")).toBe("2026-11-02T18:00");
  });
});
