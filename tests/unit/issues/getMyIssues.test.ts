import { beforeEach, describe, expect, it, mock } from "bun:test";

// "My Issues" shows the same filters as a project's board and list, just
// across all projects. This tests what actually reaches the query — and
// above all, what a slug in the URL must *not* be able to shift.

mock.module("@/lib/db", () => ({
  db: {
    issue: { findMany: mock() },
    priority: { findMany: mock() },
    user: { findMany: mock() },
    label: { findMany: mock() },
    project: { findMany: mock() },
    $queryRaw: mock(),
  },
}));

const mockAccessibleProjectIds = mock(async () => new Set(["p-1", "p-2"]));

mock.module("@/lib/permissions", () => ({
  accessibleProjectIds: mockAccessibleProjectIds,
  visibleProjectIds: mock(async () => new Set(["p-1", "p-2"])),
  currentUserCanEnterWorkspace: mock(async () => true),
  hasPermission: mock(async () => true),
}));

import { getMyIssues } from "@/features/issues/queries";
import { db } from "@/lib/db";

const issueFindMany = db.issue.findMany as ReturnType<typeof mock>;
const priorityFindMany = db.priority.findMany as ReturnType<typeof mock>;
const userFindMany = db.user.findMany as ReturnType<typeof mock>;
const labelFindMany = db.label.findMany as ReturnType<typeof mock>;
const projectFindMany = db.project.findMany as ReturnType<typeof mock>;
const queryRaw = db.$queryRaw as unknown as ReturnType<typeof mock>;

/** The `where` condition of the last `issue.findMany` call. */
function lastWhere(): Record<string, unknown> {
  const call = issueFindMany.mock.calls.at(-1)?.[0] as { where: object };
  return call.where as Record<string, unknown>;
}

describe("getMyIssues()", () => {
  beforeEach(() => {
    for (const m of [
      issueFindMany,
      priorityFindMany,
      userFindMany,
      labelFindMany,
      projectFindMany,
      queryRaw,
    ])
      m.mockReset();
    issueFindMany.mockResolvedValue([]);
    priorityFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([]);
    labelFindMany.mockResolvedValue([]);
    projectFindMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
  });

  it("searches for the user's own issues across all accessible projects", async () => {
    await getMyIssues("u-1", "ws-1");

    expect(lastWhere()).toEqual({
      assigneeId: "u-1",
      projectId: { in: ["p-1", "p-2"] },
    });
    // By rank, same as in the project — otherwise a dragged row would end
    // up somewhere else on the next load.
    expect(issueFindMany.mock.calls.at(-1)?.[0].orderBy).toEqual([
      { rank: "asc" },
      { created: "asc" },
    ]);
  });

  it("takes the status filter from the URL", async () => {
    await getMyIssues("u-1", "ws-1", { status: "todo,in_progress" });

    expect(lastWhere().status).toEqual({ in: ["todo", "in_progress"] });
  });

  it("doesn't let `?assignee=` override who's assigned", async () => {
    userFindMany.mockResolvedValue([{ id: "u-2" }]);

    await getMyIssues("u-1", "ws-1", { assignee: "mara" });

    expect(lastWhere().assigneeId).toBe("u-1");
  });

  it("clips the project filter to the accessible projects", async () => {
    // `p-3` is not accessible — the filter must not be able to pull it in.
    projectFindMany.mockResolvedValue([{ id: "p-2" }, { id: "p-3" }]);

    await getMyIssues("u-1", "ws-1", { project: "app,geheim" });

    expect(lastWhere().projectId).toEqual({ in: ["p-2"] });
  });

  it("doesn't even ask when the project filter matches nothing accessible", async () => {
    projectFindMany.mockResolvedValue([{ id: "p-3" }]);

    expect(await getMyIssues("u-1", "ws-1", { project: "geheim" })).toEqual([]);
    expect(issueFindMany).not.toHaveBeenCalled();
  });

  it("ignores a project slug that doesn't exist", async () => {
    projectFindMany.mockResolvedValue([]);

    await getMyIssues("u-1", "ws-1", { project: "gibtsnicht" });

    // A stale link shows everything instead of nothing — the same rule as
    // for the other filters.
    expect(lastWhere().projectId).toEqual({ in: ["p-1", "p-2"] });
  });

  it("searches by full text (title, description, comments) and by number", async () => {
    // `searchIssueIds`'s raw query — id + rank per match.
    queryRaw.mockResolvedValue([{ id: "i-1", rank: 0.5 }]);

    await getMyIssues("u-1", "ws-1", { q: "FUX-12" });

    expect(lastWhere().OR).toEqual([{ id: { in: ["i-1"] } }, { key: 12 }]);
  });

  it("doesn't add a key match for a query that isn't a number or `PREFIX-number`", async () => {
    queryRaw.mockResolvedValue([{ id: "i-1", rank: 0.5 }]);

    await getMyIssues("u-1", "ws-1", { q: "onboarding" });

    expect(lastWhere().OR).toEqual([{ id: { in: ["i-1"] } }]);
  });
});
