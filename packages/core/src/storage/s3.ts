import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { AppConfig } from "../config";
import type { StorageDriver } from "./index";
import { assertValidKey, type ByteRange } from "./keys";

/** Stockage compatible S3 (AWS, Cloudflare R2, MinIO, Scaleway…). */
export class S3Storage implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfig) {
    const { S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = config;
    if (!S3_BUCKET || !S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      throw new Error("MEDIA_STORAGE=s3 exige S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY");
    }
    this.bucket = S3_BUCKET;
    this.client = new S3Client({
      region: S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    });
  }

  async ingestFile(key: string, filePath: string, contentType: string): Promise<void> {
    assertValidKey(key);
    await new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: createReadStream(filePath), ContentType: contentType },
    }).done();
    await rm(filePath, { force: true });
  }

  async read(key: string, range?: ByteRange): Promise<Readable> {
    assertValidKey(key);
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      }),
    );
    return res.Body as Readable;
  }

  async size(key: string): Promise<number | null> {
    assertValidKey(key);
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? null;
    } catch (error) {
      if ((error as { name?: string }).name === "NotFound") return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
