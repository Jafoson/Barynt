-- AlterTable
ALTER TABLE "UserPreferences"
  ADD COLUMN     "projectLanding" TEXT NOT NULL DEFAULT 'board',
  ADD COLUMN     "startPage" TEXT NOT NULL DEFAULT 'workspace',
  ADD COLUMN     "issueOpenMode" TEXT NOT NULL DEFAULT 'panel',
  ADD COLUMN     "defaultGrouping" TEXT NOT NULL DEFAULT 'status',
  ADD COLUMN     "defaultSort" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN     "defaultShowSubIssues" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "sidebarCollapsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "projectOrder" TEXT NOT NULL DEFAULT 'name',
  ADD COLUMN     "dateFormat" TEXT NOT NULL DEFAULT 'relative',
  ADD COLUMN     "weekStart" TEXT NOT NULL DEFAULT 'monday',
  ADD COLUMN     "timeZone" TEXT,
  ADD COLUMN     "shortcutOverrides" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN     "confirmDestructive" BOOLEAN NOT NULL DEFAULT true;
