-- CreateEnum
CREATE TYPE "StatusCategory" AS ENUM ('backlog', 'unstarted', 'started', 'completed', 'canceled');

-- AlterTable
ALTER TABLE "Status" ADD COLUMN     "category" "StatusCategory" NOT NULL DEFAULT 'unstarted';

-- Backfill: the built-in statuses get their real meaning (BARY-161).
-- Anything else keeps the default "unstarted" (open).
UPDATE "Status" SET "category" = 'backlog'   WHERE "id" = 'backlog';
UPDATE "Status" SET "category" = 'started'   WHERE "id" IN ('in_progress', 'in_review');
UPDATE "Status" SET "category" = 'completed' WHERE "id" = 'done';
UPDATE "Status" SET "category" = 'canceled'  WHERE "id" = 'canceled';
