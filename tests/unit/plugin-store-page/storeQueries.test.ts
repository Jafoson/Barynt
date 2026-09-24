import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// What the store page reads: the stores that are on, each read from its clone, what is
// installed, what the admin released, and the visibility as it really is. What matters:
// `plugin.manage` first and nothing read without it, a store that was not fetched says so,
// what is read ends up in the right place, and a database error is not turned into an empty
// store. The clones are real directories, the database is replaced.

const mockStoreFindMany = mock();
const mockPluginFindMany = mock();
const mockCuratedFindMany = mock();
const mockSettingsFindUnique = mock();
const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "admin1",
);

mock.module("@/lib/db", () => ({
  db: {
    pluginStore: { findMany: mockStoreFindMany },
    plugin: { findMany: mockPluginFindMany },
    pluginStoreCurated: { findMany: mockCuratedFindMany },
    systemSettings: { findUnique: mockSettingsFindUnique },
  },
}));
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PLATFORM: { scope: "platform" },
}));

import { getStoreCatalogView } from "@/features/plugins/storeQueries";
import { storeCloneDir } from "@/lib/plugins/store/paths";

let root: string;
let savedDir: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-storequery-"));
  savedDir = process.env.BARYNT_PLUGINS_DIR;
  process.env.BARYNT_PLUGINS_DIR = root;
  for (const m of [
    mockStoreFindMany,
    mockPluginFindMany,
    mockCuratedFindMany,
    mockSettingsFindUnique,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("admin1");
  mockStoreFindMany.mockResolvedValue([]);
  mockPluginFindMany.mockResolvedValue([]);
  mockCuratedFindMany.mockResolvedValue([]);
  mockSettingsFindUnique.mockResolvedValue(null);
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

/** A clone of a store with the given plugins, where the page looks for it. */
async function clone(key: string, ids: string[]) {
  const dir = storeCloneDir(root, key);
  await mkdir(join(dir, "plugins"), { recursive: true });
  await writeFile(
    join(dir, "store.json"),
    JSON.stringify({ schemaVersion: 1, id: "some-store", name: "Some store" }),
  );
  for (const id of ids) {
    const entry = join(dir, "plugins", id);
    await mkdir(entry, { recursive: true });
    await writeFile(
      join(entry, "barynt-plugin.json"),
      JSON.stringify({
        manifestVersion: 1,
        id,
        name: { en: `${id} EN`, de: `${id} DE` },
        version: "1.0.0",
        description: "A test plugin",
        author: "Someone",
        license: "MIT",
        categories: ["other"],
        barynt: "^0.1.0",
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

describe("who may look", () => {
  it("asks for plugin.manage in the platform context, first", async () => {
    await getStoreCatalogView("en");
    expect(mockRequirePermission.mock.calls[0]).toEqual([
      "plugin.manage",
      { scope: "platform" },
    ]);
  });

  it("reads nothing at all when the permission is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(getStoreCatalogView("en")).rejects.toThrow("not allowed");
    for (const m of [
      mockStoreFindMany,
      mockPluginFindMany,
      mockCuratedFindMany,
      mockSettingsFindUnique,
    ]) {
      expect(m).not.toHaveBeenCalled();
    }
  });
});

describe("what is put together", () => {
  it("lists the entries of a store from its clone, in the language asked for", async () => {
    await clone(KEY, ["notes", "board"]);
    mockStoreFindMany.mockResolvedValue([store()]);
    const de = await getStoreCatalogView("de");
    expect(de.catalog.entries.map((e) => [e.id, e.name, e.storeName])).toEqual([
      ["board", "board DE", "Official"],
      ["notes", "notes DE", "Official"],
    ]);
    expect(de.catalog.stores).toEqual([
      expect.objectContaining({ id: "store-1", error: null, errorCode: null }),
    ]);
    expect((await getStoreCatalogView("en")).catalog.entries[0]?.name).toBe(
      "board EN",
    );
  });

  it("asks only for the stores that are on, the official one first, with the columns it needs", async () => {
    await getStoreCatalogView("en");
    expect(mockStoreFindMany.mock.calls[0]?.[0]).toEqual({
      where: { enabled: true },
      orderBy: [{ official: "desc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        official: true,
        syncedAt: true,
        syncError: true,
      },
    });
  });

  it("reads each store from its own clone, and says of one that has none that it was not fetched", async () => {
    await clone(KEY, ["notes"]);
    mockStoreFindMany.mockResolvedValue([
      store(),
      store({
        id: "store-2",
        key: "example.com/acme/plugins",
        name: "Acme",
        official: false,
      }),
    ]);
    const view = await getStoreCatalogView("en");
    expect(view.catalog.entries.map((e) => e.key)).toEqual(["store-1/notes"]);
    expect(view.catalog.stores[1]).toMatchObject({
      id: "store-2",
      error: "The store has not been fetched yet.",
      errorCode: "not-fetched",
    });
  });

  it("passes on when each store was fetched and why the last try failed", async () => {
    await clone(KEY, ["notes"]);
    const when = new Date("2026-09-24T10:00:00Z");
    mockStoreFindMany.mockResolvedValue([
      store({ syncedAt: when, syncError: "The server answered 404." }),
    ]);
    const view = await getStoreCatalogView("en");
    expect(view.catalog.stores[0]).toMatchObject({
      syncedAt: when,
      syncError: "The server answered 404.",
    });
  });

  it("puts what is installed on the entries, and updates only from the store it came from", async () => {
    await clone(KEY, ["notes"]);
    mockStoreFindMany.mockResolvedValue([store()]);
    mockPluginFindMany.mockResolvedValue([
      { id: "notes", version: "0.9.0", origin: `https://${KEY}` },
    ]);
    const view = await getStoreCatalogView("en");
    expect(view.catalog.entries[0]?.installed).toEqual({
      version: "0.9.0",
      fromThisStore: true,
      update: "1.0.0",
    });
    expect(mockPluginFindMany.mock.calls[0]?.[0]).toEqual({
      select: { id: true, version: true, origin: true },
    });
  });

  it("says which plugins the admin released, as the store and the plugin", async () => {
    mockCuratedFindMany.mockResolvedValue([
      { storeId: "store-1", pluginId: "notes" },
      { storeId: "store-2", pluginId: "board" },
    ]);
    const view = await getStoreCatalogView("en");
    expect(view.released).toEqual(["store-1/notes", "store-2/board"]);
  });

  it("gives the visibility as it is set, and open when nothing was set", async () => {
    expect((await getStoreCatalogView("en")).visibility).toEqual({
      inWorkspaces: true,
      inProjects: true,
      curatedOnly: false,
    });
    mockSettingsFindUnique.mockResolvedValue({
      pluginStoreInWorkspaces: false,
      pluginStoreInProjects: true,
      pluginStoreCuratedOnly: true,
    });
    expect((await getStoreCatalogView("en")).visibility).toEqual({
      inWorkspaces: false,
      inProjects: true,
      curatedOnly: true,
    });
  });

  it("has no problem when the plugin directory is fine", async () => {
    expect((await getStoreCatalogView("en")).problem).toBeNull();
  });

  it("says why there is nothing to read when there is no usable plugin directory, and marks each store unreadable", async () => {
    process.env.BARYNT_PLUGINS_DIR = "relative/plugins";
    mockStoreFindMany.mockResolvedValue([store()]);
    const view = await getStoreCatalogView("en");
    expect(view.problem).toContain("absolute path");
    expect(view.catalog.entries).toEqual([]);
    expect(view.catalog.stores[0]).toMatchObject({
      error: "Plugins are off: there is no plugin directory.",
      errorCode: "unreadable",
    });
  });

  it("does not turn a database error into an empty store", async () => {
    mockPluginFindMany.mockRejectedValue(new Error("connection lost"));
    await expect(getStoreCatalogView("en")).rejects.toThrow("connection lost");
  });

  it("does not turn a visibility that cannot be read into the default", async () => {
    mockSettingsFindUnique.mockRejectedValue(new Error("database down"));
    await expect(getStoreCatalogView("en")).rejects.toThrow("database down");
  });
});
