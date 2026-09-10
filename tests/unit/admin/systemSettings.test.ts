import { beforeEach, describe, expect, it, mock } from "bun:test";

// System-wide settings: whether workspace creation is open to everyone, and
// the default workspace accounts without a membership fall back to
// (`lib/system-settings.ts`, `features/system-settings`).

const mockSystemSettingsFindUnique = mock();
const mockSystemSettingsUpsert = mock();
const mockWorkspaceFindMany = mock();
const mockWorkspaceFindUnique = mock();
const mockAuditCreate = mock();

mock.module("@/lib/db", () => ({
  db: {
    systemSettings: {
      findUnique: mockSystemSettingsFindUnique,
      upsert: mockSystemSettingsUpsert,
    },
    workspace: {
      findMany: mockWorkspaceFindMany,
      findUnique: mockWorkspaceFindUnique,
    },
    auditLog: { create: mockAuditCreate },
    user: { findUnique: mock(async () => null) },
  },
}));
mock.module("next/cache", () => ({ revalidatePath: mock() }));

const mockRequirePermission = mock(async () => "admin1");
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PLATFORM: { scope: "platform" },
}));

mock.module("react", () => ({ cache: <T>(fn: T) => fn }));

import {
  setAllowWorkspaceCreation,
  setDefaultWorkspace,
} from "@/features/system-settings/actions";
import { getSystemSettingsData } from "@/features/system-settings/queries";
import { canCreateWorkspace, getSystemSettings } from "@/lib/system-settings";

function reset() {
  for (const m of [
    mockSystemSettingsFindUnique,
    mockSystemSettingsUpsert,
    mockWorkspaceFindMany,
    mockWorkspaceFindUnique,
    mockAuditCreate,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("admin1");
  mockSystemSettingsFindUnique.mockResolvedValue(null);
  mockSystemSettingsUpsert.mockResolvedValue({});
  mockWorkspaceFindMany.mockResolvedValue([]);
  mockAuditCreate.mockResolvedValue({});
}

beforeEach(reset);

describe("getSystemSettings()", () => {
  it("defaults to creation allowed with no default workspace when no row exists", async () => {
    mockSystemSettingsFindUnique.mockResolvedValue(null);
    const settings = await getSystemSettings();
    expect(settings).toEqual({
      allowWorkspaceCreation: true,
      defaultWorkspaceId: null,
    });
  });

  it("reads the row when one exists", async () => {
    mockSystemSettingsFindUnique.mockResolvedValue({
      id: 1,
      allowWorkspaceCreation: false,
      defaultWorkspaceId: "acme",
      updatedAt: new Date(),
    });
    const settings = await getSystemSettings();
    expect(settings).toEqual({
      allowWorkspaceCreation: false,
      defaultWorkspaceId: "acme",
    });
  });
});

describe("canCreateWorkspace()", () => {
  it("is true when the switch is on", () => {
    expect(
      canCreateWorkspace({
        allowWorkspaceCreation: true,
        defaultWorkspaceId: null,
      }),
    ).toBe(true);
  });

  it("stays true when the switch is off but no default is set — nobody gets locked out", () => {
    expect(
      canCreateWorkspace({
        allowWorkspaceCreation: false,
        defaultWorkspaceId: null,
      }),
    ).toBe(true);
  });

  it("is false once the switch is off and a default is configured", () => {
    expect(
      canCreateWorkspace({
        allowWorkspaceCreation: false,
        defaultWorkspaceId: "acme",
      }),
    ).toBe(false);
  });
});

describe("getSystemSettingsData()", () => {
  it("checks the permission", async () => {
    await getSystemSettingsData();
    expect(mockRequirePermission).toHaveBeenCalledWith(
      "system.settings.manage",
      { scope: "platform" },
    );
  });

  it("resolves the default workspace's name from the workspace list", async () => {
    mockSystemSettingsFindUnique.mockResolvedValue({
      id: 1,
      allowWorkspaceCreation: false,
      defaultWorkspaceId: "acme",
      updatedAt: new Date(),
    });
    mockWorkspaceFindMany.mockResolvedValue([
      { id: "acme", name: "Acme", suspended: false },
      { id: "other", name: "Other", suspended: true },
    ]);

    const data = await getSystemSettingsData();

    expect(data.defaultWorkspaceName).toBe("Acme");
    // Suspended workspaces are excluded from the picker's options...
    expect(data.workspaces).toEqual([{ id: "acme", name: "Acme" }]);
  });

  it("still resolves the default workspace's name even if it's suspended", async () => {
    mockSystemSettingsFindUnique.mockResolvedValue({
      id: 1,
      allowWorkspaceCreation: false,
      defaultWorkspaceId: "other",
      updatedAt: new Date(),
    });
    mockWorkspaceFindMany.mockResolvedValue([
      { id: "other", name: "Other", suspended: true },
    ]);

    const data = await getSystemSettingsData();

    expect(data.defaultWorkspaceName).toBe("Other");
    expect(data.workspaces).toEqual([]);
  });
});

describe("setAllowWorkspaceCreation()", () => {
  it("checks the permission before writing anything", async () => {
    mockRequirePermission.mockRejectedValue(new Error("no permission"));

    await expect(setAllowWorkspaceCreation(false)).rejects.toThrow();
    expect(mockSystemSettingsUpsert).not.toHaveBeenCalled();
  });

  it("upserts the singleton row", async () => {
    const result = await setAllowWorkspaceCreation(false);
    expect(result).toEqual({ ok: true });
    expect(mockSystemSettingsUpsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { allowWorkspaceCreation: false },
      create: { id: 1, allowWorkspaceCreation: false },
    });
  });

  it("records an audit entry", async () => {
    await setAllowWorkspaceCreation(true);
    expect(mockAuditCreate.mock.calls[0][0].data).toMatchObject({
      action: "system.settings.updated",
      targetType: "systemSettings",
      targetId: "1",
    });
  });
});

describe("setDefaultWorkspace()", () => {
  it("checks the permission before writing anything", async () => {
    mockRequirePermission.mockRejectedValue(new Error("no permission"));

    await expect(setDefaultWorkspace("acme")).rejects.toThrow();
    expect(mockSystemSettingsUpsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown workspace", async () => {
    mockWorkspaceFindUnique.mockResolvedValue(null);
    const result = await setDefaultWorkspace("ghost");
    expect(result).toEqual({ error: "Unknown workspace." });
    expect(mockSystemSettingsUpsert).not.toHaveBeenCalled();
  });

  it("rejects a suspended workspace", async () => {
    mockWorkspaceFindUnique.mockResolvedValue({
      name: "Acme",
      suspended: true,
    });
    const result = await setDefaultWorkspace("acme");
    expect(result).toEqual({ error: "This workspace is suspended." });
    expect(mockSystemSettingsUpsert).not.toHaveBeenCalled();
  });

  it("sets a valid workspace as the default", async () => {
    mockWorkspaceFindUnique.mockResolvedValue({
      name: "Acme",
      suspended: false,
    });
    const result = await setDefaultWorkspace("acme");
    expect(result).toEqual({ ok: true });
    expect(mockSystemSettingsUpsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { defaultWorkspaceId: "acme" },
      create: { id: 1, defaultWorkspaceId: "acme" },
    });
  });

  it("clears the default with null, without looking up a workspace", async () => {
    const result = await setDefaultWorkspace(null);
    expect(result).toEqual({ ok: true });
    expect(mockWorkspaceFindUnique).not.toHaveBeenCalled();
    expect(mockSystemSettingsUpsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { defaultWorkspaceId: null },
      create: { id: 1, defaultWorkspaceId: null },
    });
  });
});
