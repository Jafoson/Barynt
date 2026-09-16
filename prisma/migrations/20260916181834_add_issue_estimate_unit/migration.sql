-- AlterTable
-- `searchVector` is a generated column — Prisma's diff engine doesn't know
-- that and wants to drop its "default", which Postgres rejects. Removed
-- here, same drift as in the earlier BARY-4 migration; see CLAUDE.md's
-- migration checklist.
ALTER TABLE "Issue" ADD COLUMN     "estimateUnit" TEXT;

-- Backfill: any row that already carries an hour estimate but predates this
-- column defaults to "hours" — the unit it was always implicitly in.
UPDATE "Issue" SET "estimateUnit" = 'hours' WHERE "estimateHours" IS NOT NULL;
