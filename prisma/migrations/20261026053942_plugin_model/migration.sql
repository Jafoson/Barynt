-- Plugin-Datenmodell (BARY-140): Quellen, installierte Versionen, Aktivierungen,
-- Einstellungen und Speicher.

-- CreateEnum
CREATE TYPE "PluginStatus" AS ENUM ('active', 'superseded', 'blocked');

-- CreateTable
CREATE TABLE "PluginSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tokenCipher" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plugin" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "status" "PluginStatus" NOT NULL DEFAULT 'active',
    "sourceId" TEXT,
    "installedById" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plugin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginActivation" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "capabilities" TEXT[],
    "activatedById" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginSettings" (
    "activationId" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginSettings_pkey" PRIMARY KEY ("activationId")
);

-- CreateTable
CREATE TABLE "PluginStorage" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "size" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginStorage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PluginSource_url_key" ON "PluginSource"("url");

-- CreateIndex
CREATE INDEX "Plugin_pluginId_status_idx" ON "Plugin"("pluginId", "status");

-- CreateIndex
CREATE INDEX "Plugin_sourceId_idx" ON "Plugin"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Plugin_pluginId_version_key" ON "Plugin"("pluginId", "version");

-- CreateIndex
CREATE INDEX "PluginActivation_workspaceId_idx" ON "PluginActivation"("workspaceId");

-- CreateIndex
CREATE INDEX "PluginActivation_projectId_idx" ON "PluginActivation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginActivation_pluginId_scopeKey_key" ON "PluginActivation"("pluginId", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "PluginStorage_activationId_key_key" ON "PluginStorage"("activationId", "key");

-- AddForeignKey
ALTER TABLE "PluginSource" ADD CONSTRAINT "PluginSource_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plugin" ADD CONSTRAINT "Plugin_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PluginSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plugin" ADD CONSTRAINT "Plugin_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginActivation" ADD CONSTRAINT "PluginActivation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginActivation" ADD CONSTRAINT "PluginActivation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginActivation" ADD CONSTRAINT "PluginActivation_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginSettings" ADD CONSTRAINT "PluginSettings_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "PluginActivation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginStorage" ADD CONSTRAINT "PluginStorage_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "PluginActivation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- scopeKey und die Ebene müssen zusammenpassen; Prisma kennt keine CHECKs.
ALTER TABLE "PluginActivation" ADD CONSTRAINT "PluginActivation_scopeKey_check" CHECK (
  ("projectId" IS NULL AND "scopeKey" = 'ws:' || "workspaceId")
  OR ("projectId" IS NOT NULL AND "scopeKey" = 'pr:' || "projectId")
);
