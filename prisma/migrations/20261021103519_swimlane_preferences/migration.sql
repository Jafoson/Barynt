-- BARY-173: swimlanes — hide empty lanes, and which lanes each person folded.

-- AlterTable
ALTER TABLE "IssueViewPreference" ADD COLUMN     "collapsedLanes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hideEmptyLanes" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MyIssuesViewPreference" ADD COLUMN     "collapsedLanes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hideEmptyLanes" BOOLEAN NOT NULL DEFAULT false;
