-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('APP', 'API', 'MCP');

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "source" "ContentSource" NOT NULL DEFAULT 'APP';

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "source" "ContentSource" NOT NULL DEFAULT 'APP';
