import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Variables locales (TEST_DATABASE_URL…) ; celles déjà définies dans l'environnement priment.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Les tests d'intégration partagent une base : exécution séquentielle des fichiers.
    fileParallelism: false,
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup-env.ts"],
  },
});
