import { beforeEach, describe, expect, it, mock } from "bun:test";

// Who is asking and what they hold — set per test. `can(user, perm, ctx)`
// answers from `granted`, regardless of the context: these tests are about
// the view rules, the resolver has its own tests.
let me: string | null = "me";
let granted = new Set<string>(["project.view"]);
let entersWorkspace = true;

mock.module("@/lib/permissions", () => ({
  currentUserId: mock(async () => me),
  can: mock(async (_u: string, permission: string) => granted.has(permission)),
  canEnterWorkspace: mock(async () => entersWorkspace),
}));

const recordAudit = mock(async (_input: unknown) => {});
mock.module("@/lib/audit", () => ({ recordAudit }));
mock.module("next/cache", () => ({ revalidatePath: mock() }));

// The slug lookup behind the board's own URL filters — its own tests cover
// it; here it only has to answer, and record what it was asked.
const resolveUrlFilter = mock(
  async (params: Record<string, string>, _scope: { projectId: string }) => ({
    op: "and" as const,
    rules: params.status
      ? [
          {
            field: "status" as const,
            is: "any" as const,
            value: [params.status],
          },
        ]
      : [],
  }),
);
mock.module("@/features/issues/queries", () => ({ resolveUrlFilter }));

type Row = Record<string, unknown> & { id: string; slug: string };
let rows: Row[] = [];

const viewRow = (over: Partial<Row> = {}): Row => ({
  id: "v1",
  workspaceId: "ws1",
  projectId: "p1",
  ownerId: "me",
  visibility: "PRIVATE",
  name: "Bugs",
  slug: "bugs",
  icon: null,
  color: null,
  position: 1,
  layout: "board",
  filter: { op: "and", rules: [] },
  groupBy: null,
  subGroupBy: null,
  sortBy: "manual",
  sortDir: "asc",
  display: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  userStates: [],
  ...over,
});

const db = {
  project: {
    findUnique: mock(async () => ({ workspaceId: "ws1" })),
  },
  savedView: {
    findUnique: mock(
      async ({
        where,
      }: {
        where: { id?: string; workspaceId_slug?: { slug: string } };
      }) =>
        rows.find((r) =>
          where.id
            ? r.id === where.id
            : r.slug === where.workspaceId_slug?.slug,
        ) ?? null,
    ),
    findMany: mock(async ({ where }: { where: { id: { in: string[] } } }) =>
      rows.filter((r) => where.id.in.includes(r.id)),
    ),
    aggregate: mock(async () => ({ _max: { position: 2 } })),
    create: mock(async ({ data }: { data: Row }) => ({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      userStates: [],
    })),
    update: mock(
      async ({ where, data }: { where: { id: string }; data: object }) => ({
        ...rows.find((r) => r.id === where.id),
        ...data,
      }),
    ),
    delete: mock(async () => ({})),
  },
  savedViewUserState: { upsert: mock(async (_args: unknown) => ({})) },
  $transaction: mock(async (ops: unknown[]) => ops),
};
mock.module("@/lib/db", () => ({ db }));

import {
  createView,
  createViewFromParams,
  deleteView,
  duplicateView,
  reorderViews,
  saveViewState,
  setViewUserState,
  updateView,
} from "@/features/views/actions";

beforeEach(() => {
  me = "me";
  granted = new Set(["project.view"]);
  entersWorkspace = true;
  rows = [];
  recordAudit.mockClear();
  for (const fn of [
    ...Object.values(db.savedView),
    db.project.findUnique,
    db.savedViewUserState.upsert,
    db.$transaction,
  ])
    (fn as ReturnType<typeof mock>).mockClear();
});

const created = () =>
  (db.savedView.create.mock.calls.at(-1)?.[0] as { data: Row }).data;

describe("createView", () => {
  const input = {
    workspaceId: "ws1",
    projectId: "p1",
    name: "Meine Bugs",
    layout: "board" as const,
  };

  it("creates a private view for anyone who sees the project", async () => {
    const result = await createView(input);
    expect(result.ok).toBe(true);
    expect(created()).toMatchObject({
      ownerId: "me",
      visibility: "PRIVATE",
      slug: "meine-bugs",
      position: 3,
      filter: { op: "and", rules: [] },
    });
  });

  it("takes the workspace from the project, not from the call", async () => {
    await createView({ ...input, workspaceId: "someone-elses" });
    expect(created().workspaceId).toBe("ws1");
  });

  it("finds a free slug", async () => {
    rows = [viewRow({ id: "x", slug: "meine-bugs" })];
    await createView(input);
    expect(created().slug).toBe("meine-bugs-2");
  });

  it("needs view.share for a shared view", async () => {
    expect(await createView({ ...input, visibility: "PROJECT" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    granted.add("view.share");
    expect((await createView({ ...input, visibility: "PROJECT" })).ok).toBe(
      true,
    );
  });

  it("refuses a workspace-wide visibility on a project view", async () => {
    granted.add("view.share");
    expect(await createView({ ...input, visibility: "WORKSPACE" })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("answers notFound without access to the project", async () => {
    granted = new Set();
    expect(await createView(input)).toEqual({ ok: false, error: "notFound" });
    expect(db.savedView.create).not.toHaveBeenCalled();
  });

  it("checks cross-project views against workspace entry", async () => {
    entersWorkspace = false;
    expect(await createView({ ...input, projectId: null })).toEqual({
      ok: false,
      error: "notFound",
    });
  });

  it("refuses an invalid filter or no session", async () => {
    expect(
      await createView({
        ...input,
        filter: { op: "and", rules: [{ field: "nope", is: "any" }] },
      } as never),
    ).toEqual({ ok: false, error: "invalid" });
    me = null;
    expect(await createView(input)).toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });
});

describe("updateView", () => {
  it("hides someone else's private view as notFound", async () => {
    rows = [viewRow({ ownerId: "other" })];
    granted.add("view.manage");
    expect(await updateView("v1", { name: "x" })).toEqual({
      ok: false,
      error: "notFound",
    });
  });

  it("refuses a shared view without view.manage", async () => {
    rows = [viewRow({ ownerId: "other", visibility: "PROJECT" })];
    granted.add("view.share");
    expect(await updateView("v1", { name: "x" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    granted.add("view.manage");
    expect((await updateView("v1", { name: "x" })).ok).toBe(true);
  });

  it("only writes the fields that were passed", async () => {
    rows = [viewRow()];
    await updateView("v1", { groupBy: "assignee" });
    expect(
      (db.savedView.update.mock.calls.at(-1)?.[0] as { data: object }).data,
    ).toEqual({ groupBy: "assignee" });
  });

  it("doesn't let a manager make someone else's shared view private", async () => {
    rows = [viewRow({ ownerId: "other", visibility: "PROJECT" })];
    granted.add("view.manage");
    expect(await updateView("v1", { visibility: "PRIVATE" })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("duplicateView", () => {
  it("makes a private copy for the caller, even of a shared view", async () => {
    rows = [viewRow({ ownerId: "other", visibility: "PROJECT" })];
    const result = await duplicateView("v1", "Bugs (Kopie)");
    expect(result.ok).toBe(true);
    expect(created()).toMatchObject({
      ownerId: "me",
      visibility: "PRIVATE",
      name: "Bugs (Kopie)",
      slug: "bugs-kopie",
      layout: "board",
    });
  });
});

describe("deleteView", () => {
  it("logs deleting a shared view", async () => {
    rows = [viewRow({ visibility: "PROJECT" })];
    granted.add("view.share");
    expect((await deleteView("v1")).ok).toBe(true);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0]?.[0]).toMatchObject({
      action: "view.deleted",
      target: { type: "view", id: "v1", label: "Bugs" },
      projectId: "p1",
    });
  });

  it("deletes a private view without a log entry", async () => {
    rows = [viewRow()];
    expect((await deleteView("v1")).ok).toBe(true);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("reorderViews", () => {
  it("moves only the views the caller may edit", async () => {
    rows = [
      viewRow({ id: "a" }),
      viewRow({ id: "b", ownerId: "other", visibility: "PROJECT" }),
      viewRow({ id: "c" }),
    ];
    await reorderViews("ws1", "p1", ["c", "b", "a"]);
    const ops = db.$transaction.mock.calls.at(-1)?.[0] as unknown[];
    expect(ops).toHaveLength(2);
    expect(
      db.savedView.update.mock.calls.map(
        (c) => (c[0] as { where: { id: string } }).where.id,
      ),
    ).toEqual(["c", "a"]);
  });

  it("refuses duplicate ids", async () => {
    expect(await reorderViews("ws1", "p1", ["a", "a"])).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("setViewUserState", () => {
  it("stores the caller's own state on any view they see", async () => {
    rows = [viewRow({ ownerId: "other", visibility: "PROJECT" })];
    expect(
      (await setViewUserState("v1", { pinned: true, collapsedGroups: ["x"] }))
        .ok,
    ).toBe(true);
    expect(db.savedViewUserState.upsert.mock.calls.at(-1)?.[0]).toMatchObject({
      where: { userId_viewId: { userId: "me", viewId: "v1" } },
      update: { pinned: true, collapsedGroups: ["x"] },
    });
  });

  it("answers notFound for someone else's private view", async () => {
    rows = [viewRow({ ownerId: "other" })];
    expect(await setViewUserState("v1", { pinned: true })).toEqual({
      ok: false,
      error: "notFound",
    });
  });
});

describe("saveViewState", () => {
  it("stores what the address shows, without the search", async () => {
    rows = [viewRow()];
    const result = await saveViewState("v1", {
      status: "todo",
      group: "assignee",
      sort: "dueDate",
      layout: "list",
      q: "login",
    });
    expect(result.ok).toBe(true);
    expect(resolveUrlFilter.mock.calls.at(-1)?.[0]).toEqual({
      status: "todo",
      group: "assignee",
      sort: "dueDate",
      layout: "list",
    });
    expect(
      (db.savedView.update.mock.calls.at(-1)?.[0] as { data: object }).data,
    ).toEqual({
      filter: {
        op: "and",
        rules: [{ field: "status", is: "any", value: ["todo"] }],
      },
      groupBy: "assignee",
      sortBy: "dueDate",
      layout: "list",
    });
  });

  it("falls back for unknown grouping, order and layout", async () => {
    rows = [viewRow()];
    await saveViewState("v1", { group: "mood", sort: "x", layout: "gantt" });
    expect(
      (db.savedView.update.mock.calls.at(-1)?.[0] as { data: object }).data,
    ).toMatchObject({ groupBy: null, sortBy: "manual", layout: "board" });
  });

  it("can't save someone else's shared view", async () => {
    rows = [viewRow({ ownerId: "other", visibility: "PROJECT" })];
    granted.add("view.share");
    expect(await saveViewState("v1", { layout: "board" })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("createViewFromParams", () => {
  it("creates a view from the dialog plus the address", async () => {
    const result = await createViewFromParams(
      {
        workspaceId: "ws1",
        projectId: "p1",
        name: "Offen",
        layout: "list",
        visibility: "PRIVATE",
        color: "#4363d8",
        icon: "lucide:bug",
      },
      { status: "todo", sort: "priority", layout: "list" },
    );
    expect(result.ok).toBe(true);
    expect(created()).toMatchObject({
      name: "Offen",
      layout: "list",
      sortBy: "priority",
      color: "#4363d8",
      icon: "lucide:bug",
      filter: {
        op: "and",
        rules: [{ field: "status", is: "any", value: ["todo"] }],
      },
    });
  });
});
