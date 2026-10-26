import { afterEach, describe, expect, it } from "vitest";
import { publicMediaProblem, PublicUrlError, signedMediaUrl, verifyMediaSignature } from "./public-url";

const ID = "11111111-1111-4111-8111-111111111111";

describe("URLs publiques signées", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.PUBLIC_BASE_URL = saved.PUBLIC_BASE_URL;
    process.env.MEDIA_URL_SIGNING_KEY = saved.MEDIA_URL_SIGNING_KEY;
  });
  const configure = (base: string) => {
    process.env.PUBLIC_BASE_URL = base;
    process.env.MEDIA_URL_SIGNING_KEY = "k".repeat(40);
  };

  it.each(["http://studio.example.com", "https://localhost:3000", "https://127.0.0.1", "https://app.localhost", ""])("refuse une base non publique : %j", (base) => {
    configure(base);
    expect(publicMediaProblem()).not.toBeNull();
    expect(() => signedMediaUrl(ID, 60_000)).toThrow(PublicUrlError);
  });

  it("signe une URL HTTPS publique vérifiable jusqu'à expiration", () => {
    configure("https://studio.example.com/");
    const url = new URL(signedMediaUrl(ID, 60_000, 1_000_000));
    expect(url.origin + url.pathname).toBe(`https://studio.example.com/api/public/media/${ID}`);
    const [exp, sig] = [url.searchParams.get("exp"), url.searchParams.get("sig")];
    expect(verifyMediaSignature(ID, exp, sig, 1_000_000)).toBe(true);
    expect(verifyMediaSignature(ID, exp, sig, 1_000_000 + 61_000)).toBe(false);
    expect(verifyMediaSignature("22222222-2222-4222-8222-222222222222", exp, sig, 1_000_000)).toBe(false);
    expect(verifyMediaSignature(ID, String(Number(exp) + 3600), sig, 1_000_000)).toBe(false);
  });
});
