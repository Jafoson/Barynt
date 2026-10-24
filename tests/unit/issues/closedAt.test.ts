import { beforeEach, describe, expect, it, mock } from "bun:test";

const STATUS_CATEGORY: Record<string, string> = {
  backlog: "backlog",
  todo: "unstarted",
  in_progress: "started",
  in_review: "started",
  done: "completed",
  canceled: "canceled",
};

mock.module("@/lib/db", () => ({
  db: {
    issue: { findUnique: mock(), update: mock(), create: mock() },
    project: { update: mock() },
    user: { findUnique: mock() },
    auditLog: { create: mock(async () => ({})) },
    // Whether the target status closes the issue comes from its category
    // (BARY-161, `lib/statuses.ts`), not from its id. Written out here instead
    // of importing `DEFAULT_STATUSES`: `@/lib/workspace-defaults` is mocked
    // by another file that may share this process. The audit trail reads
    // `name` from the same row and falls back to the raw id.
    status: {
      findUnique: mock(async ({ where }: { where: { id: string } }) => {
        const category = STATUS_CATEGORY[where.id];
        return category ? { name: where.id, category } : null;
      }),
      // The flow metrics' record of every change (BARY-171).
      findMany: mock(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.flatMap((id) =>
          STATUS_CATEGORY[id] ? [{ id, category: STATUS_CATEGORY[id] }] : [],
        ),
      ),
    },
    issueStatusEvent: { create: mock(async () => ({})) },
    // Not the subject of this file — `moveIssue`/`updateIssue` look up names
    // for these when priority/type/labels change (audit trail,
    // `recordIssueAudit` & co.). `null` is a valid result (unknown id), in
    // which case the row falls back to the raw id.
    priority: { findUnique: mock(async () => null) },
    issueType: { findUnique: mock(async () => null) },
    label: { findMany: mock(async () => []) },
  },
}));

mock.module("@/lib/permissions", () => ({
  requirePermission: mock(async () => "u1"),
  requirePermissionOr: mock(async () => "u1"),
  hasPermission: mock(async () => true),
  PermissionError: class PermissionError extends Error {},
}));

mock.module("next/cache", () => ({ revalidatePath: mock() }));

import { moveIssue, updateIssue } from "@/features/issues/actions";
import { db } from "@/lib/db";

const mockFindUnique = db.issue.findUnique as ReturnType<typeof mock>;
const mockUpdate = db.issue.update as ReturnType<typeof mock>;

/** What was passed to `db.issue.update`. */
function written() {
  return mockUpdate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
}

/** The state of an issue, as `issueContext` reads it — plus the
 *  relation-shaped fields `getIssueUnchecked` needs for the webhook payload
 *  it builds after every update (`key`/`project.prefix`/`reporter`/
 *  `assignee`, and `parent`/`subIssues`/`relationsFrom`/`relationsTo` for
 *  BARY-1), read from the same mocked row via a different `select`. */
function issue(status: string, closedAt: Date | null) {
  return {
    key: 1,
    projectId: "p1",
    reporterId: "u1",
    reporter: { id: "u1", firstName: "Rep", lastName: "Orter" },
    assigneeId: null,
    assignee: null,
    status,
    priority: 2,
    type: "task",
    labels: [] as string[],
    closedAt,
    title: "Titel",
    description: null,
    project: {
      id: "p1",
      workspaceId: "ws1",
      name: "Mobile",
      slug: "mobile",
      prefix: "MOB",
      color: "#3b7bd5",
    },
    parent: null,
    subIssues: [],
    relationsFrom: [],
    relationsTo: [],
  };
}

const EARLIER = new Date("2026-01-05T10:00:00Z");

// `Issue.closedAt` is the basis for throughput and cycle time in the
// project dashboard. Unlike `updated`, this column must not drift along
// with every later change — and that's exactly the kind of bug nobody
// notices: the chart keeps showing bars, just on the wrong days.

describe("Closing", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it("sets the date when an open issue is completed", async () => {
    mockFindUnique.mockResolvedValue(issue("in_progress", null));
    await moveIssue("i1", "done");

    expect(written().status).toBe("done");
    expect(written().closedAt).toBeInstanceOf(Date);
  });

  it("records the change for the flow metrics", async () => {
    const created = db.issueStatusEvent.create as ReturnType<typeof mock>;
    created.mockClear();
    mockFindUnique.mockResolvedValue(issue("in_progress", null));
    await moveIssue("i1", "done");

    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0][0].data).toMatchObject({
      issueId: "i1",
      fromStatus: "in_progress",
      toStatus: "done",
      fromCategory: "started",
      toCategory: "completed",
    });
  });

  it("counts discarding as a close too", async () => {
    mockFindUnique.mockResolvedValue(issue("todo", null));
    await moveIssue("i1", "canceled");

    expect(written().closedAt).toBeInstanceOf(Date);
  });

  it("removes the date again when the issue is reopened", async () => {
    // Without this case, the dashboard would count it toward the throughput
    // of the day it was once finished, forever.
    mockFindUnique.mockResolvedValue(issue("done", EARLIER));
    await moveIssue("i1", "in_progress");

    expect(written().closedAt).toBeNull();
  });

  it("leaves the original date in place when Done becomes Canceled", async () => {
    // It was closed back then; only how it's labeled has changed.
    mockFindUnique.mockResolvedValue(issue("done", EARLIER));
    await moveIssue("i1", "canceled");

    expect(written()).not.toHaveProperty("closedAt");
  });

  it("leaves the date untouched when the status stays the same", async () => {
    mockFindUnique.mockResolvedValue(issue("done", EARLIER));
    await updateIssue("i1", { title: "Neuer Titel" });

    expect(written()).not.toHaveProperty("closedAt");
    expect(written().title).toBe("Neuer Titel");
  });

  it("leaves it untouched for a switch between two open statuses too", async () => {
    mockFindUnique.mockResolvedValue(issue("todo", null));
    await moveIssue("i1", "in_progress");

    expect(written()).not.toHaveProperty("closedAt");
  });
});
