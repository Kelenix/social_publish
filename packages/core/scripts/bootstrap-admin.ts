/**
 * Crée l'administrateur au premier démarrage s'il n'existe aucun compte.
 * Sans effet ensuite : le mot de passe se change dans Réglages.
 */
import { prisma } from "@app/db";
import { hashPassword } from "../src/auth";
import { audit } from "../src/audit";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_INITIAL_PASSWORD;

if ((await prisma.adminUser.count()) > 0) {
  console.log("Administrateur déjà présent : rien à faire.");
} else if (!email || !password) {
  console.error("Aucun administrateur : renseigne ADMIN_EMAIL et ADMIN_INITIAL_PASSWORD dans .env puis relance.");
  process.exitCode = 1;
} else if (password.length < 12) {
  console.error("ADMIN_INITIAL_PASSWORD doit contenir au moins 12 caractères.");
  process.exitCode = 1;
} else {
  const user = await prisma.adminUser.create({ data: { email, passwordHash: await hashPassword(password) } });
  await audit({ actor: "system", action: "admin.bootstrap", entity: "admin", entityId: user.id });
  console.log(`Administrateur créé : ${email}. Tu peux maintenant vider ADMIN_INITIAL_PASSWORD dans .env.`);
}
await prisma.$disconnect();
