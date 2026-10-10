-- AlterTable
ALTER TABLE "CustomField" ADD COLUMN     "linkFavicon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "linkHosts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "linkHttpsOnly" BOOLEAN NOT NULL DEFAULT false;
