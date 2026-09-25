import { beforeEach, describe, expect, it, mock } from "bun:test";

// What the screens read of the definitions. What matters: a workspace's page is for whoever may
// manage the fields and a project's page for whoever may see the project (saying whether they may
// manage), what is read is the workspace's or the project's own and never another's, archived
// fields are on the management page and nowhere else, and a row the code cannot read (a type it
// does not know) is left out instead of breaking the page.

const mockProjectFind = mock();
const mockDefFindMany = mock();
const mockDefCount = mock();
const mockValueGroupBy = mock();
const mockAccessFor = mock();
const mockUserId = mock(async (): Promise<string | null> => "u1");

mock.module("@/lib/db", () => ({
  db: {
    project: { findUnique: mockProjectFind },
    customFieldDefinition: { findMany: mockDefFindMany, count: mockDefCount },
    customFieldValue: { groupBy: mockValueGroupBy },
  },
}));
mock.module("@/lib/permissions", () => ({
  accessFor: mockAccessFor,
  currentUserId: mockUserId,
}));

import {
  getCustomFieldsView,
  getFieldsOfProject,
  rowOf,
} from "@/features/custom-fields/queries";
import { MAX_CUSTOM_FIELDS_PER_WORKSPACE } from "@/lib/custom-fields/types";

const WS = "ws-7";
const PROJECT = "p-3";

function dbRow(more: Record<string, unknown> = {}) {
  return {
    id: "cf-1",
    key: "customer",
    name: "Customer",
    description: "Who pays",
    type: "text",
    config: { maxLength: 60 },
    position: 0,
    archivedAt: null,
    pluginId: null,
    workspaceId: WS,
    projectId: null,
    ...more,
  };
}

/** What the person holds, by context: `held(ctx)` is the permissions they have there. */
let held: (ctx: Record<string, string>) => string[] = () => [];
const holds =
  (...keys: string[]) =>
  (ctx: Record<string, string>) => {
    void ctx;
    return keys;
  };

beforeEach(() => {
  for (const m of [
    mockProjectFind,
    mockDefFindMany,
    mockDefCount,
    mockValueGroupBy,
    mockAccessFor,
  ]) {
    m.mockReset();
  }
  mockUserId.mockResolvedValue("u1");
  held = () => [];
  mockAccessFor.mockImplementation(
    async (_user: unknown, ctx: Record<string, string>) => ({
      has: (permission: string) => held(ctx).includes(permission),
    }),
  );
  mockProjectFind.mockResolvedValue({ workspaceId: WS });
  mockDefFindMany.mockResolvedValue([]);
  mockDefCount.mockResolvedValue(0);
  mockValueGroupBy.mockResolvedValue([]);
});

describe("a field as the screens read it", () => {
  it("has what the database has, in its normal form, and says whether it is archived", () => {
    expect(rowOf(dbRow())).toEqual({
      id: "cf-1",
      key: "customer",
      name: "Customer",
      description: "Who pays",
      type: "text",
      config: { maxLength: 60 },
      position: 0,
      archived: false,
      pluginId: null,
      workspaceId: WS,
      projectId: null,
    });
    expect(rowOf(dbRow({ archivedAt: new Date() }))?.archived).toBe(true);
  });

  it("keeps a plugin and a project when it has them", () => {
    expect(rowOf(dbRow({ pluginId: "crm", projectId: PROJECT }))).toMatchObject(
      { pluginId: "crm", projectId: PROJECT },
    );
  });

  it("is nothing for a type this code does not know", () => {
    expect(rowOf(dbRow({ type: "boolean" }))).toBeNull();
    expect(rowOf(dbRow({ type: "" }))).toBeNull();
    expect(rowOf(dbRow({ type: "toString" }))).toBeNull();
  });

  it("falls back to what its type starts from where the stored config no longer fits", () => {
    expect(rowOf(dbRow({ config: { maxLength: 0 } }))?.config).toEqual({
      maxLength: 200,
    });
    expect(rowOf(dbRow({ type: "select", config: "junk" }))?.config).toEqual({
      options: [],
    });
    expect(rowOf(dbRow({ type: "url", config: { old: 1 } }))?.config).toEqual(
      {},
    );
  });
});

describe("the management page of a workspace's fields", () => {
  const manager = holds("customfield.manage");

  it("is for whoever may manage custom fields in the workspace, and nobody else", async () => {
    held = () => [];
    expect(await getCustomFieldsView({ workspaceId: WS })).toBeNull();
    held = holds("project.view", "label.create");
    expect(await getCustomFieldsView({ workspaceId: WS })).toBeNull();
    expect(mockDefFindMany).not.toHaveBeenCalled();
    held = manager;
    expect(await getCustomFieldsView({ workspaceId: WS })).not.toBeNull();
  });

  it("asks in the workspace, for this person", async () => {
    held = manager;
    await getCustomFieldsView({ workspaceId: WS });
    expect(mockAccessFor.mock.calls).toEqual([["u1", { workspaceId: WS }]]);
  });

  it("reads the workspace's own fields, archived ones too, in their order", async () => {
    held = manager;
    mockDefFindMany.mockResolvedValue([
      dbRow(),
      dbRow({ id: "cf-2", key: "env", name: "Env", archivedAt: new Date() }),
    ]);
    const view = await getCustomFieldsView({ workspaceId: WS });
    expect(view?.fields.map((f) => [f.id, f.archived])).toEqual([
      ["cf-1", false],
      ["cf-2", true],
    ]);
    expect(mockDefFindMany.mock.calls[0][0].where).toEqual({
      workspaceId: WS,
      projectId: null,
    });
    expect(mockDefFindMany.mock.calls[0][0].orderBy).toEqual([
      { position: "asc" },
      { createdAt: "asc" },
    ]);
  });

  it("is a workspace's page, that may manage, with nothing inherited", async () => {
    held = manager;
    const view = await getCustomFieldsView({ workspaceId: WS });
    expect(view).toMatchObject({
      level: "workspace",
      workspaceId: WS,
      projectId: null,
      canManage: true,
      inherited: [],
    });
    expect(mockDefFindMany).toHaveBeenCalledTimes(1);
  });

  it("counts the answers of each field, and none for a field that has none", async () => {
    held = manager;
    mockDefFindMany.mockResolvedValue([
      dbRow(),
      dbRow({ id: "cf-2", key: "env" }),
    ]);
    mockValueGroupBy.mockResolvedValue([
      { fieldId: "cf-2", _count: { _all: 9 } },
    ]);
    const view = await getCustomFieldsView({ workspaceId: WS });
    expect(view?.fields.map((f) => f.valueCount)).toEqual([0, 9]);
    expect(mockValueGroupBy.mock.calls[0][0].where).toEqual({
      fieldId: { in: ["cf-1", "cf-2"] },
    });
  });

  it("does not count when there is nothing to count for", async () => {
    held = manager;
    await getCustomFieldsView({ workspaceId: WS });
    expect(mockValueGroupBy).not.toHaveBeenCalled();
  });

  it("says how many more fields the workspace may have, all of its fields counted", async () => {
    held = manager;
    mockDefCount.mockResolvedValue(30);
    const view = await getCustomFieldsView({ workspaceId: WS });
    expect(view?.room).toBe(MAX_CUSTOM_FIELDS_PER_WORKSPACE - 30);
    expect(mockDefCount.mock.calls[0][0]).toEqual({
      where: { workspaceId: WS },
    });
  });

  it("has no negative room", async () => {
    held = manager;
    mockDefCount.mockResolvedValue(MAX_CUSTOM_FIELDS_PER_WORKSPACE + 5);
    expect((await getCustomFieldsView({ workspaceId: WS }))?.room).toBe(0);
  });

  it("leaves out a row it cannot read", async () => {
    held = manager;
    mockDefFindMany.mockResolvedValue([
      dbRow({ type: "boolean" }),
      dbRow({ id: "cf-2" }),
    ]);
    const view = await getCustomFieldsView({ workspaceId: WS });
    expect(view?.fields.map((f) => f.id)).toEqual(["cf-2"]);
  });
});

describe("the management page of a project's fields", () => {
  it("is for whoever may see the project, and only shows to whoever may not manage", async () => {
    held = () => [];
    expect(await getCustomFieldsView({ projectId: PROJECT })).toBeNull();
    held = holds("project.view");
    expect(await getCustomFieldsView({ projectId: PROJECT })).toMatchObject({
      canManage: false,
    });
    held = holds("project.view", "customfield.manage");
    expect(await getCustomFieldsView({ projectId: PROJECT })).toMatchObject({
      canManage: true,
    });
  });

  it("asks in the project, for this person", async () => {
    held = holds("project.view");
    await getCustomFieldsView({ projectId: PROJECT });
    expect(mockAccessFor.mock.calls).toEqual([["u1", { projectId: PROJECT }]]);
  });

  it("does not know a project that is not there, and reads nothing for it", async () => {
    mockProjectFind.mockResolvedValue(null);
    held = holds("project.view", "customfield.manage");
    expect(await getCustomFieldsView({ projectId: "gone" })).toBeNull();
    expect(mockDefFindMany).not.toHaveBeenCalled();
  });

  it("reads the project's own fields, and the workspace's live ones as inherited", async () => {
    held = holds("project.view");
    mockDefFindMany.mockImplementation(async ({ where }) =>
      where.projectId === PROJECT
        ? [dbRow({ id: "own", projectId: PROJECT })]
        : [dbRow({ id: "wide" })],
    );
    const view = await getCustomFieldsView({ projectId: PROJECT });
    expect(view).toMatchObject({
      level: "project",
      workspaceId: WS,
      projectId: PROJECT,
    });
    expect(view?.fields.map((f) => f.id)).toEqual(["own"]);
    expect(view?.inherited.map((f) => f.id)).toEqual(["wide"]);
    const wheres = mockDefFindMany.mock.calls.map((c) => c[0].where);
    expect(wheres).toContainEqual({ workspaceId: WS, projectId: PROJECT });
    expect(wheres).toContainEqual({
      workspaceId: WS,
      projectId: null,
      archivedAt: null,
    });
  });

  it("takes the workspace from the project", async () => {
    held = holds("project.view");
    mockProjectFind.mockResolvedValue({ workspaceId: "the-real-one" });
    const view = await getCustomFieldsView({ projectId: PROJECT });
    expect(view?.workspaceId).toBe("the-real-one");
    expect(mockDefCount.mock.calls[0][0]).toEqual({
      where: { workspaceId: "the-real-one" },
    });
  });

  it("counts the answers of the project's fields", async () => {
    held = holds("project.view");
    mockDefFindMany.mockImplementation(async ({ where }) =>
      where.projectId === PROJECT
        ? [dbRow({ id: "own", projectId: PROJECT })]
        : [],
    );
    mockValueGroupBy.mockResolvedValue([
      { fieldId: "own", _count: { _all: 3 } },
    ]);
    expect(
      (await getCustomFieldsView({ projectId: PROJECT }))?.fields[0].valueCount,
    ).toBe(3);
  });
});

describe("the fields an issue of a project has", () => {
  it("is nothing for someone who may not see the project, or when it is not there", async () => {
    held = () => [];
    expect(await getFieldsOfProject(PROJECT)).toEqual([]);
    mockProjectFind.mockResolvedValue(null);
    held = holds("project.view");
    expect(await getFieldsOfProject(PROJECT)).toEqual([]);
    expect(mockDefFindMany).not.toHaveBeenCalled();
  });

  it("asks in the project, for this person", async () => {
    held = holds("project.view");
    await getFieldsOfProject(PROJECT);
    expect(mockAccessFor.mock.calls).toEqual([["u1", { projectId: PROJECT }]]);
  });

  it("is the workspace-wide fields and the project's own, the archived ones left out, in their order", async () => {
    held = holds("project.view");
    mockDefFindMany.mockResolvedValue([
      dbRow({ id: "a" }),
      dbRow({ id: "b", projectId: PROJECT }),
    ]);
    const fields = await getFieldsOfProject(PROJECT);
    expect(fields.map((f) => f.id)).toEqual(["a", "b"]);
    const query = mockDefFindMany.mock.calls[0][0];
    expect(query.where).toEqual({
      workspaceId: WS,
      archivedAt: null,
      OR: [{ projectId: null }, { projectId: PROJECT }],
    });
    expect(query.orderBy).toEqual([{ position: "asc" }, { createdAt: "asc" }]);
  });

  it("is of the project's workspace only", async () => {
    held = holds("project.view");
    mockProjectFind.mockResolvedValue({ workspaceId: "the-real-one" });
    await getFieldsOfProject(PROJECT);
    expect(mockDefFindMany.mock.calls[0][0].where.workspaceId).toBe(
      "the-real-one",
    );
  });

  it("leaves out a row it cannot read", async () => {
    held = holds("project.view");
    mockDefFindMany.mockResolvedValue([
      dbRow({ type: "boolean" }),
      dbRow({ id: "ok" }),
    ]);
    expect((await getFieldsOfProject(PROJECT)).map((f) => f.id)).toEqual([
      "ok",
    ]);
  });
});
