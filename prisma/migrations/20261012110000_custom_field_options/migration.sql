-- CreateEnum
CREATE TYPE "CustomFieldDateMode" AS ENUM ('DATE', 'DATETIME', 'TIME');

-- AlterTable
ALTER TABLE "CustomField" ADD COLUMN     "allowCustomOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dateMode" "CustomFieldDateMode" NOT NULL DEFAULT 'DATE',
ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "fieldDateFormat" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "fieldLabelMode" TEXT NOT NULL DEFAULT 'icon',
ADD COLUMN     "fieldTimeFormat" TEXT NOT NULL DEFAULT '24h';
