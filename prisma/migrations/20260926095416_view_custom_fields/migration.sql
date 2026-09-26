-- The custom fields (BARY-81) a person shows on the cards and rows of a board or list. The other way
-- round from `hiddenFields`: no card shows a custom field until someone asks for it.
-- AlterTable
ALTER TABLE "IssueViewPreference" ADD COLUMN     "shownCustomFields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "MyIssuesViewPreference" ADD COLUMN     "shownCustomFields" TEXT[] DEFAULT ARRAY[]::TEXT[];
