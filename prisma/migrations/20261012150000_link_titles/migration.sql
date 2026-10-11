-- AlterTable
ALTER TABLE "CustomField" ADD COLUMN     "linkFetchTitle" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "IssueFieldValue" ADD COLUMN     "title" TEXT;
