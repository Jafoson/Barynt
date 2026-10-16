-- CreateTable
CREATE TABLE "CustomWidget" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widget" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomWidget_workspaceId_userId_idx" ON "CustomWidget"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "CustomWidget_workspaceId_shared_idx" ON "CustomWidget"("workspaceId", "shared");

-- AddForeignKey
ALTER TABLE "CustomWidget" ADD CONSTRAINT "CustomWidget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomWidget" ADD CONSTRAINT "CustomWidget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


