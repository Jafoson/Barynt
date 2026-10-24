-- Liste als Tabelle (BARY-175): Spaltenauswahl pro Liste, Breiten pro Person.
ALTER TABLE "IssueViewPreference" ADD COLUMN "columns" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MyIssuesViewPreference" ADD COLUMN "columns" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserPreferences" ADD COLUMN "listColumnWidths" JSONB NOT NULL DEFAULT '{}';
