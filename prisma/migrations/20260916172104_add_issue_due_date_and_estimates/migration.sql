-- AlterTable
-- `searchVector` on both tables is a generated column maintained by
-- Postgres itself (see the GIN-index migrations) — Prisma's diff engine
-- doesn't understand generated columns and mistakenly wants to drop their
-- "default", which Postgres rejects outright (see CLAUDE.md's migration
-- checklist and BARY-11's own history of the same drift). Both
-- `ALTER COLUMN "searchVector" DROP DEFAULT` statements are removed here —
-- unrelated to this migration's actual change (the three new Issue columns
-- below).
ALTER TABLE "Issue" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "estimateHours" DOUBLE PRECISION,
ADD COLUMN     "storyPoints" INTEGER;

-- CreateIndex
CREATE INDEX "Issue_projectId_dueDate_idx" ON "Issue"("projectId", "dueDate");
