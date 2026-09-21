-- AlterTable
ALTER TABLE "IssueViewPreference" ADD COLUMN     "hideEmptyGroups" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MyIssuesViewPreference" ADD COLUMN     "hideEmptyGroups" BOOLEAN NOT NULL DEFAULT false;
