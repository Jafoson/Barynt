import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// Whether plugins from no store are allowed. The setting decides which code the
// platform takes in at all, so: only `plugin.manage` may change it, switching it
// on needs a real yes to the warning that the server checks itself, only the
// value `true` ever allows anything, every change is audited, and reading it for
// the policy fails closed. No real database.

const mockSettingsFindUnique = mock();
const mockSettingsUpsert = mock();
const mockAuditCreate = mock();
const mockRevalidate = mock();

mock.module("@/lib/db", () => ({
  db: {
    systemSettings: {
      findUnique: mockSettingsFindUnique,
      upsert: mockSettingsUpsert,
    },
    auditLog: { create: mockAuditCreate },
    user: { findUnique: mock(async () => null) },
  },
}));
mock.module("next/cache", () => ({ revalidatePath: mockRevalidate }));

const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "admin1",
);
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PLATFORM: { scope: "platform" },
}));
mock.module("react", () => ({ cache: <T>(fn: T) => fn }));

import { getUnsignedPluginsAllowed } from "@/features/plugin-stores/queries";
import { setAllowUnsignedPlugins } from "@/features/plugin-stores/unsignedActions";
import { getAllowUnsignedPlugins } from "@/lib/plugins/unsigned";

function reset() {
  for (const m of [
    mockSettingsFindUnique,
    mockSettingsUpsert,
    mockAuditCreate,
    mockRevalidate,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("admin1");
  mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: false });
  mockSettingsUpsert.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
}

beforeEach(reset);

function wrote(): boolean {
  return [mockSettingsUpsert, mockAuditCreate, mockRevalidate].some(
    (m) => m.mock.calls.length > 0,
  );
}

describe("who may change the setting", () => {
  it("asks for plugin.manage in the platform context, for the action and the query", async () => {
    await setAllowUnsignedPlugins(true, true);
    await getUnsignedPluginsAllowed();
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.manage", { scope: "platform" }],
      ["plugin.manage", { scope: "platform" }],
    ]);
  });

  it("does nothing at all when the permission is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(setAllowUnsignedPlugins(true, true)).rejects.toThrow(
      "not allowed",
    );
    await expect(setAllowUnsignedPlugins(false)).rejects.toThrow();
    await expect(getUnsignedPluginsAllowed()).rejects.toThrow();
    expect(wrote()).toBe(false);
    expect(mockSettingsFindUnique).not.toHaveBeenCalled();
  });
});

describe("switching it on", () => {
  it("needs a real yes to the warning, whatever else is passed", async () => {
    for (const acknowledged of [
      undefined,
      false,
      "true",
      "yes",
      1,
      null,
      {},
      [true],
    ]) {
      const result = await setAllowUnsignedPlugins(
        true,
        acknowledged as unknown as boolean,
      );
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("own risk");
    }
    // Not even asked to read, let alone write.
    expect(mockSettingsFindUnique).not.toHaveBeenCalled();
    expect(wrote()).toBe(false);
  });

  it("with the yes, saves it and audits who did it", async () => {
    const result = await setAllowUnsignedPlugins(true, true);
    expect(result).toEqual({ ok: true });
    expect(mockSettingsUpsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { allowUnsignedPlugins: true },
      create: { id: 1, allowUnsignedPlugins: true },
    });
    expect(mockAuditCreate.mock.calls).toHaveLength(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.unsigned.allowed",
      actorId: "admin1",
      targetType: "systemSettings",
      targetId: "1",
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  it("creates the row on a fresh install, where there is none yet", async () => {
    mockSettingsFindUnique.mockResolvedValue(null);
    expect(await setAllowUnsignedPlugins(true, true)).toEqual({ ok: true });
    expect(mockSettingsUpsert.mock.calls[0]?.[0].create).toEqual({
      id: 1,
      allowUnsignedPlugins: true,
    });
  });

  it("writes and audits nothing when it is on already", async () => {
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: true });
    expect(await setAllowUnsignedPlugins(true, true)).toEqual({ ok: true });
    expect(wrote()).toBe(false);
  });
});

describe("only the value true allows anything", () => {
  it.each([
    ["the text true", "true"],
    ["1", 1],
    ["nothing", undefined],
    ["null", null],
    ["an object", {}],
    ["a list", [true]],
  ])("refuses %s, even with the yes", async (_name, allow) => {
    const result = await setAllowUnsignedPlugins(
      allow as unknown as boolean,
      true,
    );
    expect(result).toEqual({ error: "Invalid value." });
    expect(wrote()).toBe(false);
  });
});

describe("switching it off", () => {
  it("needs no warning, and audits it", async () => {
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: true });
    expect(await setAllowUnsignedPlugins(false)).toEqual({ ok: true });
    expect(mockSettingsUpsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { allowUnsignedPlugins: false },
      create: { id: 1, allowUnsignedPlugins: false },
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.unsigned.disallowed",
      actorId: "admin1",
      targetType: "systemSettings",
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  it("writes and audits nothing when it is off already, or there is no row", async () => {
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: false });
    expect(await setAllowUnsignedPlugins(false)).toEqual({ ok: true });
    mockSettingsFindUnique.mockResolvedValue(null);
    expect(await setAllowUnsignedPlugins(false)).toEqual({ ok: true });
    expect(wrote()).toBe(false);
  });
});

describe("reading it for the policy", () => {
  it("is true only when the row says true", async () => {
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: true });
    expect(await getAllowUnsignedPlugins()).toBe(true);
    expect(mockSettingsFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { allowUnsignedPlugins: true },
    });
  });

  it.each([
    ["a row that says false", { allowUnsignedPlugins: false }],
    ["no row (a fresh install)", null],
    ["a row without the column", {}],
    ["the text true", { allowUnsignedPlugins: "true" }],
    ["1", { allowUnsignedPlugins: 1 }],
    ["null", { allowUnsignedPlugins: null }],
  ])("is false for %s", async (_name, row) => {
    mockSettingsFindUnique.mockResolvedValue(row);
    expect(await getAllowUnsignedPlugins()).toBe(false);
  });

  it("is false, and says why in the log, when the database cannot be read", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      mockSettingsFindUnique.mockRejectedValue(new Error("connection lost"));
      expect(await getAllowUnsignedPlugins()).toBe(false);
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]?.join(" "))).toContain("connection lost");
    } finally {
      log.mockRestore();
    }
  });
});

describe("what the page gets to see", () => {
  it("is the stored value", async () => {
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: true });
    expect(await getUnsignedPluginsAllowed()).toBe(true);
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: false });
    expect(await getUnsignedPluginsAllowed()).toBe(false);
    mockSettingsFindUnique.mockResolvedValue(null);
    expect(await getUnsignedPluginsAllowed()).toBe(false);
  });

  it("does not turn a database error into off: an admin must not be shown off while it is on", async () => {
    mockSettingsFindUnique.mockRejectedValue(new Error("connection lost"));
    await expect(getUnsignedPluginsAllowed()).rejects.toThrow(
      "connection lost",
    );
  });
});
