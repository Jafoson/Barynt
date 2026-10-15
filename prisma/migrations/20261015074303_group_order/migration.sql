-- AlterTable
ALTER TABLE "IssueViewPreference" ADD COLUMN     "groupOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "MyIssuesViewPreference" ADD COLUMN     "groupOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
