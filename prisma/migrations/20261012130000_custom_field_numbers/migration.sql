-- CreateEnum
CREATE TYPE "CustomFieldNumberMode" AS ENUM ('INTEGER', 'DECIMAL', 'FREE');

-- AlterTable
ALTER TABLE "CustomField" ADD COLUMN     "numberDecimals" INTEGER,
ADD COLUMN     "numberMode" "CustomFieldNumberMode" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "numberUnit" TEXT;

