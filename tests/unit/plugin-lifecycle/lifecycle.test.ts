import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A plugin's life on the platform: installed, updated, switched off, uninstalled.
// What matters: only `plugin.manage`, the source of a plugin is never the client's
// word, a plugin from no store needs the setting and a yes for each install and
// update, what is read from the directory is checked, a change that would break
// another plugin is refused, a race writes nothing, and every change is audited and
// told to the registry. The plugin directory is real, the database is not.

const mockPluginFindUnique = mock();
const mockPluginFindMany = mock();
const mockPluginCreate = mock();
const mockPluginUpdateMany = mock();
const mockPluginUpdate = mock();
const mockPluginDelete = mock();
const mockWorkspaceCount = mock();
const mockSettingsFindUnique = mock();
const mockAuditCreate = mock();
const mockRevalidate = mock();
const mockRegistryGet = mock();

mock.module("@/lib/db", () => ({
  db: {
    plugin: {
      findUnique: mockPluginFindUnique,
      findMany: mockPluginFindMany,
      create: mockPluginCreate,
      updateMany: mockPluginUpdateMany,
      update: mockPluginUpdate,
      delete: mockPluginDelete,
    },
    pluginWorkspace: { count: mockWorkspaceCount },
    systemSettings: { findUnique: mockSettingsFindUnique },
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
// The real registry has its own tests (`tests/unit/plugin-host`), and this file's
// process is not theirs: what it needs is the running plugins, as the registry says.
mock.module("@/lib/plugins/host", () => ({
  getPluginRegistry: () => ({ get: mockRegistryGet }),
}));

import {
  installPlugin,
  setPluginStatus,
  uninstallPlugin,
  updatePlugin,
} from "@/features/plugins/lifecycleActions";
import { hashPluginDirectory } from "@/lib/plugins/integrity";
import { getRegistryState } from "@/lib/plugins/registryState";

const state = getRegistryState();
const FAKE = {
  builtAt: 0,
  dir: "/plugins",
  problem: null,
  discoveryIssues: [],
  plugins: [],
  active: [],
};

let root: string;
let savedDir: string | undefined;

type Scope = "WORKSPACE" | "PLATFORM";
interface Row {
  id: string;
  version: string;
  scope: Scope;
  source?: string;
  integrity?: string;
  codeApprovalHash?: string | null;
  status?: string;
}
/** What is installed, as the resolver's query gives it. */
let installedRows: Row[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-lifecycle-"));
  savedDir = process.env.BARYNT_PLUGINS_DIR;
  process.env.BARYNT_PLUGINS_DIR = root;
  installedRows = [];
  for (const m of [
    mockPluginFindUnique,
    mockPluginFindMany,
    mockPluginCreate,
    mockPluginUpdateMany,
    mockPluginUpdate,
    mockPluginDelete,
    mockWorkspaceCount,
    mockSettingsFindUnique,
    mockAuditCreate,
    mockRevalidate,
    mockRequirePermission,
    mockRegistryGet,
  ]) {
    m.mockReset();
  }
  mockRegistryGet.mockResolvedValue({ plugins: [], active: [], problem: null });
  mockRequirePermission.mockResolvedValue("admin1");
  mockPluginFindUnique.mockResolvedValue(null);
  mockPluginFindMany.mockImplementation(async () => installedRows);
  mockPluginCreate.mockResolvedValue({});
  mockPluginUpdateMany.mockResolvedValue({ count: 1 });
  mockPluginUpdate.mockResolvedValue({});
  mockPluginDelete.mockResolvedValue({});
  mockWorkspaceCount.mockResolvedValue(0);
  // Plugins from no store are allowed: the case these actions are for.
  mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: true });
  mockAuditCreate.mockResolvedValue({});
  state.snapshot = FAKE;
  state.generation = 0;
});

afterEach(async () => {
  if (savedDir === undefined) delete process.env.BARYNT_PLUGINS_DIR;
  else process.env.BARYNT_PLUGINS_DIR = savedDir;
  await rm(root, { recursive: true, force: true });
});

/** Writes one plugin version into the directory and gives its hash. */
async function put(
  id: string,
  version: string,
  more: {
    manifest?: Record<string, unknown>;
    files?: Record<string, string>;
    rawManifest?: string;
  } = {},
): Promise<string> {
  const dir = join(root, id, version);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "barynt-plugin.json"),
    more.rawManifest ??
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
        server: "server.js",
        ...more.manifest,
      }),
  );
  for (const [name, text] of Object.entries(
    more.files ?? { "server.js": "export default {};" },
  )) {
    await writeFile(join(dir, name), text);
  }
  const hashed = await hashPluginDirectory(dir);
  if (!hashed.ok) throw new Error(hashed.issue);
  return hashed.digest;
}

/** The plugin is in the directory and installed, from the directory. */
async function installed(
  id: string,
  version: string,
  more: {
    scope?: Scope;
    source?: string;
    codeApprovalHash?: string | null;
    manifest?: Record<string, unknown>;
  } = {},
): Promise<Row> {
  const scope = more.scope ?? "WORKSPACE";
  const integrity = await put(id, version, {
    manifest: {
      scope: scope === "PLATFORM" ? "platform" : "workspace",
      ...more.manifest,
    },
  });
  const row: Row = {
    id,
    version,
    scope,
    source: more.source ?? "DIRECTORY",
    integrity,
    codeApprovalHash: more.codeApprovalHash ?? null,
    status: "ENABLED",
  };
  installedRows.push(row);
  mockPluginFindUnique.mockImplementation(
    async (args: { where: { id: string } }) =>
      installedRows.find((r) => r.id === args.where.id) ?? null,
  );
  return row;
}

/** Nothing was written, audited or told to the cache or the registry. */
function untouched(): boolean {
  return (
    [
      mockPluginCreate,
      mockPluginUpdateMany,
      mockPluginUpdate,
      mockPluginDelete,
      mockAuditCreate,
      mockRevalidate,
    ].every((m) => m.mock.calls.length === 0) &&
    state.snapshot === FAKE &&
    state.generation === 0
  );
}

const yes = { acknowledged: true };
const errorOf = (result: unknown) => (result as { error: string }).error;

describe("who may", () => {
  it("asks for plugin.manage in the platform context, for each action", async () => {
    await put("calendar", "1.0.0");
    await installPlugin("calendar", "1.0.0", yes);
    await installed("notes", "1.0.0");
    await put("notes", "1.1.0");
    await updatePlugin("notes", "1.1.0", yes);
    await setPluginStatus("notes", false);
    await uninstallPlugin("notes");
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.manage", { scope: "platform" }],
      ["plugin.manage", { scope: "platform" }],
      ["plugin.manage", { scope: "platform" }],
      ["plugin.manage", { scope: "platform" }],
    ]);
  });

  it("does nothing at all when the permission is refused", async () => {
    await put("calendar", "1.0.0");
    await installed("notes", "1.0.0");
    await put("notes", "1.1.0");
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(installPlugin("calendar", "1.0.0", yes)).rejects.toThrow(
      "not allowed",
    );
    await expect(updatePlugin("notes", "1.1.0", yes)).rejects.toThrow();
    await expect(uninstallPlugin("notes")).rejects.toThrow();
    await expect(setPluginStatus("notes", false)).rejects.toThrow();
    expect(untouched()).toBe(true);
    expect(mockPluginFindUnique).not.toHaveBeenCalled();
    expect(mockSettingsFindUnique).not.toHaveBeenCalled();
  });
});

describe("what is asked for", () => {
  it.each([
    ["a path", "../etc"],
    ["a path down", "a/b"],
    ["capitals", "Calendar"],
    ["a single letter", "a"],
    ["no text", 42],
    ["nothing", undefined],
    ["an empty id", ""],
  ])("is refused as an id with %s", async (_name, id) => {
    const install = await installPlugin(id as string, "1.0.0", yes);
    const update = await updatePlugin(id as string, "1.0.1", yes);
    const uninstall = await uninstallPlugin(id as string);
    const status = await setPluginStatus(id as string, false);
    for (const result of [install, update, uninstall, status]) {
      expect(result).toEqual({ error: "Invalid request." });
    }
    expect(mockPluginFindUnique).not.toHaveBeenCalled();
    expect(untouched()).toBe(true);
  });

  it.each([
    ["a path", "../1.0.0"],
    ["not a version", "1.0"],
    ["a range", "^1.0.0"],
    ["latest", "latest"],
    ["no text", 1],
    ["nothing", undefined],
  ])("is refused as a version with %s", async (_name, version) => {
    expect(await installPlugin("calendar", version as string, yes)).toEqual({
      error: "Invalid request.",
    });
    expect(await updatePlugin("calendar", version as string, yes)).toEqual({
      error: "Invalid request.",
    });
    expect(mockPluginFindUnique).not.toHaveBeenCalled();
    expect(untouched()).toBe(true);
  });

  it.each([
    ["the text true", "true"],
    ["1", 1],
    ["null", null],
    ["an object", {}],
  ])("is refused as the switch with %s", async (_name, on) => {
    await installed("calendar", "1.0.0");
    expect(await setPluginStatus("calendar", on as boolean)).toEqual({
      error: "Invalid request.",
    });
    expect(untouched()).toBe(true);
  });
});

describe("installing", () => {
  it("adds a plugin from the directory, switched on, with the hash of its files", async () => {
    const hash = await put("calendar", "1.0.0");
    expect(await installPlugin("calendar", "1.0.0", yes)).toEqual({ ok: true });
    expect(mockPluginCreate).toHaveBeenCalledTimes(1);
    expect(mockPluginCreate.mock.calls[0]?.[0]).toEqual({
      data: {
        id: "calendar",
        version: "1.0.0",
        status: "ENABLED",
        source: "DIRECTORY",
        scope: "WORKSPACE",
        origin: null,
        integrity: hash,
      },
    });
  });

  it("takes where the plugin applies from its manifest", async () => {
    await put("everywhere", "1.0.0", { manifest: { scope: "platform" } });
    await installPlugin("everywhere", "1.0.0", yes);
    expect(mockPluginCreate.mock.calls[0]?.[0].data.scope).toBe("PLATFORM");
    // No `scope` in a manifest means per workspace.
    await put("chosen", "1.0.0");
    await installPlugin("chosen", "1.0.0", yes);
    expect(mockPluginCreate.mock.calls[1]?.[0].data.scope).toBe("WORKSPACE");
  });

  it("never lets the client say where a plugin came from", async () => {
    await put("calendar", "1.0.0");
    const cheating = {
      acknowledged: true,
      source: "STORE",
      origin: "https://store.barynt.dev/",
      integrity: `sha512-${"B".repeat(86)}==`,
      status: "DISABLED",
      codeApprovalHash: "x",
    };
    await installPlugin("calendar", "1.0.0", cheating);
    const data = mockPluginCreate.mock.calls[0]?.[0].data;
    expect(data.source).toBe("DIRECTORY");
    expect(data.origin).toBeNull();
    expect(data.integrity).not.toBe(cheating.integrity);
    expect(data.status).toBe("ENABLED");
    expect(data).not.toHaveProperty("codeApprovalHash");
  });

  it("gives the plugin no approval to run its code", async () => {
    await put("calendar", "1.0.0");
    await installPlugin("calendar", "1.0.0", yes);
    const data = mockPluginCreate.mock.calls[0]?.[0].data;
    expect(data).not.toHaveProperty("codeApprovalHash");
    expect(data).not.toHaveProperty("codeApprovedAt");
  });

  it("audits who did it, what and which files, and tells the registry and the cache", async () => {
    const hash = await put("calendar", "1.0.0");
    await installPlugin("calendar", "1.0.0", yes);
    expect(mockAuditCreate.mock.calls).toHaveLength(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.installed",
      actorId: "admin1",
      targetType: "plugin",
      targetId: "calendar",
      targetLabel: "calendar@1.0.0",
      meta: {
        version: "1.0.0",
        source: "DIRECTORY",
        scope: "WORKSPACE",
        hash,
      },
    });
    expect(state.snapshot).toBeNull();
    expect(state.generation).toBe(1);
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("is refused when the plugin is installed already, and says which version", async () => {
    await installed("calendar", "1.0.0");
    await put("calendar", "1.1.0");
    const result = await installPlugin("calendar", "1.1.0", yes);
    expect(errorOf(result)).toContain("installed already (1.0.0)");
    expect(errorOf(result)).toContain("Update it instead");
    expect(untouched()).toBe(true);
  });

  it("is refused, with nothing written, when two admins install it at the same moment", async () => {
    await put("calendar", "1.0.0");
    mockPluginCreate.mockRejectedValue(
      Object.assign(new Error("Unique constraint"), { code: "P2002" }),
    );
    const result = await installPlugin("calendar", "1.0.0", yes);
    expect(errorOf(result)).toContain("installed already");
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(state.snapshot).toBe(FAKE);
  });

  it("does not swallow any other error from the database", async () => {
    await put("calendar", "1.0.0");
    mockPluginCreate.mockRejectedValue(new Error("connection lost"));
    await expect(installPlugin("calendar", "1.0.0", yes)).rejects.toThrow(
      "connection lost",
    );
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe("a plugin from no store", () => {
  it("is refused while the platform does not allow such plugins, however sure the admin is", async () => {
    await put("calendar", "1.0.0");
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: false });
    const result = await installPlugin("calendar", "1.0.0", yes);
    expect(errorOf(result)).toContain("Plugins from no store are not allowed");
    expect(untouched()).toBe(true);
  });

  it.each([
    ["no row", null],
    ["a row without the column", {}],
    ["a column that is not true", { allowUnsignedPlugins: "true" }],
  ])("is refused when the setting is %s", async (_name, row) => {
    await put("calendar", "1.0.0");
    mockSettingsFindUnique.mockResolvedValue(row);
    expect(errorOf(await installPlugin("calendar", "1.0.0", yes))).toContain(
      "no store",
    );
    expect(untouched()).toBe(true);
  });

  it("is refused when the setting cannot be read", async () => {
    await put("calendar", "1.0.0");
    mockSettingsFindUnique.mockRejectedValue(new Error("database down"));
    const original = console.error;
    console.error = () => {};
    try {
      expect(errorOf(await installPlugin("calendar", "1.0.0", yes))).toContain(
        "no store",
      );
    } finally {
      console.error = original;
    }
    expect(untouched()).toBe(true);
  });

  it.each([
    ["nothing", undefined],
    ["no input", "none"],
    ["false", false],
    ["the text true", "true"],
    ["1", 1],
    ["null", null],
    ["an object", {}],
  ])("needs the risk acknowledged, and %s is not that", async (_name, ack) => {
    await put("calendar", "1.0.0");
    await installed("notes", "1.0.0");
    await put("notes", "1.1.0");
    const install =
      ack === "none"
        ? await installPlugin("calendar", "1.0.0")
        : await installPlugin("calendar", "1.0.0", {
            acknowledged: ack as boolean,
          });
    const update =
      ack === "none"
        ? await updatePlugin("notes", "1.1.0")
        : await updatePlugin("notes", "1.1.0", {
            acknowledged: ack as boolean,
          });
    for (const result of [install, update]) {
      expect(errorOf(result)).toContain("at your own risk");
    }
    expect(untouched()).toBe(true);
  });

  it("is asked for each time: the setting does not stand in for it", async () => {
    await put("calendar", "1.0.0");
    await put("notes", "1.0.0");
    expect(await installPlugin("calendar", "1.0.0", yes)).toEqual({ ok: true });
    expect(errorOf(await installPlugin("notes", "1.0.0"))).toContain(
      "at your own risk",
    );
    expect(mockPluginCreate).toHaveBeenCalledTimes(1);
  });

  it("is checked before the directory is read", async () => {
    // Nothing of a plugin is looked at for someone who may not install it.
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: false });
    await put("calendar", "1.0.0");
    await rm(root, { recursive: true, force: true });
    expect(errorOf(await installPlugin("calendar", "1.0.0", yes))).toContain(
      "no store",
    );
  });
});

describe("what is read from the directory", () => {
  it("is refused when there is no such plugin", async () => {
    const result = await installPlugin("calendar", "1.0.0", yes);
    expect(errorOf(result)).toBe(
      "There is no calendar 1.0.0 in the plugin directory.",
    );
    expect(untouched()).toBe(true);
  });

  it("is refused when the version is not the one that lies there", async () => {
    await put("calendar", "1.0.0");
    const result = await installPlugin("calendar", "1.0.1", yes);
    expect(errorOf(result)).toContain("There is no calendar 1.0.1");
    expect(untouched()).toBe(true);
  });

  it("is refused when the manifest is not valid, and says why", async () => {
    await put("calendar", "1.0.0", { manifest: { license: 42 } });
    const result = await installPlugin("calendar", "1.0.0", yes);
    expect(errorOf(result)).toContain("Its manifest is not valid");
    expect(untouched()).toBe(true);
  });

  it("is refused when the manifest is not even JSON", async () => {
    await put("calendar", "1.0.0", { rawManifest: "{ nope" });
    const result = await installPlugin("calendar", "1.0.0", yes);
    expect(errorOf(result)).toContain("Its manifest is not valid");
    expect(untouched()).toBe(true);
  });

  it("is refused when a file in it is a symlink", async () => {
    await put("calendar", "1.0.0");
    await symlink("/etc/passwd", join(root, "calendar", "1.0.0", "leak.js"));
    const result = await installPlugin("calendar", "1.0.0", yes);
    expect(errorOf(result)).toContain("files are not acceptable");
    expect(untouched()).toBe(true);
  });

  it("is refused when the manifest names another plugin than the directory does", async () => {
    // `<dir>/calendar/1.0.0/` that says it is `notes` is not `calendar`.
    await put("calendar", "1.0.0", { manifest: { id: "notes" } });
    const result = await installPlugin("calendar", "1.0.0", yes);
    expect(errorOf(result)).toBeTruthy();
    expect(mockPluginCreate).not.toHaveBeenCalled();
  });

  it("is refused, and says why, when there is no usable plugin directory", async () => {
    await put("calendar", "1.0.0");
    process.env.BARYNT_PLUGINS_DIR = "relative/plugins";
    const result = await installPlugin("calendar", "1.0.0", yes);
    expect(errorOf(result)).toContain("must be an absolute path");
    expect(untouched()).toBe(true);
  });

  it("is refused for an update too, with the same reason", async () => {
    await installed("calendar", "1.0.0");
    process.env.BARYNT_PLUGINS_DIR = "relative/plugins";
    const result = await updatePlugin("calendar", "1.1.0", yes);
    expect(errorOf(result)).toContain("must be an absolute path");
    expect(untouched()).toBe(true);
  });
});

describe("what a change would do to the others", () => {
  it("refuses a plugin that works with another Barynt, and says so", async () => {
    await put("calendar", "1.0.0", { manifest: { barynt: ">=9.0.0" } });
    const result = await installPlugin("calendar", "1.0.0", yes);
    expect(errorOf(result)).toContain("Not done.");
    expect(errorOf(result)).toContain("works with Barynt >=9.0.0");
    expect(untouched()).toBe(true);
  });

  it("refuses a plugin that needs one that is not installed", async () => {
    await put("board", "1.0.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    const result = await installPlugin("board", "1.0.0", yes);
    expect(errorOf(result)).toContain("needs the plugin notes (^1)");
    expect(errorOf(result)).toContain("not installed");
    expect(untouched()).toBe(true);
  });

  it("refuses a plugin that needs one that is installed but not in the version it needs", async () => {
    await installed("notes", "1.0.0");
    await put("board", "1.0.0", {
      manifest: { dependencies: { notes: "^2" } },
    });
    const result = await installPlugin("board", "1.0.0", yes);
    expect(errorOf(result)).toContain("needs notes ^2, but 1.0.0 is installed");
    expect(untouched()).toBe(true);
  });

  it("refuses a platform plugin that needs one that is switched on per workspace", async () => {
    await installed("notes", "1.0.0", { scope: "WORKSPACE" });
    await put("board", "1.0.0", {
      manifest: { scope: "platform", dependencies: { notes: "^1" } },
    });
    const result = await installPlugin("board", "1.0.0", yes);
    expect(errorOf(result)).toContain("switched on per workspace");
    expect(untouched()).toBe(true);
  });

  it("installs a plugin whose dependency is installed", async () => {
    await installed("notes", "1.2.0");
    await put("board", "1.0.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    expect(await installPlugin("board", "1.0.0", yes)).toEqual({ ok: true });
  });

  it("does not count an installed plugin whose files are gone as one that could be needed", async () => {
    await installed("notes", "1.0.0");
    await rm(join(root, "notes"), { recursive: true });
    await put("board", "1.0.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    const result = await installPlugin("board", "1.0.0", yes);
    expect(errorOf(result)).toContain("not installed");
  });
});

describe("updating", () => {
  it("moves the plugin to the newer version and its files, and to nothing else", async () => {
    const row = await installed("calendar", "1.0.0");
    const hash = await put("calendar", "1.1.0");
    expect(await updatePlugin("calendar", "1.1.0", yes)).toEqual({ ok: true });
    expect(mockPluginUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockPluginUpdateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: "calendar", version: "1.0.0", integrity: row.integrity },
      data: {
        version: "1.1.0",
        integrity: hash,
        codeApprovalHash: null,
        codeApprovedAt: null,
      },
    });
    expect(mockPluginCreate).not.toHaveBeenCalled();
    expect(mockPluginDelete).not.toHaveBeenCalled();
  });

  it("never touches where the plugin came from, that it is on, or where it applies", async () => {
    await installed("calendar", "1.0.0");
    await put("calendar", "1.1.0");
    await updatePlugin("calendar", "1.1.0", {
      acknowledged: true,
      source: "STORE",
      origin: "https://store.barynt.dev/",
      status: "ENABLED",
      scope: "PLATFORM",
    } as never);
    const keys = Object.keys(mockPluginUpdateMany.mock.calls[0]?.[0].data);
    expect(keys.sort()).toEqual([
      "codeApprovalHash",
      "codeApprovedAt",
      "integrity",
      "version",
    ]);
  });

  it("withdraws an approval, which was for the files of the old version, and says so", async () => {
    await installed("calendar", "1.0.0", { codeApprovalHash: "approved" });
    await put("calendar", "1.1.0");
    await updatePlugin("calendar", "1.1.0", yes);
    expect(mockPluginUpdateMany.mock.calls[0]?.[0].data.codeApprovalHash).toBe(
      null,
    );
    expect(mockAuditCreate.mock.calls[0]?.[0].data.meta.approvalWithdrawn).toBe(
      true,
    );
  });

  it("audits from and to, the new files, and that there was nothing to withdraw", async () => {
    await installed("calendar", "1.0.0");
    const hash = await put("calendar", "1.1.0");
    await updatePlugin("calendar", "1.1.0", yes);
    expect(mockAuditCreate.mock.calls).toHaveLength(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.updated",
      actorId: "admin1",
      targetType: "plugin",
      targetId: "calendar",
      targetLabel: "calendar@1.1.0",
      meta: {
        from: "1.0.0",
        to: "1.1.0",
        hash,
        approvalWithdrawn: false,
      },
    });
  });

  it("tells the registry and the cache", async () => {
    await installed("calendar", "1.0.0");
    await put("calendar", "1.1.0");
    await updatePlugin("calendar", "1.1.0", yes);
    expect(state.snapshot).toBeNull();
    expect(state.generation).toBe(1);
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("is refused for a plugin that is not installed", async () => {
    await put("calendar", "1.1.0");
    expect(await updatePlugin("calendar", "1.1.0", yes)).toEqual({
      error: "Unknown plugin.",
    });
    expect(untouched()).toBe(true);
  });

  it.each(["STORE", "UPLOAD"])(
    "is refused for a plugin that came from %s: it is updated where it came from",
    async (source) => {
      await installed("calendar", "1.0.0", { source });
      await put("calendar", "1.1.0");
      const result = await updatePlugin("calendar", "1.1.0", yes);
      expect(errorOf(result)).toContain(
        "did not come from the plugin directory",
      );
      expect(untouched()).toBe(true);
    },
  );

  it.each([
    ["the same version", "1.0.0"],
    ["an older version", "0.9.0"],
    ["an older patch", "1.0.0-beta.1"],
  ])("is refused to %s", async (_name, version) => {
    await installed("calendar", "1.0.0");
    await put("calendar", version);
    const result = await updatePlugin("calendar", version, yes);
    expect(errorOf(result)).toContain("newer version than the installed 1.0.0");
    expect(untouched()).toBe(true);
  });

  it("compares versions as versions, not as text", async () => {
    // As text, "1.10.0" comes before "1.9.0".
    await installed("calendar", "1.9.0");
    await put("calendar", "1.10.0");
    expect(await updatePlugin("calendar", "1.10.0", yes)).toEqual({ ok: true });
  });

  it("is refused when it would change where the plugin applies", async () => {
    await installed("calendar", "1.0.0", { scope: "WORKSPACE" });
    await put("calendar", "1.1.0", { manifest: { scope: "platform" } });
    expect(errorOf(await updatePlugin("calendar", "1.1.0", yes))).toContain(
      "cannot change where the plugin applies",
    );
    await installed("everywhere", "1.0.0", { scope: "PLATFORM" });
    await put("everywhere", "1.1.0", { manifest: { scope: "workspace" } });
    expect(errorOf(await updatePlugin("everywhere", "1.1.0", yes))).toContain(
      "cannot change where the plugin applies",
    );
    expect(untouched()).toBe(true);
  });

  it("reads the plugin as what it is installed as: a platform plugin may not come to need a per-workspace one", async () => {
    await installed("notes", "1.0.0", { scope: "WORKSPACE" });
    await installed("board", "1.0.0", { scope: "PLATFORM" });
    await put("board", "1.1.0", {
      manifest: { scope: "platform", dependencies: { notes: "^1" } },
    });
    expect(errorOf(await updatePlugin("board", "1.1.0", yes))).toContain(
      "switched on per workspace",
    );
    expect(untouched()).toBe(true);
  });

  it("is refused when the new version does not fit this Barynt", async () => {
    await installed("calendar", "1.0.0");
    await put("calendar", "1.1.0", { manifest: { barynt: ">=9.0.0" } });
    expect(errorOf(await updatePlugin("calendar", "1.1.0", yes))).toContain(
      "works with Barynt >=9.0.0",
    );
    expect(untouched()).toBe(true);
  });

  it("is refused when the new version needs a plugin that is not there", async () => {
    await installed("calendar", "1.0.0");
    await put("calendar", "1.1.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    expect(errorOf(await updatePlugin("calendar", "1.1.0", yes))).toContain(
      "needs the plugin notes",
    );
    expect(untouched()).toBe(true);
  });

  it("is refused when it would leave another plugin behind, and names it", async () => {
    await installed("notes", "1.0.0");
    await installed("board", "1.0.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    await put("notes", "2.0.0");
    const result = await updatePlugin("notes", "2.0.0", yes);
    expect(errorOf(result)).toContain("It would stop board from loading.");
    expect(untouched()).toBe(true);
  });

  it("is allowed when the plugins that need it still fit", async () => {
    await installed("notes", "1.0.0");
    await installed("board", "1.0.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    await put("notes", "1.5.0");
    expect(await updatePlugin("notes", "1.5.0", yes)).toEqual({ ok: true });
  });

  it("is refused, with nothing audited, when another update got there first", async () => {
    await installed("calendar", "1.0.0");
    await put("calendar", "1.1.0");
    mockPluginUpdateMany.mockResolvedValue({ count: 0 });
    const result = await updatePlugin("calendar", "1.1.0", yes);
    expect(errorOf(result)).toContain("changed while it was being updated");
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
    expect(state.snapshot).toBe(FAKE);
  });

  it("does not read the directory for someone who may not update", async () => {
    await installed("calendar", "1.0.0");
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: false });
    await rm(root, { recursive: true, force: true });
    expect(errorOf(await updatePlugin("calendar", "1.1.0", yes))).toContain(
      "no store",
    );
  });
});

describe("uninstalling", () => {
  it("deletes that plugin and no other, and its files stay", async () => {
    await installed("calendar", "1.0.0");
    await installed("notes", "1.0.0");
    expect(await uninstallPlugin("calendar")).toEqual({ ok: true });
    expect(mockPluginDelete.mock.calls).toEqual([
      [{ where: { id: "calendar" } }],
    ]);
    const { stat } = await import("node:fs/promises");
    expect((await stat(join(root, "calendar", "1.0.0"))).isDirectory()).toBe(
      true,
    );
  });

  it("audits what it was and for how many workspaces it was on, and tells the registry and the cache", async () => {
    const row = await installed("calendar", "1.0.0");
    mockWorkspaceCount.mockResolvedValue(3);
    await uninstallPlugin("calendar");
    expect(mockWorkspaceCount).toHaveBeenCalledWith({
      where: { pluginId: "calendar", enabled: true },
    });
    expect(mockAuditCreate.mock.calls).toHaveLength(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.uninstalled",
      actorId: "admin1",
      targetType: "plugin",
      targetId: "calendar",
      targetLabel: "calendar@1.0.0",
      meta: {
        version: "1.0.0",
        source: "DIRECTORY",
        hash: row.integrity,
        workspacesThatHadItOn: 3,
      },
    });
    expect(state.snapshot).toBeNull();
    expect(state.generation).toBe(1);
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("is refused for a plugin that is not installed", async () => {
    expect(await uninstallPlugin("calendar")).toEqual({
      error: "Unknown plugin.",
    });
    expect(untouched()).toBe(true);
  });

  it("is refused while one other plugin needs it, and names it", async () => {
    await installed("notes", "1.0.0");
    await installed("board", "1.0.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    const result = await uninstallPlugin("notes");
    expect(errorOf(result)).toBe(
      "Not done. board needs it. Uninstall that one first.",
    );
    expect(untouched()).toBe(true);
  });

  it("is refused while several need it, and names them", async () => {
    await installed("notes", "1.0.0");
    await installed("board", "1.0.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    await installed("wiki", "1.0.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    const result = await uninstallPlugin("notes");
    expect(errorOf(result)).toBe(
      "Not done. board, wiki need it. Uninstall those first.",
    );
    expect(untouched()).toBe(true);
  });

  it("can remove the one that needs another, and then the other", async () => {
    await installed("notes", "1.0.0");
    await installed("board", "1.0.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    expect(await uninstallPlugin("board")).toEqual({ ok: true });
  });

  it("removes a plugin whose files are gone: it could not load anyway", async () => {
    await installed("calendar", "1.0.0");
    await rm(join(root, "calendar"), { recursive: true });
    expect(await uninstallPlugin("calendar")).toEqual({ ok: true });
    expect(mockPluginDelete).toHaveBeenCalledTimes(1);
  });

  it("removes a plugin when there is no usable plugin directory to read", async () => {
    await installed("calendar", "1.0.0");
    process.env.BARYNT_PLUGINS_DIR = "relative/plugins";
    expect(await uninstallPlugin("calendar")).toEqual({ ok: true });
    expect(mockPluginDelete).toHaveBeenCalledTimes(1);
  });

  it("says so, and audits nothing, when another admin was faster", async () => {
    await installed("calendar", "1.0.0");
    mockPluginDelete.mockRejectedValue(
      Object.assign(new Error("Record not found"), { code: "P2025" }),
    );
    expect(await uninstallPlugin("calendar")).toEqual({
      error: "Unknown plugin.",
    });
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(state.snapshot).toBe(FAKE);
  });

  it("does not swallow any other error from the database", async () => {
    await installed("calendar", "1.0.0");
    mockPluginDelete.mockRejectedValue(new Error("connection lost"));
    await expect(uninstallPlugin("calendar")).rejects.toThrow(
      "connection lost",
    );
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe("uninstalling a plugin that is running", () => {
  const running = (hooks: Record<string, unknown>, id = "calendar") => ({
    plugins: [],
    problem: null,
    active: [{ id, version: "1.0.0", hooks }],
  });

  it("runs its onUninstall after it is removed, with the plugin and the host", async () => {
    await installed("calendar", "1.0.0");
    const events: string[] = [];
    const contexts: unknown[] = [];
    mockRegistryGet.mockImplementation(async () => {
      events.push("registry read");
      return running({
        onUninstall: (ctx: unknown) => {
          contexts.push(ctx);
          events.push(
            `hook, plugin gone: ${mockPluginDelete.mock.calls.length === 1}, registry told: ${state.generation === 1}`,
          );
        },
      });
    });
    mockPluginDelete.mockImplementation(async () => {
      events.push("deleted");
      return {};
    });
    expect(await uninstallPlugin("calendar")).toEqual({ ok: true });
    expect(events).toEqual([
      "registry read",
      "deleted",
      "hook, plugin gone: true, registry told: true",
    ]);
    expect(contexts).toEqual([
      {
        plugin: { id: "calendar", version: "1.0.0" },
        host: { barynt: expect.any(String), sdk: expect.any(String) },
      },
    ]);
  });

  it("uses the plugin as it ran before, even if the registry no longer lists it", async () => {
    await installed("calendar", "1.0.0");
    const ran = mock();
    mockRegistryGet.mockResolvedValueOnce(running({ onUninstall: ran }));
    mockRegistryGet.mockResolvedValue({
      plugins: [],
      active: [],
      problem: null,
    });
    await uninstallPlugin("calendar");
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it("does not run the hook of another plugin", async () => {
    await installed("calendar", "1.0.0");
    const ran = mock();
    mockRegistryGet.mockResolvedValue(running({ onUninstall: ran }, "another"));
    await uninstallPlugin("calendar");
    expect(ran).toHaveBeenCalledTimes(0);
  });

  it("says in the audit entry that the hook ran, or that there was none", async () => {
    await installed("calendar", "1.0.0");
    mockRegistryGet.mockResolvedValue(running({ onUninstall: () => {} }));
    await uninstallPlugin("calendar");
    expect(mockAuditCreate.mock.calls[0]?.[0].data.meta.hook).toBe("ran");
    mockAuditCreate.mockClear();
    await installed("notes", "1.0.0");
    mockRegistryGet.mockResolvedValue(running({}, "notes"));
    await uninstallPlugin("notes");
    expect(mockAuditCreate.mock.calls[0]?.[0].data.meta.hook).toBe("none");
    expect(mockAuditCreate.mock.calls[0]?.[0].data.meta).not.toHaveProperty(
      "hookError",
    );
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("cleanup failed");
      },
    ],
    [
      "rejects",
      async () => {
        throw new Error("cleanup failed");
      },
    ],
  ])(
    "is uninstalled all the same when the hook %s, with a warning",
    async (_n, hook) => {
      await installed("calendar", "1.0.0");
      mockRegistryGet.mockResolvedValue(running({ onUninstall: hook }));
      const result = await uninstallPlugin("calendar");
      expect(result).toEqual({
        ok: true,
        warning:
          "calendar is uninstalled, but its onUninstall failed: cleanup failed",
      });
      expect(mockPluginDelete).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate.mock.calls[0]?.[0].data.meta).toMatchObject({
        hook: "failed",
        hookError: "cleanup failed",
      });
      expect(state.snapshot).toBeNull();
      expect(mockRevalidate).toHaveBeenCalledTimes(1);
    },
  );

  it("does not run it, or even ask the registry, when the uninstall is refused", async () => {
    await installed("notes", "1.0.0");
    await installed("board", "1.0.0", {
      manifest: { dependencies: { notes: "^1" } },
    });
    const ran = mock();
    mockRegistryGet.mockResolvedValue(running({ onUninstall: ran }, "notes"));
    expect(errorOf(await uninstallPlugin("notes"))).toContain("Not done.");
    expect(ran).toHaveBeenCalledTimes(0);
    expect(mockRegistryGet).not.toHaveBeenCalled();
  });

  it("does not run it when the plugin was already gone", async () => {
    await installed("calendar", "1.0.0");
    const ran = mock();
    mockRegistryGet.mockResolvedValue(running({ onUninstall: ran }));
    mockPluginDelete.mockRejectedValue(
      Object.assign(new Error("Record not found"), { code: "P2025" }),
    );
    expect(await uninstallPlugin("calendar")).toEqual({
      error: "Unknown plugin.",
    });
    expect(ran).toHaveBeenCalledTimes(0);
  });
});

describe("switching a plugin on and off", () => {
  it("switches it off, audits it and tells the registry and the cache", async () => {
    await installed("calendar", "1.0.0");
    expect(await setPluginStatus("calendar", false)).toEqual({ ok: true });
    expect(mockPluginUpdate.mock.calls).toEqual([
      [{ where: { id: "calendar" }, data: { status: "DISABLED" } }],
    ]);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.status.disabled",
      actorId: "admin1",
      targetType: "plugin",
      targetId: "calendar",
      targetLabel: "calendar@1.0.0",
      meta: { version: "1.0.0" },
    });
    expect(state.snapshot).toBeNull();
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("switches it on again", async () => {
    const row = await installed("calendar", "1.0.0");
    row.status = "DISABLED";
    expect(await setPluginStatus("calendar", true)).toEqual({ ok: true });
    expect(mockPluginUpdate.mock.calls[0]?.[0].data).toEqual({
      status: "ENABLED",
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      "plugin.status.enabled",
    );
  });

  it("does nothing, quietly, when it is in that state already", async () => {
    const row = await installed("calendar", "1.0.0");
    expect(await setPluginStatus("calendar", true)).toEqual({ ok: true });
    row.status = "DISABLED";
    expect(await setPluginStatus("calendar", false)).toEqual({ ok: true });
    expect(untouched()).toBe(true);
  });

  it("is refused for a plugin that is not installed", async () => {
    expect(await setPluginStatus("calendar", true)).toEqual({
      error: "Unknown plugin.",
    });
    expect(untouched()).toBe(true);
  });

  it("does not need the plugin's files, or the setting for unsigned plugins", async () => {
    // Switching off is always possible, even when the plugin could not be installed now.
    await installed("calendar", "1.0.0");
    await rm(join(root, "calendar"), { recursive: true });
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: false });
    expect(await setPluginStatus("calendar", false)).toEqual({ ok: true });
    expect(mockSettingsFindUnique).not.toHaveBeenCalled();
  });
});
