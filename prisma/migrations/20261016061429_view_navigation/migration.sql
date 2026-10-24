-- AlterTable
ALTER TABLE "SavedViewUserState" ADD COLUMN     "startView" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "startViewId" TEXT;

-- CreateTable
CREATE TABLE "ProjectUserState" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "favoritePosition" DOUBLE PRECISION,

    CONSTRAINT "ProjectUserState_pkey" PRIMARY KEY ("userId","projectId")
);

-- CreateIndex
CREATE INDEX "ProjectUserState_projectId_idx" ON "ProjectUserState"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectUserState" ADD CONSTRAINT "ProjectUserState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUserState" ADD CONSTRAINT "ProjectUserState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
