-- CreateEnum
CREATE TYPE "MissedPostPolicy" AS ENUM ('ASK_RESCHEDULE', 'PUBLISH_IF_RECENT', 'CANCEL');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'X', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultTimezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "missedPolicy" "MissedPostPolicy" NOT NULL DEFAULT 'ASK_RESCHEDULE',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "kind" "MediaKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "container" TEXT NOT NULL,
    "videoCodec" TEXT,
    "audioCodec" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "frameRate" DOUBLE PRECISION,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostMedia" (
    "postId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("postId","mediaId")
);

-- CreateTable
CREATE TABLE "PostVariant" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "text" TEXT,
    "title" TEXT,
    "description" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mediaIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "options" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "PostVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset"("sha256");

-- CreateIndex
CREATE INDEX "Post_status_updatedAt_idx" ON "Post"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "PostMedia_mediaId_idx" ON "PostMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "PostVariant_postId_platform_key" ON "PostVariant"("postId", "platform");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostVariant" ADD CONSTRAINT "PostVariant_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
