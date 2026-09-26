import { beforeEach, describe, expect, it, mock } from "bun:test";

// What a board or list shows of the custom fields: this person's choice per view (a project's, or
// "my issues" across projects), turned into fields and the answers of the issues on the page. What
// matters: nothing is read beyond the preference when nothing is shown, the choice is read for the right
// view and person, a project's view asks for that project's fields and "my issues" for every project this
// person sees, and a stored choice that is not a clean list of ids is cleaned. Own process: the real
// preference readers and the real loader against a stand-in database.

const mockPrefFind = mock();
const mockMyPrefFind = mock();
const mockDefFindMany = mock();
const mockValueFindMany = mock();
const mockUserId = mock(async (): Promise<string | null> => "u1");
const mockWorkspaceId = mock((): string | null => "ws-1");
const mockProjects = mock(async () => [{ id: "p-1" }, { id: "p-2" }]);

mock.module("@/lib/db", () => ({
  db: {
    issueViewPreference: { findUnique: mockPrefFind },
    myIssuesViewPreference: { findUnique: mockMyPrefFind },
    customFieldDefinition: { findMany: mockDefFindMany },
    customFieldValue: { findMany: mockValueFindMany },
  },
}));
mock.module("@/lib/permissions", () => ({
  currentUserId: mockUserId,
  accessFor: async () => ({ has: () => true }),
  hasPermission: async () => true,
}));
mock.module("@/lib/current-workspace", () => ({
  getCurrentWorkspaceId: mockWorkspaceId,
  setCurrentWorkspaceId: () => {},
}));
mock.module("@/features/workspaces/queries", () => ({
  getWorkspaceProjects: mockProjects,
}));

import {
  getIssueViewCustomFields,
  getMyIssuesViewCustomFields,
} from "@/features/issues/queries";
import { getViewCustomFields } from "@/features/issues/viewCustomFields";

function fieldRow(id: string, more: Record<string, unknown> = {}) {
  return {
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
    workspaceId: "ws-1",
    projectId: null,
    ...more,
  };
}

beforeEach(() => {
  for (const m of [
    mockPrefFind,
    mockMyPrefFind,
    mockDefFindMany,
    mockValueFindMany,
  ]) {
    m.mockReset();
  }
  mockUserId.mockResolvedValue("u1");
  mockWorkspaceId.mockReturnValue("ws-1");
  mockProjects.mockResolvedValue([{ id: "p-1" }, { id: "p-2" }]);
  mockPrefFind.mockResolvedValue({ shownCustomFields: [] });
  mockMyPrefFind.mockResolvedValue({ shownCustomFields: [] });
  mockDefFindMany.mockResolvedValue([]);
  mockValueFindMany.mockResolvedValue([]);
});

describe("the fields this person shows in a project's board or list", () => {
  it("are read for this person, this project and this view", async () => {
    mockPrefFind.mockResolvedValue({ shownCustomFields: ["a", "b"] });
    expect(await getIssueViewCustomFields("p-1", "list")).toEqual(["a", "b"]);
    expect(mockPrefFind.mock.calls[0][0]).toEqual({
      where: {
        userId_projectId_view: { userId: "u1", projectId: "p-1", view: "list" },
      },
      select: { shownCustomFields: true },
    });
  });

  it("are none for someone who is not signed in, and none where nothing was ever saved", async () => {
    mockUserId.mockResolvedValue(null);
    expect(await getIssueViewCustomFields("p-1", "board")).toEqual([]);
    expect(mockPrefFind).not.toHaveBeenCalled();
    mockUserId.mockResolvedValue("u1");
    mockPrefFind.mockResolvedValue(null);
    expect(await getIssueViewCustomFields("p-1", "board")).toEqual([]);
  });

  it("are cleaned: only ids, each once, no more than a card can show", async () => {
    mockPrefFind.mockResolvedValue({
      shownCustomFields: ["a", "a", "", "b", "c", "d", "e", "f", "g", "h"],
    });
    expect(await getIssueViewCustomFields("p-1", "board")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });
});

describe("the fields this person shows in 'my issues'", () => {
  it("are read for this person, this workspace and this view", async () => {
    mockMyPrefFind.mockResolvedValue({ shownCustomFields: ["a"] });
    expect(await getMyIssuesViewCustomFields("board")).toEqual(["a"]);
    expect(mockMyPrefFind.mock.calls[0][0]).toEqual({
      where: {
        userId_workspaceId_view: {
          userId: "u1",
          workspaceId: "ws-1",
          view: "board",
        },
      },
      select: { shownCustomFields: true },
    });
  });

  it("are cleaned like a project's: only ids, each once, no more than a card can show", async () => {
    mockMyPrefFind.mockResolvedValue({
      shownCustomFields: ["a", "a", "", "b", "c", "d", "e", "f", "g"],
    });
    expect(await getMyIssuesViewCustomFields("board")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });

  it("are none without a person or a workspace", async () => {
    mockUserId.mockResolvedValue(null);
    expect(await getMyIssuesViewCustomFields("list")).toEqual([]);
    mockUserId.mockResolvedValue("u1");
    mockWorkspaceId.mockReturnValue(null);
    expect(await getMyIssuesViewCustomFields("list")).toEqual([]);
    expect(mockMyPrefFind).not.toHaveBeenCalled();
  });
});

describe("what a view shows", () => {
  it("reads nothing but the preference when nothing is shown", async () => {
    const result = await getViewCustomFields("board", ["i1"], "p-1");
    expect(result).toEqual({ fields: [], values: {} });
    expect(mockDefFindMany).not.toHaveBeenCalled();
    expect(mockValueFindMany).not.toHaveBeenCalled();
    expect(mockProjects).not.toHaveBeenCalled();
  });

  it("reads nothing but the preference for 'my issues' either: it does not even list the projects", async () => {
    const result = await getViewCustomFields("board", ["i1"]);
    expect(result).toEqual({ fields: [], values: {} });
    expect(mockMyPrefFind).toHaveBeenCalled();
    expect(mockProjects).not.toHaveBeenCalled();
    expect(mockDefFindMany).not.toHaveBeenCalled();
  });

  it("is nothing without a workspace, and reads nothing", async () => {
    mockWorkspaceId.mockReturnValue(null);
    mockPrefFind.mockResolvedValue({ shownCustomFields: ["a"] });
    expect(await getViewCustomFields("board", ["i1"], "p-1")).toEqual({
      fields: [],
      values: {},
    });
    expect(mockPrefFind).not.toHaveBeenCalled();
    expect(mockDefFindMany).not.toHaveBeenCalled();
  });

  it("asks a project's view for that project's fields, and reads the project's preference", async () => {
    mockPrefFind.mockResolvedValue({ shownCustomFields: ["a"] });
    mockDefFindMany.mockResolvedValue([fieldRow("a")]);
    mockValueFindMany.mockResolvedValue([
      {
        issueId: "i1",
        fieldId: "a",
        text: "Acme",
        number: null,
        date: null,
        userId: null,
      },
    ]);
    const result = await getViewCustomFields("list", ["i1", "i2"], "p-1");
    expect(mockPrefFind).toHaveBeenCalled();
    expect(mockMyPrefFind).not.toHaveBeenCalled();
    expect(mockProjects).not.toHaveBeenCalled();
    expect(mockDefFindMany.mock.calls[0][0].where).toEqual({
      workspaceId: "ws-1",
      archivedAt: null,
      OR: [{ projectId: null }, { projectId: { in: ["p-1"] } }],
    });
    expect(result.fields.map((f) => f.id)).toEqual(["a"]);
    expect(result.values).toEqual({ i1: { a: "Acme" } });
  });

  it("asks 'my issues' for the fields of every project this person sees, and reads that preference", async () => {
    mockMyPrefFind.mockResolvedValue({ shownCustomFields: ["a"] });
    mockDefFindMany.mockResolvedValue([fieldRow("a")]);
    await getViewCustomFields("board", ["i1"]);
    expect(mockPrefFind).not.toHaveBeenCalled();
    expect(mockDefFindMany.mock.calls[0][0].where).toEqual({
      workspaceId: "ws-1",
      archivedAt: null,
      OR: [{ projectId: null }, { projectId: { in: ["p-1", "p-2"] } }],
    });
  });

  it("reads the preference of the view it was asked for", async () => {
    await getViewCustomFields("board", [], "p-1");
    expect(mockPrefFind.mock.calls[0][0].where.userId_projectId_view.view).toBe(
      "board",
    );
    await getViewCustomFields("list", [], "p-1");
    expect(mockPrefFind.mock.calls[1][0].where.userId_projectId_view.view).toBe(
      "list",
    );
  });
});
