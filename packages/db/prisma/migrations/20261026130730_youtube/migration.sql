-- AlterEnum
ALTER TYPE "DestinationStatus" ADD VALUE 'REMOTE_SCHEDULED';

-- AlterTable
ALTER TABLE "ConnectedAccount" ADD COLUMN     "credentials" TEXT,
ADD COLUMN     "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Destination" ADD COLUMN     "connectorState" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" UUID NOT NULL,
    "stateHash" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "accountId" UUID,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_stateHash_key" ON "OAuthState"("stateHash");

