-- AlterTable
ALTER TABLE "DashboardPreference" DROP COLUMN "hidden",
DROP COLUMN "order",
DROP COLUMN "view";

-- AlterTable
ALTER TABLE "WorkspaceDashboardPreference" DROP COLUMN "hidden",
DROP COLUMN "order";

-- CreateTable
CREATE TABLE "DashboardLayout" (
    "key" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    "widgets" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "DashboardLayout_workspaceId_idx" ON "DashboardLayout"("workspaceId");

-- CreateIndex
CREATE INDEX "DashboardLayout_projectId_idx" ON "DashboardLayout"("projectId");

-- CreateIndex
CREATE INDEX "DashboardLayout_userId_idx" ON "DashboardLayout"("userId");

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


