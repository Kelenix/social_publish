import { createReadStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import type { StorageDriver } from "./index";
import { assertValidKey, type ByteRange } from "./keys";

/** Stockage sur disque (volume Docker persistant en production locale). */
export class LocalStorage implements StorageDriver {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private pathFor(key: string): string {
    assertValidKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Clé hors du stockage : ${key}`);
    return full;
  }

  async ingestFile(key: string, filePath: string): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await rename(filePath, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      // Autre volume : copie vers un fichier partiel puis renommage atomique.
      const partial = `${target}.partial`;
      await copyFile(filePath, partial);
      await rename(partial, target);
      await rm(filePath, { force: true });
    }
  }

  async read(key: string, range?: ByteRange): Promise<Readable> {
    return createReadStream(this.pathFor(key), range);
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.pathFor(key))).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
