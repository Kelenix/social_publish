-- CreateEnum
CREATE TYPE "WorkflowValidation" AS ENUM ('REVIEW', 'QUICK');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "templateId" UUID;

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "accountIds" UUID[],
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "defaultTime" TEXT,
    "validationMode" "WorkflowValidation" NOT NULL DEFAULT 'REVIEW',
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "options" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_name_key" ON "WorkflowTemplate"("name");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
