import { prisma, type Prisma } from "@app/db";

export type AuditEntry = {
  actor: string;
  action: string;
  entity?: string;
  entityId?: string;
  /** Métadonnées non sensibles uniquement : jamais de jeton, mot de passe ou clé. */
  meta?: Prisma.InputJsonObject;
};

export async function audit(entry: AuditEntry, tx: Prisma.TransactionClient = prisma): Promise<void> {
  await tx.auditLog.create({ data: { ...entry, meta: entry.meta ?? {} } });
}
