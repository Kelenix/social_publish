import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Parcours principal, uniquement avec le connecteur de simulation (aucune publication réelle) :
 * connexion → import d'un média → compte de test → brouillon → publication → suivi.
 */

const email = process.env.E2E_EMAIL ?? process.env.ADMIN_EMAIL ?? "";
const password = process.env.E2E_PASSWORD ?? process.env.ADMIN_INITIAL_PASSWORD ?? "";
const run = Date.now().toString(36);

function sampleImage(): Buffer {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "e2e-")), "visuel.jpg");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=yellow:size=1080x1350", "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", file]);
  return readFileSync(file);
}

async function login(page: Page) {
  await page.goto("/connexion");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
}

/** Lien de la barre de navigation (les mêmes libellés existent ailleurs dans les pages). */
const nav = (page: Page, name: string) => page.getByRole("navigation").getByRole("link", { name, exact: true }).click();

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  if (!email || !password) throw new Error("Renseigne ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD (ou E2E_EMAIL / E2E_PASSWORD).");
});

test("les pages protégées exigent une connexion", async ({ page }) => {
  await page.goto("/publications");
  await expect(page).toHaveURL(/\/connexion$/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("invalide");
});

test("parcours complet avec le connecteur de simulation", async ({ page }) => {
  await login(page);

  // Le tableau de bord rappelle les contraintes de la programmation locale et l'état du worker.
  await expect(page.getByRole("note")).toContainText("ordinateur est allumé");
  await expect(page.getByText("Actif", { exact: true })).toBeVisible();

  // Import d'un média.
  await nav(page, "Médias");
  const name = `e2e-${run}.jpg`;
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/jpeg", buffer: sampleImage() });
  await expect(page.getByText("Importé")).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();

  // Compte de simulation.
  await nav(page, "Comptes");
  await expect(page.getByText("Simulation — aucun réseau réel")).toBeVisible();
  await page.getByLabel("Nom").fill(`E2E ${run}`);
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText(`E2E ${run}`)).toBeVisible();

  // Brouillon multi-plateforme.
  await nav(page, "Publications");
  await page.locator("main header").getByRole("link", { name: "Nouvelle publication" }).click();
  await page.getByLabel("Titre", { exact: true }).fill(`Parcours E2E ${run}`);
  await page.getByLabel("Texte", { exact: true }).fill("Publication de bout en bout");
  await page.getByLabel("Hashtags", { exact: true }).fill("#e2e");
  await page.getByRole("button", { name: "Choisir dans la bibliothèque" }).first().click();
  await page.getByRole("button", { name: name, exact: true }).click();
  await page.getByRole("button", { name: "Terminé" }).click();
  await page.getByRole("button", { name: "Test (simulation)" }).click();
  await expect(page.locator("aside article")).toContainText("Publication de bout en bout");

  // Publication immédiate vers le compte de simulation.
  await page.getByRole("checkbox", { name: new RegExp(`E2E ${run}`) }).check();
  await page.getByRole("radio", { name: "Maintenant" }).click();
  await page.getByRole("button", { name: "Publier maintenant" }).click();
  await expect(page).toHaveURL(/\/publications\/[0-9a-f-]{36}$/);

  // Le worker publie : on recharge jusqu'à voir l'état final.
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Publiée", { exact: true }).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 45_000 });
  await expect(page.getByText(/simulation:\/\/publication\//)).toBeVisible();

  // Modèle de workflow en mode « Rapide » : comptes et horaire présélectionnés.
  await nav(page, "Modèles");
  await page.getByLabel("Nom").fill(`Modèle ${run}`);
  await page.getByLabel("Heure habituelle de publication").fill("18:00");
  await page.getByRole("checkbox", { name: new RegExp(`E2E ${run}`) }).check();
  await page.getByRole("radio", { name: /Rapide/ }).check();
  await page.getByRole("button", { name: "Enregistrer le modèle" }).click();
  const item = page.locator("li", { hasText: `Modèle ${run}` });
  await expect(item).toBeVisible();
  await item.getByRole("link", { name: "Nouvelle publication" }).click();
  await expect(page.getByText(`Modèle : Modèle ${run}`)).toBeVisible();
  await expect(page.getByText(`Présélection du modèle « Modèle ${run} »`)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: new RegExp(`E2E ${run}`) })).toBeChecked();
  await expect(page.getByLabel("Date et heure")).toHaveValue(/T18:00$/);
  await nav(page, "Modèles");
  await page.locator("li", { hasText: `Modèle ${run}` }).getByRole("button", { name: "Supprimer" }).click();
  await expect(page.locator("li", { hasText: `Modèle ${run}` })).toHaveCount(0);

  // Historique et calendrier.
  await nav(page, "Historique");
  await expect(page.getByRole("link", { name: `Parcours E2E ${run}` }).first()).toBeVisible();
  await nav(page, "Calendrier");
  await expect(page.getByTitle(new RegExp(`Parcours E2E ${run}`))).toBeVisible();
});
