-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "pluginStoreCuratedOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pluginStoreInProjects" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pluginStoreInWorkspaces" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PluginStoreCurated" (
    "storeId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginStoreCurated_pkey" PRIMARY KEY ("storeId","pluginId")
);

-- AddForeignKey
ALTER TABLE "PluginStoreCurated" ADD CONSTRAINT "PluginStoreCurated_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "PluginStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
