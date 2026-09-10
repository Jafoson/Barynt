import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockTx = {
  workspace: { create: mock() },
  workspaceStatus: { createMany: mock() },
  workspacePriority: { createMany: mock() },
  workspaceIssueType: { createMany: mock() },
  workspaceMember: { create: mock(), findMany: mock() },
  project: { create: mock() },
  projectMember: { createMany: mock() },
};

const mockProvisionRbac = mock();

mock.module("@/lib/db", () => ({
  db: {
    workspace: { findUnique: mock() },
    $transaction: mock(),
  },
}));

mock.module("@/lib/session", () => ({
  getSession: mock(),
}));

const mockGetSystemSettings = mock(
  async (): Promise<{
    allowWorkspaceCreation: boolean;
    defaultWorkspaceId: string | null;
  }> => ({
    allowWorkspaceCreation: true,
    defaultWorkspaceId: null,
  }),
);
mock.module("@/lib/system-settings", () => ({
  getSystemSettings: mockGetSystemSettings,
  canCreateWorkspace: (s: {
    allowWorkspaceCreation: boolean;
    defaultWorkspaceId: string | null;
  }) => s.allowWorkspaceCreation || !s.defaultWorkspaceId,
}));

mock.module("@/lib/workspace-defaults", () => ({
  DEFAULT_STATUSES: [{ id: "status-1" }, { id: "status-2" }],
  DEFAULT_PRIORITIES: [{ id: "prio-1" }],
  DEFAULT_ISSUE_TYPES: [{ id: "type-1" }],
}));

// createWorkspace no longer provisions anything — the default roles are shared
// and already exist in the database. The mock stays so the test proves this
// instead of merely assuming it.
mock.module("@/lib/rbac-provision", () => ({
  provisionSystemRbac: mockProvisionRbac,
}));

import { createWorkspace } from "@/features/workspaces/actions";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const mockWorkspaceFindUnique = db.workspace.findUnique as ReturnType<
  typeof mock
>;
const mockTransaction = db.$transaction as ReturnType<typeof mock>;
const mockGetSession = getSession as ReturnType<typeof mock>;

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.append(k, v);
  return fd;
}

function resetTxMocks() {
  for (const group of Object.values(mockTx)) {
    for (const fn of Object.values(group)) {
      const m = fn as ReturnType<typeof mock>;
      m.mockReset();
      m.mockResolvedValue({});
    }
  }
  // After `workspaceMember.create`, the creator is the only member — that is
  // exactly what enrollment into the project reads out. As owner, they become
  // Project Admin.
  mockTx.workspaceMember.findMany.mockResolvedValue([
    {
      userId: "user-1",
      role: {
        key: "owner",
        permissions: [
          { permissionKey: "project.admin.all" },
          { permissionKey: "member.invite" },
        ],
      },
    },
  ]);
}

describe("createWorkspace()", () => {
  beforeEach(() => {
    mockWorkspaceFindUnique.mockReset();
    mockTransaction.mockReset();
    mockGetSession.mockReset();
    resetTxMocks();
    mockProvisionRbac.mockReset();
    mockProvisionRbac.mockResolvedValue(undefined);
    mockWorkspaceFindUnique.mockResolvedValue(null);
    mockTransaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
        await fn(mockTx);
      },
    );
    mockGetSystemSettings.mockReset();
    mockGetSystemSettings.mockResolvedValue({
      allowWorkspaceCreation: true,
      defaultWorkspaceId: null,
    });
  });

  describe("Workspace creation disabled", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ userId: "user-1" });
      mockGetSystemSettings.mockResolvedValue({
        allowWorkspaceCreation: false,
        defaultWorkspaceId: "acme",
      });
    });

    it("returns an error instead of creating a workspace", async () => {
      const result = await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "my-workspace" }),
      );
      expect(result).toEqual({
        error: "Workspace creation is currently disabled by the administrator.",
      });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("stays allowed when no default workspace is set yet", async () => {
      mockGetSystemSettings.mockResolvedValue({
        allowWorkspaceCreation: false,
        defaultWorkspaceId: null,
      });

      const result = await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "my-workspace" }),
      );
      expect(result).toMatchObject({ redirectTo: expect.any(String) });
    });
  });

  describe("Auth check", () => {
    it("returns an error when the user is not logged in", async () => {
      mockGetSession.mockResolvedValue(null);
      const result = await createWorkspace(
        makeFormData({ name: "My WS", slug: "my-ws" }),
      );
      expect(result).toEqual({ error: "You must be logged in." });
    });

    it("performs no DB operations when not logged in", async () => {
      mockGetSession.mockResolvedValue(null);
      await createWorkspace(makeFormData({ name: "My WS", slug: "my-ws" }));
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  describe("Validation", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ userId: "user-1" });
    });

    it("returns an error when the name is missing", async () => {
      const result = await createWorkspace(makeFormData({ slug: "my-ws" }));
      expect(result).toEqual({ error: "Name and slug are required." });
    });

    it("returns an error when the slug is missing", async () => {
      const result = await createWorkspace(
        makeFormData({ name: "My Workspace" }),
      );
      expect(result).toEqual({ error: "Name and slug are required." });
    });

    it("returns an error when the slug contains uppercase letters", async () => {
      const result = await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "My-Workspace" }),
      );
      expect(result).toEqual({
        error: "Slug may only contain lowercase letters, numbers, and hyphens.",
      });
    });

    it("returns an error when the slug contains special characters", async () => {
      const result = await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "my_workspace!" }),
      );
      expect(result).toEqual({
        error: "Slug may only contain lowercase letters, numbers, and hyphens.",
      });
    });

    it("appends a number when the slug is already taken", async () => {
      mockWorkspaceFindUnique.mockImplementation(
        async ({ where }: { where: { slug: string } }) =>
          where.slug === "existing" ? { id: "existing" } : null,
      );
      const result = await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "existing", locale: "de" }),
      );
      expect((result as { redirectTo: string }).redirectTo).toBe("/existing1");
    });

    it("keeps counting up when the first fallback slug is also taken", async () => {
      const taken = new Set(["existing", "existing1"]);
      mockWorkspaceFindUnique.mockImplementation(
        async ({ where }: { where: { slug: string } }) =>
          taken.has(where.slug) ? { id: where.slug } : null,
      );
      const result = await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "existing", locale: "de" }),
      );
      expect((result as { redirectTo: string }).redirectTo).toBe("/existing2");
    });
  });

  describe("Successful workspace creation", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ userId: "user-1" });
    });

    it("returns redirectTo after successful creation", async () => {
      const result = await createWorkspace(
        makeFormData({
          name: "My Workspace",
          slug: "my-workspace",
          locale: "de",
        }),
      );
      expect(result).toMatchObject({ redirectTo: expect.any(String) });
    });

    it("redirects to the workspace with the correct workspace slug", async () => {
      const result = await createWorkspace(
        makeFormData({
          name: "My Workspace",
          slug: "my-workspace",
          locale: "de",
        }),
      );
      expect((result as { redirectTo: string }).redirectTo).toBe(
        "/my-workspace",
      );
    });

    it("creates the workspace in a transaction", async () => {
      await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "my-workspace" }),
      );
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it("creates the user as an owner member", async () => {
      await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "my-workspace" }),
      );
      expect(mockTx.workspaceMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            // The owner role is a shared system role — nothing is copied
            // per workspace anymore.
            roleId: "sys:WORKSPACE:owner",
            pending: false,
          }),
        }),
      );
    });

    it("creates default statuses, priorities, and types", async () => {
      await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "my-workspace" }),
      );
      expect(mockTx.workspaceStatus.createMany).toHaveBeenCalled();
      expect(mockTx.workspacePriority.createMany).toHaveBeenCalled();
      expect(mockTx.workspaceIssueType.createMany).toHaveBeenCalled();
    });

    it("no longer provisions roles — the defaults are shared", async () => {
      await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "my-workspace" }),
      );
      expect(mockProvisionRbac).not.toHaveBeenCalled();
    });

    it("creates an initial project", async () => {
      await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "my-workspace" }),
      );
      expect(mockTx.project.create).toHaveBeenCalledTimes(1);
    });

    it("enters the creator as project admin in the initial project", async () => {
      await createWorkspace(
        makeFormData({ name: "My Workspace", slug: "my-workspace" }),
      );

      const projectId = mockTx.project.create.mock.calls[0]?.[0]?.data?.id;
      expect(mockTx.projectMember.createMany).toHaveBeenCalledWith({
        data: [
          { projectId, userId: "user-1", roleId: "sys:PROJECT:project_admin" },
        ],
        skipDuplicates: true,
      });
    });
  });
});
