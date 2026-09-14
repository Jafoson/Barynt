-- CreateEnum
CREATE TYPE "IssueRelationType" AS ENUM ('BLOCKS', 'RELATES_TO', 'DUPLICATES');

-- AlterTable
-- `searchVector` on both tables is a GENERATED ALWAYS ... STORED column
-- (see migration `add_fulltext_search`) — Prisma's schema diff doesn't
-- model generated columns and misreads it as a plain column with a
-- default it needs to drop, which Postgres then rejects ("column ...
-- is a generated column"). Both `ALTER COLUMN "searchVector" DROP
-- DEFAULT` statements `prisma migrate dev` generated here are removed by
-- hand for that reason — nothing in this migration touches `searchVector`.
ALTER TABLE "Issue" ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "IssueRelation" (
    "id" TEXT NOT NULL,
    "type" "IssueRelationType" NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueId" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,

    CONSTRAINT "IssueRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueRelation_relatedId_idx" ON "IssueRelation"("relatedId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueRelation_issueId_relatedId_type_key" ON "IssueRelation"("issueId", "relatedId", "type");

-- CreateIndex
CREATE INDEX "Issue_parentId_idx" ON "Issue"("parentId");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRelation" ADD CONSTRAINT "IssueRelation_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRelation" ADD CONSTRAINT "IssueRelation_relatedId_fkey" FOREIGN KEY ("relatedId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
