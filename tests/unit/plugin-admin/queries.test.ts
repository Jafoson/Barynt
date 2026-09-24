import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// What the plugins page reads: the installed plugins, in how many workspaces each is
// on, what lies in the plugin directory, what the registry says, which stores are on
// and whether plugins from no store are allowed. What matters: only `plugin.manage`,
// asked first and by the query itself, nothing is read for someone who may not, and
// what is read ends up in the right place. The plugin directory is real, the rest is
// replaced.

const mockPluginFindMany = mock();
const mockGroupBy = mock();
const mockStoreFindMany = mock();
const mockSettingsFindUnique = mock();
const mockRegistryGet = mock();
const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "admin1",
);

mock.module("@/lib/db", () => ({
  db: {
    plugin: { findMany: mockPluginFindMany },
    pluginWorkspace: { groupBy: mockGroupBy },
    pluginStore: { findMany: mockStoreFindMany },
    systemSettings: { findUnique: mockSettingsFindUnique },
  },
}));
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PLATFORM: { scope: "platform" },
}));
mock.module("@/lib/plugins/host", () => ({
  getPluginRegistry: () => ({ get: mockRegistryGet }),
}));

import { getPluginsOverview } from "@/features/plugins/queries";
import { hashPluginDirectory } from "@/lib/plugins/integrity";
import { OFFICIAL_STORE_URL } from "@/lib/plugins/policy";

let root: string;
let savedDir: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-overview-"));
  savedDir = process.env.BARYNT_PLUGINS_DIR;
  process.env.BARYNT_PLUGINS_DIR = root;
  for (const m of [
    mockPluginFindMany,
    mockGroupBy,
    mockStoreFindMany,
    mockSettingsFindUnique,
    mockRegistryGet,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("admin1");
  mockPluginFindMany.mockResolvedValue([]);
  mockGroupBy.mockResolvedValue([]);
  mockStoreFindMany.mockResolvedValue([{ url: OFFICIAL_STORE_URL }]);
  mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: false });
  mockRegistryGet.mockResolvedValue({
    dir: root,
    problem: null,
    discoveryIssues: [],
    plugins: [],
    active: [],
  });
});

afterEach(async () => {
  if (savedDir === undefined) delete process.env.BARYNT_PLUGINS_DIR;
  else process.env.BARYNT_PLUGINS_DIR = savedDir;
  await rm(root, { recursive: true, force: true });
});

async function put(id: string, version: string, more: object = {}) {
  const dir = join(root, id, version);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "barynt-plugin.json"),
    JSON.stringify({
      manifestVersion: 1,
      id,
      name: id,
      version,
      description: "A test plugin",
      author: "Someone",
      license: "MIT",
      categories: ["other"],
      barynt: "^0.1.0",
      ...more,
    }),
  );
  const hashed = await hashPluginDirectory(dir);
  if (!hashed.ok) throw new Error(hashed.issue);
  return hashed.digest;
}

describe("who may look", () => {
  it("asks for plugin.manage in the platform context, first", async () => {
    await getPluginsOverview("en");
    expect(mockRequirePermission.mock.calls[0]).toEqual([
      "plugin.manage",
      { scope: "platform" },
    ]);
  });

  it("reads nothing at all when the permission is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(getPluginsOverview("en")).rejects.toThrow("not allowed");
    for (const m of [
      mockPluginFindMany,
      mockGroupBy,
      mockStoreFindMany,
      mockSettingsFindUnique,
      mockRegistryGet,
    ]) {
      expect(m).not.toHaveBeenCalled();
    }
  });
});

describe("what is put together", () => {
  it("shows an installed plugin with its manifest, its workspaces and the registry's word", async () => {
    const hash = await put("calendar", "1.0.0", {
      name: { en: "Calendar", de: "Kalender" },
      server: "server.js",
    });
    mockPluginFindMany.mockResolvedValue([
      {
        id: "calendar",
        version: "1.0.0",
        status: "ENABLED",
        source: "STORE",
        scope: "WORKSPACE",
        origin: OFFICIAL_STORE_URL,
        integrity: hash,
        codeApprovalHash: hash,
      },
    ]);
    mockGroupBy.mockResolvedValue([
      { pluginId: "calendar", _count: { _all: 4 } },
    ]);
    mockRegistryGet.mockResolvedValue({
      dir: root,
      problem: null,
      discoveryIssues: [],
      plugins: [
        {
          id: "calendar",
          status: { state: "loaded", mode: "in-process" },
        },
      ],
      active: [],
    });
    const overview = await getPluginsOverview("de");
    expect(overview.installed).toHaveLength(1);
    expect(overview.installed[0]).toMatchObject({
      id: "calendar",
      name: "Kalender",
      workspaces: 4,
      state: { kind: "running", mode: "in-process" },
      approval: { kind: "approved" },
      integrity: hash,
    });
  });

  it("asks only for the columns the page needs, and counts only workspaces that have it on", async () => {
    await getPluginsOverview("en");
    expect(mockPluginFindMany.mock.calls[0]?.[0].select).toEqual({
      id: true,
      version: true,
      status: true,
      source: true,
      scope: true,
      origin: true,
      integrity: true,
      codeApprovalHash: true,
    });
    expect(mockGroupBy.mock.calls[0]?.[0]).toEqual({
      by: ["pluginId"],
      where: { enabled: true },
      _count: { _all: true },
    });
  });

  it("offers what lies in the directory and is not installed", async () => {
    await put("notes", "1.0.0");
    await put("notes", "1.2.0");
    const overview = await getPluginsOverview("en");
    expect(overview.available.map((p) => [p.id, p.version])).toEqual([
      ["notes", "1.2.0"],
    ]);
    expect(overview.dir).toBe(root);
  });

  it("offers an update for a plugin from the directory, from what lies there", async () => {
    const hash = await put("notes", "1.0.0");
    await put("notes", "1.1.0");
    mockPluginFindMany.mockResolvedValue([
      {
        id: "notes",
        version: "1.0.0",
        status: "ENABLED",
        source: "DIRECTORY",
        scope: "WORKSPACE",
        origin: null,
        integrity: hash,
        codeApprovalHash: null,
      },
    ]);
    const overview = await getPluginsOverview("en");
    expect(overview.installed[0]?.update).toBe("1.1.0");
    expect(overview.available).toEqual([]);
  });

  it("says whether plugins from no store are allowed", async () => {
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: true });
    expect((await getPluginsOverview("en")).allowUnsigned).toBe(true);
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: false });
    expect((await getPluginsOverview("en")).allowUnsigned).toBe(false);
  });

  it("judges the code of an installed plugin against the stores that are on", async () => {
    const hash = await put("calendar", "1.0.0", { server: "server.js" });
    mockPluginFindMany.mockResolvedValue([
      {
        id: "calendar",
        version: "1.0.0",
        status: "ENABLED",
        source: "STORE",
        scope: "WORKSPACE",
        origin: OFFICIAL_STORE_URL,
        integrity: hash,
        codeApprovalHash: null,
      },
    ]);
    expect((await getPluginsOverview("en")).installed[0]?.approval).toEqual({
      kind: "open",
    });
    mockStoreFindMany.mockResolvedValue([]);
    expect((await getPluginsOverview("en")).installed[0]?.approval).toEqual({
      kind: "refused",
      reason: "store-not-active",
    });
  });

  it("carries the registry's problem and the directory's issues to the page", async () => {
    mockRegistryGet.mockResolvedValue({
      dir: root,
      problem: "The plugins could not be loaded: database down",
      discoveryIssues: ["backup: is not a plugin"],
      plugins: [],
      active: [],
    });
    const overview = await getPluginsOverview("en");
    expect(overview.problem).toBe(
      "The plugins could not be loaded: database down",
    );
    expect(overview.issues).toEqual(["backup: is not a plugin"]);
  });

  it("offers nothing, and does not throw, when there is no usable plugin directory", async () => {
    process.env.BARYNT_PLUGINS_DIR = "relative/plugins";
    mockRegistryGet.mockResolvedValue({
      dir: null,
      problem: "BARYNT_PLUGINS_DIR must be an absolute path",
      discoveryIssues: [],
      plugins: [],
      active: [],
    });
    const overview = await getPluginsOverview("en");
    expect(overview.dir).toBeNull();
    expect(overview.available).toEqual([]);
    expect(overview.problem).toContain("absolute path");
  });

  it("does not turn a database error into an empty page", async () => {
    mockPluginFindMany.mockRejectedValue(new Error("connection lost"));
    await expect(getPluginsOverview("en")).rejects.toThrow("connection lost");
  });
});
