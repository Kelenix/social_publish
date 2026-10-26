import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Identifiants de l'administrateur (ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD ou E2E_*) lus dans .env.
if (existsSync(".env")) process.loadEnvFile(".env");

/**
 * Parcours de bout en bout contre l'application lancée (docker compose up).
 * Navigateur : Chromium de Playwright en CI, Chrome installé en local (PW_CHANNEL=chrome).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: process.env.PW_CHANNEL || undefined,
    locale: "fr-FR",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
  },
});
