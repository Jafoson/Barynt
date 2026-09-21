-- AlterTable
ALTER TABLE "IssueViewPreference" ADD COLUMN     "hiddenGroups" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "MyIssuesViewPreference" ADD COLUMN     "hiddenGroups" TEXT[] DEFAULT ARRAY[]::TEXT[];
