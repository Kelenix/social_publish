import { z } from "zod";

const schema = z.object({
  APP_URL: z.url().default("http://localhost:3000"),
  MEDIA_STORAGE: z.enum(["local", "s3"]).default("local"),
  MEDIA_LOCAL_DIR: z.string().min(1).default("./data/media"),
  MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(4 * 1024 ** 3),
  FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

/** Configuration validée, lue une fois depuis l'environnement (les chaînes vides valent « absent »). */
export function getConfig(): AppConfig {
  if (!cached) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    cached = schema.parse(env);
  }
  return cached;
}
