import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// Who gets the plugin store, and which plugins they see there. What matters: only
// `plugin.manage`, the setting is all three values at once and validated, it is open by
// default (a missing row), it fails closed when it cannot be read, a change is audited with
// what it was and what it is, and a change that changes nothing is not audited. The
// database is replaced.

const mockSettingsFindUnique = mock();
const mockSettingsUpsert = mock();
const mockStoreFindUnique = mock();
const mockCuratedCreateMany = mock();
const mockCuratedDeleteMany = mock();
const mockAuditCreate = mock();
const mockRevalidate = mock();
const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "admin1",
);

mock.module("@/lib/db", () => ({
  db: {
    systemSettings: {
      findUnique: mockSettingsFindUnique,
      upsert: mockSettingsUpsert,
    },
    pluginStore: { findUnique: mockStoreFindUnique },
    pluginStoreCurated: {
      createMany: mockCuratedCreateMany,
      deleteMany: mockCuratedDeleteMany,
    },
    auditLog: { create: mockAuditCreate },
    user: { findUnique: mock(async () => null) },
  },
}));
mock.module("next/cache", () => ({ revalidatePath: mockRevalidate }));
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PLATFORM: { scope: "platform" },
}));

import {
  setPluginCurated,
  setPluginStoreVisibility,
} from "@/features/plugin-stores/visibilityActions";
import {
  DEFAULT_STORE_VISIBILITY,
  getStoreVisibility,
} from "@/lib/plugins/storeVisibility";

beforeEach(() => {
  for (const m of [
    mockSettingsFindUnique,
    mockSettingsUpsert,
    mockStoreFindUnique,
    mockCuratedCreateMany,
    mockCuratedDeleteMany,
    mockAuditCreate,
    mockRevalidate,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("admin1");
  mockSettingsFindUnique.mockResolvedValue(null);
  mockSettingsUpsert.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
  mockStoreFindUnique.mockResolvedValue({ id: "store-1", name: "Acme" });
  mockCuratedCreateMany.mockResolvedValue({ count: 1 });
  mockCuratedDeleteMany.mockResolvedValue({ count: 1 });
});

const row = (
  inWorkspaces: boolean,
  inProjects: boolean,
  curatedOnly: boolean,
) => ({
  pluginStoreInWorkspaces: inWorkspaces,
  pluginStoreInProjects: inProjects,
  pluginStoreCuratedOnly: curatedOnly,
});

/** Nothing was written, audited or told to the cache. */
const untouched = () =>
  [
    mockSettingsUpsert,
    mockCuratedCreateMany,
    mockCuratedDeleteMany,
    mockAuditCreate,
    mockRevalidate,
  ].every((m) => m.mock.calls.length === 0);

describe("reading the visibility", () => {
  it("is open when nothing was ever set: the admin has to decide nothing", async () => {
    expect(await getStoreVisibility()).toEqual({
      inWorkspaces: true,
      inProjects: true,
      curatedOnly: false,
    });
    expect(DEFAULT_STORE_VISIBILITY).toEqual({
      inWorkspaces: true,
      inProjects: true,
      curatedOnly: false,
    });
  });

  it("is what the row says, each value on its own", async () => {
    mockSettingsFindUnique.mockResolvedValue(row(false, true, true));
    expect(await getStoreVisibility()).toEqual({
      inWorkspaces: false,
      inProjects: true,
      curatedOnly: true,
    });
    mockSettingsFindUnique.mockResolvedValue(row(true, false, false));
    expect(await getStoreVisibility()).toEqual({
      inWorkspaces: true,
      inProjects: false,
      curatedOnly: false,
    });
  });

  it("asks for the three columns and nothing else", async () => {
    await getStoreVisibility();
    expect(mockSettingsFindUnique.mock.calls[0]?.[0]).toEqual({
      where: { id: 1 },
      select: {
        pluginStoreInWorkspaces: true,
        pluginStoreInProjects: true,
        pluginStoreCuratedOnly: true,
      },
    });
  });

  it("is closed when it cannot be read: not shown, and if shown only what is released", async () => {
    mockSettingsFindUnique.mockRejectedValue(new Error("database down"));
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await getStoreVisibility()).toEqual({
        inWorkspaces: false,
        inProjects: false,
        curatedOnly: true,
      });
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]?.[1])).toContain("database down");
    } finally {
      log.mockRestore();
    }
  });

  it("does not hand out the default object itself, so nobody can change it", async () => {
    const first = await getStoreVisibility();
    first.inWorkspaces = false;
    expect((await getStoreVisibility()).inWorkspaces).toBe(true);
  });
});

describe("setting the visibility", () => {
  const next = { inWorkspaces: true, inProjects: false, curatedOnly: true };

  it("asks for plugin.manage in the platform context, first", async () => {
    await setPluginStoreVisibility(next);
    expect(mockRequirePermission.mock.calls[0]).toEqual([
      "plugin.manage",
      { scope: "platform" },
    ]);
  });

  it("does nothing at all when the permission is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(setPluginStoreVisibility(next)).rejects.toThrow("not allowed");
    expect(untouched()).toBe(true);
    expect(mockSettingsFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing", undefined],
    ["a value that is not an object", "yes"],
    ["a missing value", { inWorkspaces: true, inProjects: true }],
    ["text instead of a boolean", { ...next, inWorkspaces: "true" }],
    ["a number", { ...next, inProjects: 1 }],
    ["null", { ...next, curatedOnly: null }],
  ])("is refused with %s", async (_n, value) => {
    expect(await setPluginStoreVisibility(value as never)).toEqual({
      error: "Invalid value.",
    });
    expect(untouched()).toBe(true);
  });

  it("writes all three values, creating the row if there is none, and says what it was and what it is", async () => {
    expect(await setPluginStoreVisibility(next)).toEqual({ ok: true });
    expect(mockSettingsUpsert.mock.calls[0]?.[0]).toEqual({
      where: { id: 1 },
      update: {
        pluginStoreInWorkspaces: true,
        pluginStoreInProjects: false,
        pluginStoreCuratedOnly: true,
      },
      create: {
        id: 1,
        pluginStoreInWorkspaces: true,
        pluginStoreInProjects: false,
        pluginStoreCuratedOnly: true,
      },
    });
    expect(mockAuditCreate.mock.calls).toHaveLength(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.store.visibility",
      actorId: "admin1",
      targetType: "systemSettings",
      targetId: "1",
      meta: {
        from: { inWorkspaces: true, inProjects: true, curatedOnly: false },
        to: next,
      },
    });
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("compares with what is there, not with the default, when there is a row", async () => {
    mockSettingsFindUnique.mockResolvedValue(row(false, false, true));
    await setPluginStoreVisibility({
      inWorkspaces: true,
      inProjects: false,
      curatedOnly: true,
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.meta.from).toEqual({
      inWorkspaces: false,
      inProjects: false,
      curatedOnly: true,
    });
  });

  it("ignores what else an input carries, and takes only the three values", async () => {
    await setPluginStoreVisibility({
      ...next,
      id: 2,
      allowUnsignedPlugins: true,
    } as never);
    const data = mockSettingsUpsert.mock.calls[0]?.[0].update;
    expect(Object.keys(data).sort()).toEqual([
      "pluginStoreCuratedOnly",
      "pluginStoreInProjects",
      "pluginStoreInWorkspaces",
    ]);
  });

  it("does nothing, quietly, when nothing changes: not for a row, not for the default", async () => {
    mockSettingsFindUnique.mockResolvedValue(row(true, false, true));
    expect(await setPluginStoreVisibility(next)).toEqual({ ok: true });
    mockSettingsFindUnique.mockResolvedValue(null);
    expect(
      await setPluginStoreVisibility({ ...DEFAULT_STORE_VISIBILITY }),
    ).toEqual({ ok: true });
    expect(untouched()).toBe(true);
  });

  it.each([
    [
      "only workspaces",
      { inWorkspaces: false, inProjects: true, curatedOnly: false },
    ],
    [
      "only projects",
      { inWorkspaces: true, inProjects: false, curatedOnly: false },
    ],
    [
      "only curated",
      { inWorkspaces: true, inProjects: true, curatedOnly: true },
    ],
  ])("is written when just one value changes (%s)", async (_n, value) => {
    expect(await setPluginStoreVisibility(value)).toEqual({ ok: true });
    expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });

  it("does not audit a write that failed", async () => {
    mockSettingsUpsert.mockRejectedValue(new Error("connection lost"));
    await expect(setPluginStoreVisibility(next)).rejects.toThrow(
      "connection lost",
    );
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});

describe("releasing a plugin for workspaces and projects", () => {
  it("asks for plugin.manage first, and does nothing when it is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(setPluginCurated("store-1", "notes", true)).rejects.toThrow();
    expect(untouched()).toBe(true);
    expect(mockStoreFindUnique).not.toHaveBeenCalled();
    mockRequirePermission.mockResolvedValue("admin1");
    await setPluginCurated("store-1", "notes", true);
    expect(mockRequirePermission.mock.calls.at(-1)).toEqual([
      "plugin.manage",
      { scope: "platform" },
    ]);
  });

  it.each([
    ["a store id that is not text", [42, "notes", true]],
    ["an empty store id", ["", "notes", true]],
    ["a store id that is too long", ["s".repeat(101), "notes", true]],
    ["a plugin id with capitals", ["store-1", "Notes", true]],
    ["a plugin id that is a path", ["store-1", "../etc", true]],
    ["a plugin id that is too short", ["store-1", "a", true]],
    ["a plugin id that is not text", ["store-1", 7, true]],
    ["a flag that is not a boolean", ["store-1", "notes", "yes"]],
    ["nothing", [undefined, undefined, undefined]],
  ])("is refused for %s", async (_n, [store, plugin, flag]) => {
    expect(
      await setPluginCurated(
        store as string,
        plugin as string,
        flag as boolean,
      ),
    ).toEqual({
      error: "Invalid request.",
    });
    expect(untouched()).toBe(true);
    expect(mockStoreFindUnique).not.toHaveBeenCalled();
  });

  it("is refused for a store that is not there", async () => {
    mockStoreFindUnique.mockResolvedValue(null);
    expect(await setPluginCurated("nope", "notes", true)).toEqual({
      error: "Unknown store.",
    });
    expect(untouched()).toBe(true);
  });

  it("releases it for that store and plugin, ignoring one that is released already, and audits it", async () => {
    expect(await setPluginCurated("store-1", "notes", true)).toEqual({
      ok: true,
    });
    expect(mockCuratedCreateMany.mock.calls[0]?.[0]).toEqual({
      data: [{ storeId: "store-1", pluginId: "notes" }],
      skipDuplicates: true,
    });
    expect(mockCuratedDeleteMany).not.toHaveBeenCalled();
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.store.curated",
      actorId: "admin1",
      targetType: "pluginStore",
      targetId: "store-1",
      targetLabel: "notes (Acme)",
      meta: { pluginId: "notes" },
    });
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("takes the release back for that store and plugin only, and audits it", async () => {
    expect(await setPluginCurated("store-1", "notes", false)).toEqual({
      ok: true,
    });
    expect(mockCuratedDeleteMany.mock.calls[0]?.[0]).toEqual({
      where: { storeId: "store-1", pluginId: "notes" },
    });
    expect(mockCuratedCreateMany).not.toHaveBeenCalled();
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      "plugin.store.uncurated",
    );
  });

  it("does nothing, quietly, when it is released already or was never", async () => {
    mockCuratedCreateMany.mockResolvedValue({ count: 0 });
    expect(await setPluginCurated("store-1", "notes", true)).toEqual({
      ok: true,
    });
    mockCuratedDeleteMany.mockResolvedValue({ count: 0 });
    expect(await setPluginCurated("store-1", "notes", false)).toEqual({
      ok: true,
    });
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
