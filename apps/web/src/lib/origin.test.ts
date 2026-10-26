import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./origin";

describe("isAllowedOrigin", () => {
  const app = "http://localhost:3000";
  it("accepte l'origine de l'application et l'hôte réellement interrogé", () => {
    expect(isAllowedOrigin("http://localhost:3000", "localhost:3000", app)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000", "127.0.0.1:3000", app)).toBe(true);
    expect(isAllowedOrigin("https://abc.trycloudflare.com", "abc.trycloudflare.com", app)).toBe(true);
  });
  it("refuse une autre origine, une origine absente ou invalide", () => {
    expect(isAllowedOrigin("https://malveillant.example", "localhost:3000", app)).toBe(false);
    expect(isAllowedOrigin(null, "localhost:3000", app)).toBe(false);
    expect(isAllowedOrigin("null", "localhost:3000", app)).toBe(false);
  });
});
