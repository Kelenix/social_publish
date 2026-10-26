import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL manquante");
    // Un seul client par processus (évite la multiplication des connexions en dev / HMR).
    globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return globalForPrisma.prisma;
}

/** Client créé à la première utilisation : importer ce module ne requiert pas la base (build). */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
