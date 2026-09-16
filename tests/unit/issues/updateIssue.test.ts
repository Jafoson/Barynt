import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PMDoc } from "@/lib/richtext/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const STATUSES: Record<string, { name: string; color: string }> = {
  todo: { name: "Offen", color: "#8a9099" },
  in_progress: { name: "In Arbeit", color: "#4c9aff" },
  done: { name: "Erledigt", color: "#36b37e" },
};
const PRIORITY_NAMES: Record<number, string> = { 2: "Mittel", 4: "Hoch" };
const TYPE_NAMES: Record<string, string> = { task: "Aufgabe", bug: "Fehler" };
const LABELS: Record<string, { name: string; color: string }> = {
  "l-a": { name: "Backend", color: "#6e63e6" },
  "l-b": { name: "Frontend", color: "#e66e9e" },
  "l-c": { name: "Bug", color: "#e6636e" },
};

const mockIssueFindUnique = mock();
const mockIssueUpdate = mock();
const mockUserFindUnique = mock();
const mockAuditCreate = mock();
const mockStatusFindUnique = mock();
const mockPriorityFindUnique = mock();
const mockIssueTypeFindUnique = mock();
const mockLabelFindMany = mock();

mock.module("@/lib/db", () => ({
  db: {
    issue: { findUnique: mockIssueFindUnique, update: mockIssueUpdate },
    user: { findUnique: mockUserFindUnique },
    auditLog: { create: mockAuditCreate },
    status: { findUnique: mockStatusFindUnique },
    priority: { findUnique: mockPriorityFindUnique },
    issueType: { findUnique: mockIssueTypeFindUnique },
    label: { findMany: mockLabelFindMany },
  },
}));

const mockRequirePermissionOr = mock(async () => ACTOR);
const mockRequirePermission = mock(async () => ACTOR);

mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  requirePermissionOr: mockRequirePermissionOr,
  hasPermission: mock(async () => true),
  currentUserId: mock(async () => ACTOR),
  PermissionError: class PermissionError extends Error {},
}));

const mockNotify = mock();
mock.module("@/lib/notify", () => ({ notify: mockNotify }));

mock.module("next/cache", () => ({ revalidatePath: mock() }));

import { moveIssue, updateIssue } from "@/features/issues/actions";

const ACTOR = "u-actor";
const ID = "i1";
const EMPTY_DOC: PMDoc = { type: "doc", content: [] };

/** The state of an issue, as `issueContext` reads it — default values,
 * individually overridden per test. */
function issue(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    key: 1,
    projectId: "p1",
    reporterId: "u-reporter",
    assigneeId: null as string | null,
    status: "todo",
    priority: 2,
    type: "task",
    labels: ["l-a", "l-b"],
    closedAt: null,
    dueDate: null as Date | null,
    storyPoints: null as number | null,
    estimateHours: null as number | null,
    estimateUnit: null as string | null,
    title: "Ursprünglicher Titel",
    description: EMPTY_DOC,
    project: {
      id: "p1",
      workspaceId: "ws1",
      name: "Mobile",
      slug: "mobile",
      prefix: "MOB",
      color: "#3b7bd5",
    },
    ...overrides,
  };
  // `getIssueUnchecked` (called after the update, for the webhook payload)
  // selects `assignee`/`reporter` as relation objects, not the flat
  // `assigneeId`/`reporterId` scalars `issueContext` itself reads — same
  // mocked row serves both, so it carries both shapes, derived from
  // whichever id the test set. `parent`/`subIssues`/`relationsFrom`/
  // `relationsTo` (BARY-1) are also only read there — `mapApiIssue` maps
  // them unconditionally, so a fixture without them would throw.
  return {
    ...base,
    reporter: { id: base.reporterId, firstName: "Rep", lastName: "Orter" },
    assignee: base.assigneeId
      ? { id: base.assigneeId, firstName: "Ass", lastName: "Ignee" }
      : null,
    parent: null,
    subIssues: [],
    relationsFrom: [],
    relationsTo: [],
  };
}

function reset() {
  for (const m of [
    mockIssueFindUnique,
    mockIssueUpdate,
    mockUserFindUnique,
    mockAuditCreate,
    mockRequirePermissionOr,
    mockRequirePermission,
    mockNotify,
    mockStatusFindUnique,
    mockPriorityFindUnique,
    mockIssueTypeFindUnique,
    mockLabelFindMany,
  ]) {
    m.mockReset();
  }
  mockIssueUpdate.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
  mockRequirePermissionOr.mockResolvedValue(ACTOR);
  mockRequirePermission.mockResolvedValue(ACTOR);
  mockIssueFindUnique.mockResolvedValue(issue());

  // Names for the status/priority/type/label rows — the same lookup tables
  // that `updateIssue` actually queries against (`db.status` & co. are a
  // shared, workspace-independent catalog).
  mockStatusFindUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => STATUSES[where.id] ?? null,
  );
  mockPriorityFindUnique.mockImplementation(
    async ({ where }: { where: { id: number } }) => {
      const name = PRIORITY_NAMES[where.id];
      return name ? { name } : null;
    },
  );
  mockIssueTypeFindUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      const name = TYPE_NAMES[where.id];
      return name ? { name } : null;
    },
  );
  mockLabelFindMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({
        id,
        name: LABELS[id]?.name ?? id,
        color: LABELS[id]?.color ?? "#8a9099",
      })),
  );
}

describe("updateIssue() — Audit log", () => {
  beforeEach(reset);

  it("logs an assignment, with color for the avatar", async () => {
    mockUserFindUnique.mockResolvedValue({
      firstName: "Ada",
      lastName: "Lovelace",
      color: "#ada-color",
    });

    await updateIssue(ID, { assignee: "u-ada" });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry).toMatchObject({
      action: "issue.assigned",
      actorId: ACTOR,
      targetType: "issue",
      targetId: ID,
      workspaceId: "ws1",
      projectId: "p1",
      personColor: "#ada-color",
    });
    expect(entry.targetLabel).toBe("MOB-1: Ada Lovelace");
  });

  it("logs a reassignment with the old and new person", async () => {
    mockIssueFindUnique.mockResolvedValue(issue({ assigneeId: "u-mara" }));
    mockUserFindUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === "u-mara"
          ? { firstName: "Mara", lastName: "Velez" }
          : { firstName: "Camila", lastName: "Santos", color: "#camila" },
    );

    await updateIssue(ID, { assignee: "u-camila" });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.targetLabel).toBe("MOB-1: Mara Velez → Camila Santos");
    expect(entry.personColor).toBe("#camila");
  });

  it("logs removal of the assignment", async () => {
    mockIssueFindUnique.mockResolvedValue(issue({ assigneeId: "u-ada" }));

    await updateIssue(ID, { assignee: null });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0][0].data).toMatchObject({
      action: "issue.unassigned",
      targetId: ID,
      targetLabel: "MOB-1",
    });
  });

  it("logs nothing when the same person is assigned again", async () => {
    mockIssueFindUnique.mockResolvedValue(issue({ assigneeId: "u-ada" }));

    await updateIssue(ID, { assignee: "u-ada" });

    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("logs a title change with old and new", async () => {
    await updateIssue(ID, { title: "Neuer Titel" });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.title.changed");
    expect(entry.targetLabel).toBe("MOB-1: Ursprünglicher Titel → Neuer Titel");
  });

  it("logs nothing when the same title is saved again", async () => {
    await updateIssue(ID, { title: "Ursprünglicher Titel" });
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("logs a description change", async () => {
    const changed: PMDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hallo" }] },
      ],
    };

    await updateIssue(ID, { description: changed });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.description.changed");
    expect(entry.targetLabel).toBe("MOB-1");
  });

  it("logs nothing when the same document is saved again", async () => {
    await updateIssue(ID, { description: EMPTY_DOC });
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("logs a status change with names, and raw in meta", async () => {
    await updateIssue(ID, { status: "in_progress" });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.status.changed");
    expect(entry.targetLabel).toBe("MOB-1: Offen → In Arbeit");
    expect(entry.meta).toEqual({
      from: "todo",
      to: "in_progress",
      fromColor: "#8a9099",
      toColor: "#4c9aff",
    });
  });

  it("logs a priority change with names, and raw in meta", async () => {
    await updateIssue(ID, { priority: 4 });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.priority.changed");
    expect(entry.targetLabel).toBe("MOB-1: Mittel → Hoch");
    expect(entry.meta).toEqual({ from: 2, to: 4 });
  });

  it("logs a type change with names", async () => {
    await updateIssue(ID, { type: "bug" });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.type.changed");
    expect(entry.targetLabel).toBe("MOB-1: Aufgabe → Fehler");
  });

  it("logs which labels were added and which are gone", async () => {
    await updateIssue(ID, { labels: ["l-a", "l-c"] });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.labels.changed");
    expect(entry.targetLabel).toBe("MOB-1: + Bug / − Frontend");
    expect(entry.meta).toEqual({
      added: [{ id: "l-c", name: "Bug", color: "#e6636e" }],
      removed: [{ id: "l-b", name: "Frontend", color: "#e66e9e" }],
    });
  });

  it("logs nothing when the same labels arrive just sorted differently", async () => {
    await updateIssue(ID, { labels: ["l-b", "l-a"] });
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("logs a due date change (BARY-4)", async () => {
    const dueDate = Date.parse("2026-09-20T00:00:00.000Z");
    await updateIssue(ID, { dueDate });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.dueDate.changed");
    expect(entry.targetLabel).toBe("MOB-1: — → 2026-09-20");
    expect(entry.meta).toEqual({ from: null, to: dueDate });
  });

  it("logs nothing when the due date is patched to the same day it already has", async () => {
    const dueDate = Date.parse("2026-09-20T00:00:00.000Z");
    mockIssueFindUnique.mockResolvedValue(
      issue({ dueDate: new Date(dueDate) }),
    );

    await updateIssue(ID, { dueDate });
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("logs clearing a due date (BARY-4)", async () => {
    mockIssueFindUnique.mockResolvedValue(
      issue({ dueDate: new Date(Date.parse("2026-09-20T00:00:00.000Z")) }),
    );

    await updateIssue(ID, { dueDate: null });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.dueDate.changed");
    expect(entry.targetLabel).toBe("MOB-1: 2026-09-20 → —");
  });

  it("logs a story points change (BARY-4)", async () => {
    await updateIssue(ID, { storyPoints: 5 });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.storyPoints.changed");
    expect(entry.targetLabel).toBe("MOB-1: — → 5");
    expect(entry.meta).toEqual({ from: null, to: 5 });
  });

  it("logs a time estimate change (BARY-4)", async () => {
    await updateIssue(ID, { estimateHours: 2.5 });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.estimateHours.changed");
    expect(entry.targetLabel).toBe("MOB-1: — → 2.5h");
    expect(entry.meta).toEqual({ from: null, to: 2.5 });
  });

  it("logs a time estimate change in the unit it was actually entered in (BARY-4)", async () => {
    // 16 stored hours = "2 days" — the audit line reads in that unit, not
    // in the raw stored hours.
    await updateIssue(ID, { estimateHours: 16, estimateUnit: "days" });

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.estimateHours.changed");
    expect(entry.targetLabel).toBe("MOB-1: — → 2d");
    expect(entry.meta).toEqual({ from: null, to: 16 });
  });

  it("reads the 'from' side of a time estimate change in its own stored unit (BARY-4)", async () => {
    mockIssueFindUnique.mockResolvedValue(
      issue({ estimateHours: 40, estimateUnit: "weeks" }),
    );

    await updateIssue(ID, { estimateHours: 80, estimateUnit: "weeks" });

    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.targetLabel).toBe("MOB-1: 1w → 2w");
  });

  it("logs several changed aspects as separate rows each", async () => {
    await updateIssue(ID, { title: "Neuer Titel", priority: 4 });

    expect(mockAuditCreate).toHaveBeenCalledTimes(2);
    const actions = mockAuditCreate.mock.calls.map((c) => c[0].data.action);
    expect(actions.sort()).toEqual(
      ["issue.priority.changed", "issue.title.changed"].sort(),
    );
  });
});

describe("moveIssue() — Audit log", () => {
  beforeEach(reset);

  it("logs the status change from drag & drop, with names", async () => {
    await moveIssue(ID, "done");

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("issue.status.changed");
    expect(entry.targetLabel).toBe("MOB-1: Offen → Erledigt");
    expect(entry.meta).toEqual({
      from: "todo",
      to: "done",
      fromColor: "#8a9099",
      toColor: "#36b37e",
    });
  });

  it("logs nothing when the status stays the same", async () => {
    await moveIssue(ID, "todo");
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});
