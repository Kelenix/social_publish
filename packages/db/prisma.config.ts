import { defineConfig } from "prisma/config";

// `prisma generate` n'a pas besoin de la base : l'URL n'est exigée que par les commandes de migration.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
