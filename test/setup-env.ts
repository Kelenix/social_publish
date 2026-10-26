import os from "node:os";
import path from "node:path";

// Les tests n'utilisent jamais la base ni le stockage de l'application.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.MEDIA_STORAGE = "local";
process.env.MEDIA_LOCAL_DIR = path.join(os.tmpdir(), `studio-test-media-${process.pid}`);
