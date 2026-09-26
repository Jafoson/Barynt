import { beforeEach, describe, expect, it, mock } from "bun:test";

// Choosing which custom fields a board or list shows. What matters: it is a personal setting (only
// being signed in), it is written for this person and this view, whatever a client sends is cut down to
// a clean list of ids, and nothing else of the preference is touched. Own process: it binds
// `features/issues/actions` to this file's stand-ins.

const mockUpsert = mock();
const mockMyUpsert = mock();
const mockUserId = mock(async (): Promise<string | null> => "u1");
const mockCanEnter = mock(async (_workspaceId: string) => true);
const mockRevalidate = mock();

mock.module("@/lib/db", () => ({
  db: {
    issueViewPreference: { upsert: mockUpsert },
    myIssuesViewPreference: { upsert: mockMyUpsert },
  },
}));
mock.module("@/lib/permissions", () => ({
  currentUserId: mockUserId,
  currentUserCanEnterWorkspace: mockCanEnter,
  requirePermission: async () => "u1",
  requirePermissionOr: async () => "u1",
  hasPermission: async () => true,
  accessFor: async () => ({ has: () => true }),
  PermissionError: class PermissionError extends Error {},
}));
mock.module("@/lib/current-workspace", () => ({
  // Not set while a Server Action runs: the page it was called from is rendered after it.
  getCurrentWorkspaceId: () => null,
  setCurrentWorkspaceId: () => {},
}));
mock.module("next/cache", () => ({ revalidatePath: mockRevalidate }));
mock.module("@/lib/realtime/store", () => ({ recordProjectChange: mock() }));
mock.module("@/lib/notify", () => ({ notify: mock() }));
mock.module("@/lib/webhooks/deliver", () => ({ fireWebhookEvent: mock() }));
mock.module("@/features/api-v1/queries", () => ({
  getIssueUnchecked: async () => null,
  getCommentUnchecked: async () => null,
}));

import {
  setIssueViewCustomFields,
  setMyIssuesViewCustomFields,
  setMyIssuesViewFieldVisibility,
  setMyIssuesViewGroups,
} from "@/features/issues/actions";

beforeEach(() => {
  for (const m of [mockUpsert, mockMyUpsert, mockRevalidate]) m.mockReset();
  mockUserId.mockResolvedValue("u1");
  mockCanEnter.mockResolvedValue(true);
  mockUpsert.mockResolvedValue({});
  mockMyUpsert.mockResolvedValue({});
});

describe("choosing the custom fields of a project's board or list", () => {
  it("writes them for this person, this project and this view, creating the preference if there is none", async () => {
    expect(await setIssueViewCustomFields("p-1", "list", ["a", "b"])).toEqual({
      ok: true,
    });
    const call = mockUpsert.mock.calls[0][0];
    expect(call.where).toEqual({
      userId_projectId_view: { userId: "u1", projectId: "p-1", view: "list" },
    });
    expect(call.create).toEqual({
      userId: "u1",
      projectId: "p-1",
      view: "list",
      shownCustomFields: ["a", "b"],
    });
    expect(call.update).toEqual({ shownCustomFields: ["a", "b"] });
  });

  it("touches nothing else of the preference", async () => {
    await setIssueViewCustomFields("p-1", "board", ["a"]);
    expect(Object.keys(mockUpsert.mock.calls[0][0].update)).toEqual([
      "shownCustomFields",
    ]);
  });

  it("refuses someone who is not signed in, and writes nothing", async () => {
    mockUserId.mockResolvedValue(null);
    expect(await setIssueViewCustomFields("p-1", "list", ["a"])).toEqual({
      error: "Not signed in.",
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("cuts what a client sends down to a clean list of ids", async () => {
    const sent = [
      "a",
      "a",
      5,
      "",
      "x".repeat(65),
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ] as unknown as string[];
    await setIssueViewCustomFields("p-1", "list", sent);
    expect(mockUpsert.mock.calls[0][0].update.shownCustomFields).toEqual(
      ["a", "b", "c", "d", "e"].concat(["f"]).slice(0, 6),
    );
  });

  it("writes an empty list to show none again", async () => {
    await setIssueViewCustomFields("p-1", "list", []);
    expect(mockUpsert.mock.calls[0][0].update).toEqual({
      shownCustomFields: [],
    });
  });

  it("refreshes the pages", async () => {
    await setIssueViewCustomFields("p-1", "list", ["a"]);
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("does not refresh for a refusal", async () => {
    mockUserId.mockResolvedValue(null);
    await setIssueViewCustomFields("p-1", "list", ["a"]);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});

describe("choosing the custom fields of 'my issues'", () => {
  it("writes them for this person, the workspace it was given and this view", async () => {
    expect(await setMyIssuesViewCustomFields("ws-1", "board", ["a"])).toEqual({
      ok: true,
    });
    const call = mockMyUpsert.mock.calls[0][0];
    expect(call.where).toEqual({
      userId_workspaceId_view: {
        userId: "u1",
        workspaceId: "ws-1",
        view: "board",
      },
    });
    expect(call.create).toEqual({
      userId: "u1",
      workspaceId: "ws-1",
      view: "board",
      shownCustomFields: ["a"],
    });
    expect(call.update).toEqual({ shownCustomFields: ["a"] });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("does not need the request's own current workspace: a Server Action runs before the page is rendered", async () => {
    // `getCurrentWorkspaceId` answers null in this file, as it does in a real action.
    expect(await setMyIssuesViewCustomFields("ws-1", "list", ["a"])).toEqual({
      ok: true,
    });
    expect(mockMyUpsert).toHaveBeenCalledTimes(1);
  });

  it("refuses someone who is not signed in, and someone who cannot enter the workspace", async () => {
    mockUserId.mockResolvedValue(null);
    expect(await setMyIssuesViewCustomFields("ws-1", "board", ["a"])).toEqual({
      error: "Not signed in.",
    });
    mockUserId.mockResolvedValue("u1");
    mockCanEnter.mockResolvedValue(false);
    expect(await setMyIssuesViewCustomFields("ws-x", "board", ["a"])).toEqual({
      error: "Not signed in.",
    });
    expect(mockCanEnter).toHaveBeenCalledWith("ws-x");
    expect(mockMyUpsert).not.toHaveBeenCalled();
  });

  it("cuts the list down and refreshes the pages", async () => {
    await setMyIssuesViewCustomFields("ws-1", "list", [
      "a",
      "a",
      7 as unknown as string,
    ]);
    expect(mockMyUpsert.mock.calls[0][0].update.shownCustomFields).toEqual([
      "a",
    ]);
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });
});

describe("the other display settings of 'my issues' (they never saved before: no workspace in an action)", () => {
  it("hides the built-in card fields for this person, this workspace and this view", async () => {
    expect(
      await setMyIssuesViewFieldVisibility("ws-1", "list", [
        "labels",
        "nonsense",
      ]),
    ).toEqual({ ok: true });
    const call = mockMyUpsert.mock.calls[0][0];
    expect(call.where).toEqual({
      userId_workspaceId_view: {
        userId: "u1",
        workspaceId: "ws-1",
        view: "list",
      },
    });
    expect(call.update).toEqual({ hiddenFields: ["labels"] });
    expect(call.create).toMatchObject({
      userId: "u1",
      workspaceId: "ws-1",
      view: "list",
      hiddenFields: ["labels"],
    });
  });

  it("refuses without a person or a workspace they can enter", async () => {
    mockCanEnter.mockResolvedValue(false);
    expect(
      await setMyIssuesViewFieldVisibility("ws-1", "list", ["labels"]),
    ).toEqual({
      error: "Not signed in.",
    });
    mockCanEnter.mockResolvedValue(true);
    mockUserId.mockResolvedValue(null);
    expect(
      await setMyIssuesViewFieldVisibility("ws-1", "list", ["labels"]),
    ).toEqual({
      error: "Not signed in.",
    });
    expect(mockMyUpsert).not.toHaveBeenCalled();
  });

  it("hides groups, only what is given, for this person, this workspace and this view", async () => {
    expect(
      await setMyIssuesViewGroups("ws-1", "board", { hideEmptyGroups: true }),
    ).toEqual({ ok: true });
    const call = mockMyUpsert.mock.calls[0][0];
    expect(call.where).toEqual({
      userId_workspaceId_view: {
        userId: "u1",
        workspaceId: "ws-1",
        view: "board",
      },
    });
    expect(call.update).toEqual({ hideEmptyGroups: true });
  });

  it("refuses groups for someone who is not signed in", async () => {
    mockUserId.mockResolvedValue(null);
    expect(
      await setMyIssuesViewGroups("ws-1", "board", { hideEmptyGroups: true }),
    ).toEqual({ error: "Not signed in." });
    expect(mockMyUpsert).not.toHaveBeenCalled();
  });

  it("refuses for groups too without a workspace they can enter", async () => {
    mockCanEnter.mockResolvedValue(false);
    expect(
      await setMyIssuesViewGroups("ws-1", "board", { hideEmptyGroups: true }),
    ).toEqual({ error: "Not signed in." });
    expect(mockMyUpsert).not.toHaveBeenCalled();
  });
});
