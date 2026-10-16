-- AlterTable
ALTER TABLE "SavedView" ADD COLUMN     "systemKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_workspaceId_systemKey_key" ON "SavedView"("workspaceId", "systemKey");
