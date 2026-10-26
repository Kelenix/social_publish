import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { text } from "node:stream/consumers";
import { afterAll, describe, expect, it } from "vitest";
import { assertValidKey } from "./keys";
import { LocalStorage } from "./local";

describe("assertValidKey", () => {
  it.each(["../etc/passwd", "media/../../x", "/abs/path", "C:\\Windows", "media//x", "Media/X.mp4", ""])("refuse %j", (key) => {
    expect(() => assertValidKey(key)).toThrow();
  });

  it("accepte une clé générée par l'application", () => {
    expect(() => assertValidKey("media/2026/10/0b0e2a6c-1d2b-4c3a-9f00-1234567890ab.mp4")).not.toThrow();
  });
});

describe("LocalStorage", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "storage-"));
  const storage = new LocalStorage(path.join(dir, "store"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("archive un fichier, le relit par plage puis le supprime", async () => {
    const source = path.join(dir, "source.txt");
    writeFileSync(source, "0123456789");
    await storage.ingestFile("media/a.txt", source);

    expect(existsSync(source)).toBe(false);
    expect(await storage.size("media/a.txt")).toBe(10);
    expect(await text(await storage.read("media/a.txt", { start: 2, end: 4 }))).toBe("234");

    await storage.remove("media/a.txt");
    expect(await storage.size("media/a.txt")).toBeNull();
  });
});
