import { describe, expect, it } from "vitest";
import { createFailureLimiter } from "./rate-limit";

describe("createFailureLimiter", () => {
  it("bloque après le nombre maximal d'échecs puis libère à la fin de la fenêtre", () => {
    let t = 0;
    const limiter = createFailureLimiter(3, 1000, () => t);
    limiter.fail("k");
    limiter.fail("k");
    expect(limiter.retryAfterSeconds("k")).toBe(0);
    limiter.fail("k");
    expect(limiter.retryAfterSeconds("k")).toBe(1);
    t = 1001;
    expect(limiter.retryAfterSeconds("k")).toBe(0);
  });

  it("remet le compteur à zéro après une connexion réussie", () => {
    const limiter = createFailureLimiter(1, 1000, () => 0);
    limiter.fail("k");
    limiter.reset("k");
    expect(limiter.retryAfterSeconds("k")).toBe(0);
  });
});
