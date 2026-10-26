import { execSync } from "node:child_process";
import pg from "pg";

/** Prépare la base de test (création + migrations, sans effacement) si TEST_DATABASE_URL est définie. */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(dbName)) throw new Error("TEST_DATABASE_URL doit viser une base dont le nom finit par _test.");

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();

  execSync("pnpm exec prisma migrate deploy", {
    cwd: "packages/db",
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
