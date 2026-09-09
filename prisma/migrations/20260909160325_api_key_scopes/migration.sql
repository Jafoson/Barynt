/*
  Warnings:

  - You are about to drop the column `scope` on the `ApiKey` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ApiKey" DROP COLUMN "scope",
ADD COLUMN     "scopes" TEXT[];

-- DropEnum
DROP TYPE "ApiKeyScope";
