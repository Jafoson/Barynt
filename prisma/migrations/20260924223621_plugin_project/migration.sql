-- CreateTable
CREATE TABLE "PluginProject" (
    "pluginId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginProject_pkey" PRIMARY KEY ("pluginId","projectId")
);

-- CreateIndex
CREATE INDEX "PluginProject_projectId_idx" ON "PluginProject"("projectId");

-- AddForeignKey
ALTER TABLE "PluginProject" ADD CONSTRAINT "PluginProject_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginProject" ADD CONSTRAINT "PluginProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
