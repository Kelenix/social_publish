-- DropIndex
DROP INDEX "SimulatedPublication_idempotencyKey_key";

-- CreateIndex
CREATE INDEX "SimulatedPublication_idempotencyKey_idx" ON "SimulatedPublication"("idempotencyKey");
