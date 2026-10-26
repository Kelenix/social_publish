import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fetchRemote, isForbiddenAddress, resolveInboxPath, SourceError } from "./sources";

describe("resolveInboxPath", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "inbox-test-"));
  const inbox = path.join(dir, "inbox");
  mkdirSync(path.join(inbox, "sous-dossier"), { recursive: true });
  writeFileSync(path.join(inbox, "clip.mp4"), "x");
  writeFileSync(path.join(inbox, "sous-dossier", "photo.jpg"), "x");
  writeFileSync(path.join(dir, "secret.txt"), "secret");
  let symlinkCreated = false;
  try {
    symlinkSync(path.join(dir, "secret.txt"), path.join(inbox, "lien"));
    symlinkCreated = true;
  } catch {
    // Windows sans droits de création de liens : le cas est alors ignoré.
  }
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("accepte un chemin relatif à l'inbox", async () => {
    expect(await resolveInboxPath("sous-dossier/photo.jpg", inbox)).toBe(path.join(await import("node:fs/promises").then((f) => f.realpath(inbox)), "sous-dossier", "photo.jpg"));
  });

  it("traduit un chemin absolu Windows ou WSL déclaré comme alias", async () => {
    const aliases = ["C:\\Users\\moi\\studio\\inbox", "/mnt/c/Users/moi/studio/inbox"];
    expect(await resolveInboxPath("C:\\Users\\moi\\studio\\inbox\\clip.mp4", inbox, aliases)).toMatch(/clip\.mp4$/);
    expect(await resolveInboxPath("c:/users/moi/studio/inbox/clip.mp4", inbox, aliases)).toMatch(/clip\.mp4$/);
    expect(await resolveInboxPath("/mnt/c/Users/moi/studio/inbox/clip.mp4", inbox, aliases)).toMatch(/clip\.mp4$/);
  });

  it.each(["../secret.txt", "sous-dossier/../../secret.txt", "C:\\Windows\\win.ini", "/etc/passwd", "", "absent.mp4", "sous-dossier"])("refuse %j", async (p) => {
    await expect(resolveInboxPath(p, inbox, ["C:/Users/moi/studio/inbox"])).rejects.toThrow(SourceError);
  });

  it.skipIf(!symlinkCreated)("refuse un lien symbolique qui sort de l'inbox", async () => {
    await expect(resolveInboxPath("lien", inbox)).rejects.toThrow(SourceError);
  });
});

describe("protection SSRF", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "refuse l'adresse %s",
    (ip) => expect(isForbiddenAddress(ip)).toBe(true),
  );

  it.each(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])("accepte l'adresse publique %s", (ip) => {
    expect(isForbiddenAddress(ip)).toBe(false);
  });

  it.each(["http://example.com/a.mp4", "https://127.0.0.1/a.mp4", "https://[::1]/a.mp4", "https://localhost/a.mp4", "https://user:pass@example.com/a.mp4", "file:///etc/passwd", "pas une url"])(
    "refuse %s avant toute connexion",
    async (url) => {
      await expect(fetchRemote(url)).rejects.toThrow(SourceError);
    },
  );
});
