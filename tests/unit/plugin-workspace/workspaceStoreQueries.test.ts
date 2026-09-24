import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// What the store page shows a workspace admin. What matters: `plugin.enable` in that workspace
// first, and nothing read without it; the store is only there where the platform gave workspaces
// one (a setting that cannot be read means none); only plugins that apply per workspace are
// listed, and where the platform asked for it only the ones it released; what the workspace has on
// counts as installed, what the platform has and the workspace has not is to be switched on, and an
// update is never offered; and nothing of a store's state is passed on but that it could not be
// read or updated. The clones are real directories, the database is replaced.

const mockStoreFindMany = mock();
const mockPluginFindMany = mock();
const mockCuratedFindMany = mock();
const mockWorkspaceRows = mock();
const mockSettingsFindUnique = mock();
const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "member1",
);

mock.module("@/lib/db", () => ({
  db: {
    pluginStore: { findMany: mockStoreFindMany },
    plugin: { findMany: mockPluginFindMany },
    pluginStoreCurated: { findMany: mockCuratedFindMany },
    pluginWorkspace: { findMany: mockWorkspaceRows },
    systemSettings: { findUnique: mockSettingsFindUnique },
  },
}));
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PLATFORM: { scope: "platform" },
}));

import { getWorkspaceStore } from "@/features/plugins/workspaceStoreQueries";
import { storeCloneDir } from "@/lib/plugins/store/paths";

let root: string;
let savedDir: string | undefined;

const OPEN = {
  pluginStoreInWorkspaces: true,
  pluginStoreInProjects: true,
  pluginStoreCuratedOnly: false,
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-wsstore-"));
  savedDir = process.env.BARYNT_PLUGINS_DIR;
  process.env.BARYNT_PLUGINS_DIR = root;
  for (const m of [
    mockStoreFindMany,
    mockPluginFindMany,
    mockCuratedFindMany,
    mockWorkspaceRows,
    mockSettingsFindUnique,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("member1");
  mockStoreFindMany.mockResolvedValue([store()]);
  mockPluginFindMany.mockResolvedValue([]);
  mockCuratedFindMany.mockResolvedValue([]);
  mockWorkspaceRows.mockResolvedValue([]);
  mockSettingsFindUnique.mockResolvedValue(OPEN);
});

afterEach(async () => {
  if (savedDir === undefined) delete process.env.BARYNT_PLUGINS_DIR;
  else process.env.BARYNT_PLUGINS_DIR = savedDir;
  await rm(root, { recursive: true, force: true });
});

const H = "d".repeat(128);
const KEY = "github.com/jafoson/barynt-plugin-store";
const store = (more: object = {}) => ({
  id: "store-1",
  key: KEY,
  name: "Official",
  official: true,
  syncedAt: null,
  syncError: null,
  ...more,
});

/** A clone of the store with plugins: `[id, scope]`. */
async function clone(
  plugins: [string, "workspace" | "platform" | "project"][],
  capabilities: string[] = [],
) {
  const dir = storeCloneDir(root, KEY);
  await mkdir(join(dir, "plugins"), { recursive: true });
  await writeFile(
    join(dir, "store.json"),
    JSON.stringify({ schemaVersion: 1, id: "some-store", name: "Some store" }),
  );
  for (const [id, scope] of plugins) {
    const entry = join(dir, "plugins", id);
    await mkdir(entry, { recursive: true });
    await writeFile(
      join(entry, "barynt-plugin.json"),
      JSON.stringify({
        manifestVersion: 1,
        id,
        name: id,
        version: "1.0.0",
        description: "A test plugin",
        author: "Someone",
        license: "MIT",
        categories: ["other"],
        barynt: "^0.1.0",
        scope,
        capabilities,
      }),
    );
    await writeFile(
      join(entry, "source.json"),
      JSON.stringify({
        versions: [
          { version: "1.0.0", download: `https://x.com/${id}.tgz`, sha512: H },
        ],
      }),
    );
  }
}

const installedRow = (id: string, version = "1.0.0") => ({
  id,
  version,
  origin: `https://${KEY}`,
});
const ids = async () =>
  (await getWorkspaceStore("ws-7", "en"))?.view.catalog.entries.map(
    (e) => e.id,
  );

describe("who may look", () => {
  it("asks for plugin.enable in this workspace, first, and never for plugin.manage", async () => {
    await getWorkspaceStore("ws-7", "en");
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.enable", { workspaceId: "ws-7" }],
    ]);
  });

  it("reads nothing at all when the permission is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(getWorkspaceStore("ws-7", "en")).rejects.toThrow(
      "not allowed",
    );
    for (const m of [
      mockStoreFindMany,
      mockPluginFindMany,
      mockCuratedFindMany,
      mockWorkspaceRows,
      mockSettingsFindUnique,
    ]) {
      expect(m).not.toHaveBeenCalled();
    }
  });
});

describe("whether the workspace has the store", () => {
  it("does not, when the platform switched it off for workspaces, and reads no store", async () => {
    await clone([["notes", "workspace"]]);
    mockSettingsFindUnique.mockResolvedValue({
      ...OPEN,
      pluginStoreInWorkspaces: false,
    });
    expect(await getWorkspaceStore("ws-7", "en")).toBeNull();
    expect(mockStoreFindMany).not.toHaveBeenCalled();
  });

  it("does not, when the setting cannot be read: nothing falls back to open", async () => {
    await clone([["notes", "workspace"]]);
    mockSettingsFindUnique.mockRejectedValue(new Error("database down"));
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await getWorkspaceStore("ws-7", "en")).toBeNull();
    } finally {
      quiet.mockRestore();
    }
  });

  it("does, by default, when the platform has set nothing", async () => {
    await clone([["notes", "workspace"]]);
    mockSettingsFindUnique.mockResolvedValue(null);
    expect(await ids()).toEqual(["notes"]);
  });

  it("does not, when plugins are off", async () => {
    process.env.BARYNT_PLUGINS_DIR = "relative/dir";
    expect(await getWorkspaceStore("ws-7", "en")).toBeNull();
  });
});

describe("which plugins are listed", () => {
  it("are the ones that apply per workspace: a plugin for the whole platform is not a workspace's to bring in", async () => {
    await clone([
      ["notes", "workspace"],
      ["audit", "platform"],
    ]);
    expect(await ids()).toEqual(["notes"]);
  });

  it("are not the ones that apply per project: those are added in a project", async () => {
    await clone([
      ["notes", "workspace"],
      ["board", "project"],
    ]);
    expect(await ids()).toEqual(["notes"]);
  });

  it("are all of them by default, and only the released ones where the platform asked for that", async () => {
    await clone([
      ["notes", "workspace"],
      ["wiki", "workspace"],
    ]);
    expect(await ids()).toEqual(["notes", "wiki"]);
    mockSettingsFindUnique.mockResolvedValue({
      ...OPEN,
      pluginStoreCuratedOnly: true,
    });
    mockCuratedFindMany.mockResolvedValue([
      { storeId: "store-1", pluginId: "wiki" },
    ]);
    expect(await ids()).toEqual(["wiki"]);
    mockCuratedFindMany.mockResolvedValue([]);
    expect(await ids()).toEqual([]);
  });

  it("does not take a release of the same plugin in another store for this one", async () => {
    await clone([["notes", "workspace"]]);
    mockSettingsFindUnique.mockResolvedValue({
      ...OPEN,
      pluginStoreCuratedOnly: true,
    });
    mockCuratedFindMany.mockResolvedValue([
      { storeId: "store-2", pluginId: "notes" },
    ]);
    expect(await ids()).toEqual([]);
  });
});

describe("what the workspace can do with each", () => {
  it("is nothing installed for a plugin the platform has not, and it is to be added", async () => {
    await clone([["notes", "workspace"]]);
    const result = await getWorkspaceStore("ws-7", "en");
    expect(result?.view.catalog.entries[0]?.installed).toBeNull();
    expect(result?.workspace).toEqual({ id: "ws-7", switchOn: [] });
  });

  it("is to be switched on, for a plugin the platform has and this workspace has not", async () => {
    await clone([["notes", "workspace"]]);
    mockPluginFindMany.mockResolvedValue([installedRow("notes")]);
    const result = await getWorkspaceStore("ws-7", "en");
    expect(result?.view.catalog.entries[0]?.installed).toBeNull();
    expect(result?.workspace.switchOn).toEqual(["notes"]);
  });

  it("is installed, for one this workspace has switched on", async () => {
    await clone([["notes", "workspace"]]);
    mockPluginFindMany.mockResolvedValue([installedRow("notes")]);
    mockWorkspaceRows.mockResolvedValue([{ pluginId: "notes" }]);
    const result = await getWorkspaceStore("ws-7", "en");
    expect(result?.view.catalog.entries[0]?.installed).toEqual({
      version: "1.0.0",
      fromThisStore: true,
      update: null,
      addedCapabilities: [],
    });
    expect(result?.workspace.switchOn).toEqual([]);
  });

  it("is never an update, and says nothing of what one would ask for: what is installed is updated by the platform", async () => {
    await clone([["notes", "workspace"]], ["issues:write"]);
    mockPluginFindMany.mockResolvedValue([installedRow("notes", "0.9.0")]);
    mockWorkspaceRows.mockResolvedValue([{ pluginId: "notes" }]);
    const result = await getWorkspaceStore("ws-7", "en");
    expect(result?.view.catalog.entries[0]?.installed).toEqual({
      version: "0.9.0",
      fromThisStore: true,
      update: null,
      addedCapabilities: [],
    });
  });

  it("is not a switch-on for a plugin that is on for a workspace and no longer on the platform", async () => {
    await clone([["notes", "workspace"]]);
    mockWorkspaceRows.mockResolvedValue([{ pluginId: "notes" }]);
    const result = await getWorkspaceStore("ws-7", "en");
    expect(result?.view.catalog.entries[0]?.installed).toBeNull();
    expect(result?.workspace.switchOn).toEqual([]);
  });

  it("asks which plugins are on for this workspace, and only those", async () => {
    await getWorkspaceStore("ws-7", "en");
    expect(mockWorkspaceRows).toHaveBeenCalledWith({
      where: { workspaceId: "ws-7", enabled: true },
      select: { pluginId: true },
    });
  });
});

describe("what is passed on of the stores", () => {
  it("is their names and when they were fetched, and that one could not be read or updated, and not why", async () => {
    await clone([["notes", "workspace"]]);
    const when = new Date("2026-09-24T10:00:00Z");
    mockStoreFindMany.mockResolvedValue([
      store({
        syncedAt: when,
        syncError: "The server answered 404. /secret/path",
      }),
      store({
        id: "store-2",
        key: "example.com/acme/plugins",
        name: "Acme",
        official: false,
      }),
    ]);
    const result = await getWorkspaceStore("ws-7", "en");
    expect(result?.view.catalog.stores).toEqual([
      {
        id: "store-1",
        name: "Official",
        official: true,
        error: null,
        errorCode: null,
        syncedAt: when,
        syncError: "failed",
        problems: [],
      },
      {
        id: "store-2",
        name: "Acme",
        official: false,
        error: "unavailable",
        errorCode: "not-fetched",
        syncedAt: null,
        syncError: null,
        problems: [],
      },
    ]);
    const text = JSON.stringify(result);
    expect(text).not.toContain("/secret/path");
    expect(text).not.toContain("The server answered");
    expect(text).not.toContain("has not been fetched");
    expect(text).not.toContain(root);
  });

  it("does not carry the platform's own words for why plugins are off, or which plugins the platform released", async () => {
    await clone([["notes", "workspace"]]);
    mockCuratedFindMany.mockResolvedValue([
      { storeId: "store-1", pluginId: "notes" },
    ]);
    const result = await getWorkspaceStore("ws-7", "en");
    expect(result?.view.problem).toBeNull();
    expect(result?.view.released).toEqual([]);
  });

  it("does not carry which entries of a store cannot be used, which is the platform's to fix", async () => {
    await clone([["notes", "workspace"]]);
    await rm(join(storeCloneDir(root, KEY), "plugins", "notes", "source.json"));
    await clone([["wiki", "workspace"]]);
    const result = await getWorkspaceStore("ws-7", "en");
    expect(result?.view.catalog.entries.map((e) => e.id)).toEqual(["wiki"]);
    expect(result?.view.catalog.stores[0]?.problems).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("source.json");
  });

  it("passes on what the platform set, as it is", async () => {
    await clone([["notes", "workspace"]]);
    expect((await getWorkspaceStore("ws-7", "en"))?.view.visibility).toEqual({
      inWorkspaces: true,
      inProjects: true,
      curatedOnly: false,
    });
    mockSettingsFindUnique.mockResolvedValue({
      ...OPEN,
      pluginStoreCuratedOnly: true,
      pluginStoreInProjects: false,
    });
    mockCuratedFindMany.mockResolvedValue([
      { storeId: "store-1", pluginId: "notes" },
    ]);
    expect((await getWorkspaceStore("ws-7", "en"))?.view.visibility).toEqual({
      inWorkspaces: true,
      inProjects: false,
      curatedOnly: true,
    });
  });

  it("says a store that is not a store cannot be read, without saying what is wrong with it", async () => {
    const dir = storeCloneDir(root, KEY);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "store.json"), "{}");
    const result = await getWorkspaceStore("ws-7", "en");
    expect(result?.view.catalog.stores[0]).toMatchObject({
      error: "unavailable",
      errorCode: "unreadable",
    });
    expect(JSON.stringify(result)).not.toContain("Not a store");
  });
});
