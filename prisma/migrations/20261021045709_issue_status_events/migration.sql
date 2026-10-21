-- BARY-171: every status change of an issue, from its creation on — the
-- basis of the flow metrics (cumulative flow, cycle time, burndown).

-- CreateTable
CREATE TABLE "IssueStatusEvent" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "fromCategory" "StatusCategory",
    "toCategory" "StatusCategory" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueStatusEvent_issueId_at_idx" ON "IssueStatusEvent"("issueId", "at");

-- CreateIndex
CREATE INDEX "IssueStatusEvent_at_idx" ON "IssueStatusEvent"("at");

-- AddForeignKey
ALTER TABLE "IssueStatusEvent" ADD CONSTRAINT "IssueStatusEvent_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: the changes the audit log already holds
-- (`issue.status.changed`, meta `{ from, to }`). Changes to a status that no
-- longer exists drop out — there's no category to file them under.
INSERT INTO "IssueStatusEvent" ("id", "issueId", "fromStatus", "toStatus", "fromCategory", "toCategory", "at")
SELECT 'se_' || a."id",
       i."id",
       a."meta" ->> 'from',
       a."meta" ->> 'to',
       fs."category",
       ts."category",
       a."createdAt"
FROM "AuditLog" a
JOIN "Issue" i ON i."id" = a."targetId"
JOIN "Status" ts ON ts."id" = a."meta" ->> 'to'
LEFT JOIN "Status" fs ON fs."id" = a."meta" ->> 'from'
WHERE a."action" = 'issue.status.changed';

-- Backfill 2: where each issue started — the "from" of its first logged
-- change, or (never changed) the status it has now — at its creation.
INSERT INTO "IssueStatusEvent" ("id", "issueId", "fromStatus", "toStatus", "fromCategory", "toCategory", "at")
SELECT 'sc_' || i."id",
       i."id",
       NULL,
       s."id",
       NULL,
       s."category",
       i."created"
FROM "Issue" i
CROSS JOIN LATERAL (
    SELECT COALESCE(
        (SELECT a."meta" ->> 'from'
           FROM "AuditLog" a
          WHERE a."action" = 'issue.status.changed'
            AND a."targetId" = i."id"
          ORDER BY a."createdAt"
          LIMIT 1),
        i."status"
    ) AS "status"
) first
JOIN "Status" s ON s."id" = first."status";
