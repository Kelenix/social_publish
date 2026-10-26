import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@app/db";

export { SESSION_COOKIE } from "./cookie";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const hashPassword = (password: string) => hash(password);

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Vérifie les identifiants ; le temps de réponse ne révèle pas si l'e-mail existe. */
export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ok = await verify(user?.passwordHash ?? (await dummyHash()), password).catch(() => false);
  return ok && user ? user : null;
}

// Hash d'un mot de passe aléatoire, vérifié quand l'e-mail est inconnu (temps constant).
let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= hash(randomBytes(16).toString("hex")));

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function changePassword(userId: string, current: string, next: string): Promise<boolean> {
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verify(user.passwordHash, current))) return false;
  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } }),
    // Révoque toutes les sessions existantes.
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  return true;
}
