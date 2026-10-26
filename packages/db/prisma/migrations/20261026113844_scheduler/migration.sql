-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('READY', 'RECONNECT_REQUIRED', 'PERMISSION_MISSING', 'PLATFORM_REVIEW_REQUIRED', 'MANUAL_ONLY');

-- CreateEnum
CREATE TYPE "DestinationStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PROCESSING', 'RETRY_WAIT', 'PUBLISHED', 'FAILED', 'UNCERTAIN', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('PUBLISHED', 'PROCESSING', 'RETRYABLE_ERROR', 'FATAL_ERROR', 'UNCERTAIN', 'RECONCILED', 'INTERRUPTED');

-- AlterEnum
ALTER TYPE "Platform" ADD VALUE 'TEST';

-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'NEEDS_ATTENTION';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" UUID NOT NULL,
    "connector" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'READY',
    "statusDetail" TEXT,
    "rateLimitedUntil" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "DestinationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "authorizedBy" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "remoteId" TEXT,
    "remoteUrl" TEXT,
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationAttempt" (
    "id" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" "AttemptOutcome",
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "retryAfterMs" INTEGER,

    CONSTRAINT "PublicationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulatedPublication" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulatedPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "workerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_connector_externalId_key" ON "ConnectedAccount"("connector", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_idempotencyKey_key" ON "Destination"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Destination_status_nextAttemptAt_idx" ON "Destination"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_postId_accountId_key" ON "Destination"("postId", "accountId");

-- CreateIndex
CREATE INDEX "PublicationAttempt_destinationId_startedAt_idx" ON "PublicationAttempt"("destinationId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SimulatedPublication_idempotencyKey_key" ON "SimulatedPublication"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
