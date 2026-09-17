-- AlterTable
-- `searchVector` on Comment/Issue is a generated column — Prisma's diff
-- engine doesn't know that and wants to drop its "default", which Postgres
-- rejects. Removed here, same drift as the two earlier BARY-4 migrations;
-- see CLAUDE.md's migration checklist.
ALTER TABLE "Project" ADD COLUMN     "hiddenDetailFields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: every existing project gets the same default an app-created one
-- would (features/projects/detail-fields.ts#DEFAULT_HIDDEN_DETAIL_FIELDS) —
-- otherwise projects that already existed before this migration would show
-- the three planning fields immediately, unlike newly created ones.
UPDATE "Project" SET "hiddenDetailFields" = ARRAY['dueDate', 'storyPoints', 'estimateHours'];
