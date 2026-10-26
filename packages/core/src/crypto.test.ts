import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decrypt, decryptJson, encrypt, encryptJson, EncryptionKeyError } from "./crypto";

describe("chiffrement des jetons", () => {
  const original = process.env.TOKEN_ENCRYPTION_KEY;
  afterEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = original;
  });

  it("chiffre et déchiffre sans laisser le secret en clair", () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const payload = encryptJson({ refreshToken: "1//secret-refresh" });
    expect(payload).not.toContain("secret");
    expect(decryptJson(payload)).toEqual({ refreshToken: "1//secret-refresh" });
    expect(encrypt("a")).not.toBe(encrypt("a"));
  });

  it("refuse un contenu altéré", () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const parts = encrypt("jeton").split(".");
    parts[3] = Buffer.from("autre").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("refuse de déchiffrer avec une autre clé", () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const payload = encrypt("jeton");
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decrypt(payload)).toThrow();
  });

  it("exige une clé de 32 octets", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(EncryptionKeyError);
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("trop court").toString("base64");
    expect(() => encrypt("x")).toThrow(EncryptionKeyError);
  });
});
