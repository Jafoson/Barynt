-- CreateEnum
CREATE TYPE "ViewVisibility" AS ENUM ('PRIVATE', 'PROJECT', 'WORKSPACE');

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "ownerId" TEXT,
    "visibility" "ViewVisibility" NOT NULL DEFAULT 'PRIVATE',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "layout" TEXT NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{"op":"and","rules":[]}',
    "groupBy" TEXT,
    "subGroupBy" TEXT,
    "sortBy" TEXT NOT NULL DEFAULT 'manual',
    "sortDir" TEXT NOT NULL DEFAULT 'asc',
    "display" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedViewUserState" (
    "userId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "favoritePosition" DOUBLE PRECISION,
    "collapsedGroups" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "SavedViewUserState_pkey" PRIMARY KEY ("userId","viewId")
);

-- CreateIndex
CREATE INDEX "SavedView_projectId_idx" ON "SavedView"("projectId");

-- CreateIndex
CREATE INDEX "SavedView_ownerId_idx" ON "SavedView"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_workspaceId_slug_key" ON "SavedView"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "SavedViewUserState_viewId_idx" ON "SavedViewUserState"("viewId");

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedViewUserState" ADD CONSTRAINT "SavedViewUserState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedViewUserState" ADD CONSTRAINT "SavedViewUserState_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "SavedView"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A shared view lives at exactly one level: PROJECT views belong to a
-- project, WORKSPACE views to none (BARY-163). Prisma doesn't model CHECK
-- constraints; `features/views/access.ts` enforces the same rule in code.
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_visibility_scope_check" CHECK (
  ("visibility" <> 'PROJECT' OR "projectId" IS NOT NULL)
  AND ("visibility" <> 'WORKSPACE' OR "projectId" IS NULL)
);
