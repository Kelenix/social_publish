import type { Readable } from "node:stream";
import { getConfig } from "../config";
import type { ByteRange } from "./keys";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

export { assertValidKey, type ByteRange } from "./keys";

/** Stockage durable des médias. Les clés sont générées par l'application, jamais par l'utilisateur. */
export interface StorageDriver {
  /** Prend possession du fichier : il est déplacé (ou téléversé puis supprimé). */
  ingestFile(key: string, filePath: string, contentType: string): Promise<void>;
  read(key: string, range?: ByteRange): Promise<Readable>;
  size(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
}

let driver: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (!driver) {
    const config = getConfig();
    driver = config.MEDIA_STORAGE === "s3" ? new S3Storage(config) : new LocalStorage(config.MEDIA_LOCAL_DIR);
  }
  return driver;
}
