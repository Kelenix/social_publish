/**
 * Remplace l'e-mail et le mot de passe de l'administrateur par ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD
 * (.env) et ferme toutes les sessions. À utiliser en cas de mot de passe perdu ou pour changer d'e-mail.
 * docker compose run --rm migrate pnpm admin:reset
 */
import { prisma } from "@app/db";
import { hashPassword } from "../src/auth";
import { audit } from "../src/audit";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_INITIAL_PASSWORD;
const admins = await prisma.adminUser.findMany();

if (!email || !password) {
  console.error("Renseigne ADMIN_EMAIL et ADMIN_INITIAL_PASSWORD dans .env.");
  process.exitCode = 1;
} else if (password.length < 12) {
  console.error("ADMIN_INITIAL_PASSWORD doit contenir au moins 12 caractères.");
  process.exitCode = 1;
} else if (admins.length !== 1) {
  console.error(`Exactement un administrateur attendu (trouvé : ${admins.length}).`);
  process.exitCode = 1;
} else {
  const admin = admins[0]!;
  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: admin.id }, data: { email, passwordHash: await hashPassword(password) } }),
    prisma.session.deleteMany({ where: { userId: admin.id } }),
  ]);
  await audit({ actor: "system", action: "admin.reset", entity: "admin", entityId: admin.id });
  console.log(`Administrateur mis à jour : ${email}. Toutes les sessions ont été fermées.`);
}
await prisma.$disconnect();
