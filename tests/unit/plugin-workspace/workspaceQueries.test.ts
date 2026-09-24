import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// What a workspace's plugins page reads. What matters: only `plugin.enable` **in that workspace**,
// asked first and by the query itself (not `plugin.manage`, which a workspace admin does not have),
// nothing is read for someone who may not, which plugins are on is this workspace's and no other's,
// and nothing that is the platform's (the plugin directory's path, a hash) is passed on. The plugin
// directory is real, the rest is replaced.

const mockPluginFindMany = mock();
const mockGroupBy = mock();
const mockWorkspaceRows = mock();
const mockStoreFindMany = mock();
const mockSettingsFindUnique = mock();
const mockRegistryGet = mock();
const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "member1",
);

mock.module("@/lib/db", () => ({
  db: {
    plugin: { findMany: mockPluginFindMany },
    pluginWorkspace: { groupBy: mockGroupBy, findMany: mockWorkspaceRows },
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

import { getWorkspacePlugins } from "@/features/plugins/workspaceQueries";
import { hashPluginDirectory } from "@/lib/plugins/integrity";
import { OFFICIAL_STORE_URL } from "@/lib/plugins/policy";

let root: string;
let savedDir: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-wsplugins-"));
  savedDir = process.env.BARYNT_PLUGINS_DIR;
  process.env.BARYNT_PLUGINS_DIR = root;
  for (const m of [
    mockPluginFindMany,
    mockGroupBy,
    mockWorkspaceRows,
    mockStoreFindMany,
    mockSettingsFindUnique,
    mockRegistryGet,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("member1");
  mockPluginFindMany.mockResolvedValue([]);
  mockGroupBy.mockResolvedValue([]);
  mockWorkspaceRows.mockResolvedValue([]);
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

const row = (id: string, hash: string, more: object = {}) => ({
  id,
  version: "1.0.0",
  status: "ENABLED",
  source: "STORE",
  scope: "WORKSPACE",
  origin: OFFICIAL_STORE_URL,
  integrity: hash,
  codeApprovalHash: null,
  ...more,
});

describe("who may look", () => {
  it("asks for plugin.enable in the workspace it is asked for, first, and never for plugin.manage", async () => {
    await getWorkspacePlugins("ws-7", "en");
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.enable", { workspaceId: "ws-7" }],
    ]);
  });

  it("reads nothing at all when the permission is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(getWorkspacePlugins("ws-7", "en")).rejects.toThrow(
      "not allowed",
    );
    for (const m of [
      mockPluginFindMany,
      mockGroupBy,
      mockWorkspaceRows,
      mockStoreFindMany,
      mockSettingsFindUnique,
      mockRegistryGet,
    ]) {
      expect(m).not.toHaveBeenCalled();
    }
  });
});

describe("what is put together", () => {
  it("asks which plugins are on for this workspace, and only for those that are on", async () => {
    await getWorkspacePlugins("ws-7", "en");
    expect(mockWorkspaceRows).toHaveBeenCalledWith({
      where: { workspaceId: "ws-7", enabled: true },
      select: { pluginId: true },
    });
  });

  it("shows the plugins of the platform and which of them this workspace has on", async () => {
    const notes = await put("notes", "1.0.0");
    const wiki = await put("wiki", "1.0.0");
    mockPluginFindMany.mockResolvedValue([
      row("notes", notes),
      row("wiki", wiki),
    ]);
    mockWorkspaceRows.mockResolvedValue([{ pluginId: "wiki" }]);
    mockRegistryGet.mockResolvedValue({
      dir: root,
      problem: null,
      discoveryIssues: [],
      plugins: [
        { id: "notes", status: { state: "idle" } },
        { id: "wiki", status: { state: "loaded", mode: "declarative" } },
      ],
      active: [],
    });
    const view = await getWorkspacePlugins("ws-7", "en");
    expect(view.plugins.map((p) => [p.id, p.on, p.blocker])).toEqual([
      ["notes", false, null],
      ["wiki", true, null],
    ]);
    expect(view.available).toBe(true);
  });

  it("says a plugin with code needs the platform's approval, from what the platform has approved", async () => {
    const hash = await put("calendar", "1.0.0", { server: "server.js" });
    mockPluginFindMany.mockResolvedValue([row("calendar", hash)]);
    mockRegistryGet.mockResolvedValue({
      dir: root,
      problem: null,
      discoveryIssues: [],
      plugins: [
        {
          id: "calendar",
          status: { state: "blocked", reason: "not-approved" },
        },
      ],
      active: [],
    });
    let view = await getWorkspacePlugins("ws-7", "en");
    expect(view.plugins[0]).toMatchObject({
      on: false,
      blocker: "needs-approval",
      hasCode: true,
    });
    mockPluginFindMany.mockResolvedValue([
      row("calendar", hash, { codeApprovalHash: hash }),
    ]);
    mockRegistryGet.mockResolvedValue({
      dir: root,
      problem: null,
      discoveryIssues: [],
      plugins: [{ id: "calendar", status: { state: "idle" } }],
      active: [],
    });
    view = await getWorkspacePlugins("ws-7", "en");
    expect(view.plugins[0]).toMatchObject({ blocker: null });
  });

  it("says a plugin from no store that has code cannot run, whatever the setting says, without reading it", async () => {
    const hash = await put("tool", "1.0.0", { server: "server.js" });
    mockPluginFindMany.mockResolvedValue([
      row("tool", hash, { source: "DIRECTORY", origin: null }),
    ]);
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: true });
    const view = await getWorkspacePlugins("ws-7", "en");
    expect(view.plugins[0]).toMatchObject({
      fromStore: false,
      hasCode: true,
      blocker: "cannot-run",
    });
    expect(mockRequirePermission).toHaveBeenCalledTimes(1);
    expect(mockSettingsFindUnique).not.toHaveBeenCalled();
  });

  it("gives the words of a plugin in the language it is asked for", async () => {
    const hash = await put("notes", "1.0.0", {
      name: { en: "Notes", de: "Notizen" },
    });
    mockPluginFindMany.mockResolvedValue([row("notes", hash)]);
    expect((await getWorkspacePlugins("ws-7", "de")).plugins[0]?.name).toBe(
      "Notizen",
    );
    expect((await getWorkspacePlugins("ws-7", "en")).plugins[0]?.name).toBe(
      "Notes",
    );
  });

  it("passes on nothing that is the platform's: not the directory's path, not a hash", async () => {
    const hash = await put("notes", "1.0.0");
    mockPluginFindMany.mockResolvedValue([row("notes", hash)]);
    const view = await getWorkspacePlugins("ws-7", "en");
    const text = JSON.stringify(view);
    expect(text).not.toContain(root);
    expect(text).not.toContain(hash);
  });

  it("says plugins are not available when the platform reads none", async () => {
    process.env.BARYNT_PLUGINS_DIR = "relative/dir";
    mockRegistryGet.mockResolvedValue({
      dir: null,
      problem: "BARYNT_PLUGINS_DIR must be an absolute path",
      discoveryIssues: [],
      plugins: [],
      active: [],
    });
    const view = await getWorkspacePlugins("ws-7", "en");
    expect(view).toEqual({ available: false, plugins: [], platform: [] });
  });
});
