import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const PROJECTS = [
  { id: "p-1", name: "Web", slug: "web", prefix: "WEB", color: "#111" },
  { id: "p-2", name: "App", slug: "app", prefix: "APP", color: "#222" },
  { id: "p-3", name: "Ops", slug: "ops", prefix: "OPS", color: "#333" },
];

const ME = {
  id: "u-1",
  firstName: "Ada",
  lastName: "L",
  email: "ada@example.com",
  color: "#111",
};

const mockGetMe = mock();

mock.module("@/features/workspaces/queries", () => ({
  getCurrentWorkspace: mock(async () => ({
    id: "acme",
    name: "Acme",
    color: "#111",
  })),
  getMe: mockGetMe,
  getWorkspaceProjects: mock(async () => PROJECTS),
  getWorkspaceMembers: mock(async () => [ME]),
  getWorkspaceLabels: mock(async () => []),
  getWorkspaceStatuses: mock(async () => [
    { id: "backlog", name: "Backlog", short: "B", color: "#111" },
  ]),
  getWorkspacePriorities: mock(async () => []),
  getWorkspaceIssueTypes: mock(async () => [
    { id: "feature", name: "Feature", color: "#111" },
  ]),
  getWorkspaceSearchIssues: mock(async () => []),
}));

const mockFieldFindMany = mock();
mock.module("@/lib/db", () => ({
  db: { customFieldDefinition: { findMany: mockFieldFindMany } },
}));

const mockHasPermission = mock();
mock.module("@/lib/permissions", () => ({
  hasPermission: mockHasPermission,
}));

import { getIssueComposerData } from "@/features/issues/editor-data";

/** Allows `issue.create` only in the given projects. */
function allowIn(...projectIds: string[]) {
  mockHasPermission.mockImplementation(
    async (permission: string, ctx: { projectId?: string }) =>
      permission === "issue.create" &&
      !!ctx.projectId &&
      projectIds.includes(ctx.projectId),
  );
}

describe("getIssueComposerData() — where creation is allowed", () => {
  beforeEach(() => {
    mockGetMe.mockReset();
    mockGetMe.mockResolvedValue(ME);
    mockHasPermission.mockReset();
    mockFieldFindMany.mockReset();
    mockFieldFindMany.mockResolvedValue([]);
  });

  it("names only the projects with issue.create", async () => {
    allowIn("p-1", "p-3");
    const data = await getIssueComposerData();
    expect(data?.creatableProjectIds).toEqual(["p-1", "p-3"]);
  });

  it("returns an empty list when nothing may be created anywhere", async () => {
    allowIn();
    const data = await getIssueComposerData();
    expect(data?.creatableProjectIds).toEqual([]);
  });

  it("asks once per visible project in the project context", async () => {
    allowIn("p-1");
    await getIssueComposerData();
    expect(mockHasPermission.mock.calls).toEqual([
      ["issue.create", { projectId: "p-1" }],
      ["issue.create", { projectId: "p-2" }],
      ["issue.create", { projectId: "p-3" }],
    ]);
  });

  // `projects` also serves as the lookup table for existing issues (prefix,
  // color). Trimming it to hide buttons would leave cards without a project.
  it("doesn't trim the project list itself", async () => {
    allowIn("p-1");
    const data = await getIssueComposerData();
    expect(data?.projects).toHaveLength(3);
  });

  it("returns null without a session — the whole UI depends on it", async () => {
    mockGetMe.mockResolvedValue(null);
    allowIn("p-1");
    expect(await getIssueComposerData()).toBeNull();
  });
});

describe("getIssueComposerData() — the custom fields a new issue can have", () => {
  const fieldRow = (id: string, projectId: string | null) => ({
    id,
    key: id,
    name: id,
    description: "",
    icon: null,
    type: "text",
    config: { maxLength: 20 },
    position: 0,
    archivedAt: null,
    pluginId: null,
    workspaceId: "acme",
    projectId,
  });

  beforeEach(() => {
    mockGetMe.mockReset();
    mockGetMe.mockResolvedValue(ME);
    mockHasPermission.mockReset();
    mockFieldFindMany.mockReset();
    mockFieldFindMany.mockResolvedValue([]);
  });

  it("asks for the workspace's fields and those of the projects where creation is allowed, archived ones left out", async () => {
    allowIn("p-1", "p-3");
    await getIssueComposerData();
    expect(mockFieldFindMany).toHaveBeenCalledTimes(1);
    expect(mockFieldFindMany.mock.calls[0][0].where).toEqual({
      workspaceId: "acme",
      archivedAt: null,
      OR: [{ projectId: null }, { projectId: { in: ["p-1", "p-3"] } }],
    });
    expect(mockFieldFindMany.mock.calls[0][0].orderBy).toEqual([
      { position: "asc" },
      { createdAt: "asc" },
    ]);
  });

  it("hands the fields over in the order they were read, in their normal form", async () => {
    allowIn("p-1");
    mockFieldFindMany.mockResolvedValue([
      fieldRow("a", null),
      fieldRow("b", "p-1"),
    ]);
    const data = await getIssueComposerData();
    expect(data?.customFields.map((f) => [f.id, f.projectId])).toEqual([
      ["a", null],
      ["b", "p-1"],
    ]);
    expect(data?.customFields[0].archived).toBe(false);
  });

  it("does not ask at all where nothing may be created: there is nothing to answer", async () => {
    allowIn();
    const data = await getIssueComposerData();
    expect(data?.customFields).toEqual([]);
    expect(mockFieldFindMany).not.toHaveBeenCalled();
  });
});
