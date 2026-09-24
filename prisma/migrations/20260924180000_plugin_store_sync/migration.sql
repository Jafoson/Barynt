-- AlterTable
ALTER TABLE "PluginStore" ADD COLUMN     "syncAttemptedAt" TIMESTAMP(3),
ADD COLUMN     "syncError" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);
