-- AlterTable
ALTER TABLE "Plugin" ADD COLUMN     "codeApprovalHash" TEXT,
ADD COLUMN     "codeApprovedAt" TIMESTAMP(3);
