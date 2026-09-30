-- AlterTable
ALTER TABLE "IssueViewPreference" ADD COLUMN     "showSubIssues" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MyIssuesViewPreference" ADD COLUMN     "showSubIssues" BOOLEAN NOT NULL DEFAULT false;
