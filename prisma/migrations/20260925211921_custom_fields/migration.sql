-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "pluginId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "issueId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "text" TEXT,
    "number" DOUBLE PRECISION,
    "date" TIMESTAMP(3),
    "userId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("issueId","fieldId")
);

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_workspaceId_idx" ON "CustomFieldDefinition"("workspaceId");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_projectId_idx" ON "CustomFieldDefinition"("projectId");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_pluginId_idx" ON "CustomFieldDefinition"("pluginId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_workspaceId_key_key" ON "CustomFieldDefinition"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "CustomFieldValue_fieldId_text_idx" ON "CustomFieldValue"("fieldId", "text");

-- CreateIndex
CREATE INDEX "CustomFieldValue_fieldId_number_idx" ON "CustomFieldValue"("fieldId", "number");

-- CreateIndex
CREATE INDEX "CustomFieldValue_fieldId_date_idx" ON "CustomFieldValue"("fieldId", "date");

-- CreateIndex
CREATE INDEX "CustomFieldValue_fieldId_userId_idx" ON "CustomFieldValue"("fieldId", "userId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_userId_idx" ON "CustomFieldValue"("userId");

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A value is exactly one thing, in the column of its field's type (lib/custom-fields/types.ts,
-- VALUE_COLUMN). No value is no row, so a row with nothing in it, or with two columns set, is a
-- bug that the database refuses instead of leaving for a filter to trip over. Prisma cannot model a
-- check constraint, which is why it is written here.
ALTER TABLE "CustomFieldValue"
  ADD CONSTRAINT "CustomFieldValue_one_value_check"
  CHECK (num_nonnulls("text", "number", "date", "userId") = 1);
