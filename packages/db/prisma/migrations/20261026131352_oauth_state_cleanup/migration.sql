/*
  Warnings:

  - You are about to drop the column `accountId` on the `OAuthState` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "OAuthState" DROP COLUMN "accountId";
