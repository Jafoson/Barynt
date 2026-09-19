-- `searchVector` on Comment/Issue is a generated column — Prisma's diff
-- engine doesn't know that and wants to drop its "default", which Postgres
-- rejects. Removed here, same drift as earlier migrations; see
-- 20260916211028_add_project_hidden_detail_fields for precedent.

-- CreateTable
CREATE TABLE "IssueViewPreference" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "hiddenFields" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "IssueViewPreference_pkey" PRIMARY KEY ("userId","projectId","view")
);

-- CreateTable
CREATE TABLE "MyIssuesViewPreference" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "hiddenFields" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "MyIssuesViewPreference_pkey" PRIMARY KEY ("userId","workspaceId","view")
);

-- CreateIndex
CREATE INDEX "IssueViewPreference_projectId_idx" ON "IssueViewPreference"("projectId");

-- CreateIndex
CREATE INDEX "MyIssuesViewPreference_workspaceId_idx" ON "MyIssuesViewPreference"("workspaceId");

-- AddForeignKey
ALTER TABLE "IssueViewPreference" ADD CONSTRAINT "IssueViewPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueViewPreference" ADD CONSTRAINT "IssueViewPreference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyIssuesViewPreference" ADD CONSTRAINT "MyIssuesViewPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyIssuesViewPreference" ADD CONSTRAINT "MyIssuesViewPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
