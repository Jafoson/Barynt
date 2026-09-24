import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The whole chain, with the real registry, the real loader and real files: what
// the database says about a plugin (installed, approved for a hash) decides whether
// its code is imported at all. Only the database and the session are replaced.
// What matters: code runs only with an approval for exactly its files, a change
// takes effect on the next request, `boot` runs once, and a plugin that boots after
// the server started does not see the user of the request that made it boot.

const mockAuth = mock();
const mockPluginFindMany = mock();
const mockWorkspaceRows = mock();
const mockProjectRows = mock();
const mockProjectFindUnique = mock();
const mockStoreFindMany = mock();
const mockSettingsFindUnique = mock();

mock.module("@/auth", () => ({ auth: mockAuth }));
mock.module("@/lib/permissions", () => ({ canEnterWorkspace: mock() }));
mock.module("@/lib/db", () => ({
  db: {
    plugin: { findMany: mockPluginFindMany },
    pluginWorkspace: { findMany: mockWorkspaceRows },
    pluginProject: { findMany: mockProjectRows },
    project: { findUnique: mockProjectFindUnique },
    pluginStore: { findMany: mockStoreFindMany },
    systemSettings: { findUnique: mockSettingsFindUnique },
    workspace: { findUnique: mock() },
  },
}));

import {
  getActivePlugins,
  getActivePluginsInProject,
  getPluginRegistry,
} from "@/lib/plugins/host";
import { hashPluginDirectory } from "@/lib/plugins/integrity";
import { OFFICIAL_STORE_URL } from "@/lib/plugins/policy";
import {
  getRegistryState,
  invalidatePluginRegistry,
} from "@/lib/plugins/registryState";

// What the plugin's code writes as it runs: `register`, `boot ...`.
const G = globalThis as unknown as {
  __hostTest?: string[];
  __hostTestServices?: {
    user: { current(): Promise<unknown> };
  };
};
const trace = (): string[] => {
  if (!G.__hostTest) G.__hostTest = [];
  return G.__hostTest;
};

const SERVER = `
export default {
  register() { globalThis.__hostTest.push("register"); },
  async boot(ctx) {
    globalThis.__hostTestServices = ctx;
    globalThis.__hostTest.push("boot user=" + JSON.stringify(await ctx.user.current()));
  },
};`;

const state = getRegistryState();
let root: string;
let savedDir: string | undefined;

interface Row {
  id: string;
  version: string;
  status: "ENABLED" | "DISABLED";
  source: string;
  scope: "WORKSPACE" | "PLATFORM" | "PROJECT";
  origin: string | null;
  integrity: string;
  codeApprovalHash: string | null;
}

let rows: Row[];
let hashOf: Record<string, string>;

/** Writes a plugin with code (or without) and adds its row, approved or not. */
async function install(
  id: string,
  more: Partial<Row> & { code?: boolean } = {},
): Promise<string> {
  const { code = true, ...rowMore } = more;
  const dir = join(root, id, "1.0.0");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "barynt-plugin.json"),
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
      ...(code ? { server: "server.js" } : {}),
    }),
  );
  if (code) await writeFile(join(dir, "server.js"), SERVER);
  const hashed = await hashPluginDirectory(dir);
  if (!hashed.ok) throw new Error(hashed.issue);
  hashOf[id] = hashed.digest;
  rows.push({
    id,
    version: "1.0.0",
    status: "ENABLED",
    source: "STORE",
    scope: "PLATFORM",
    origin: OFFICIAL_STORE_URL,
    integrity: hashed.digest,
    codeApprovalHash: null,
    ...rowMore,
  });
  return hashed.digest;
}

const rowOf = (id: string) => rows.find((r) => r.id === id) as Row;
const snapshot = () => getPluginRegistry().get();
const statusOf = async (id: string) =>
  (await snapshot()).plugins.find((p) => p.id === id)?.status;

/** What a change made from an action does: the row changes, the registry is told. */
function change(edit: () => void) {
  edit();
  invalidatePluginRegistry();
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-host-"));
  savedDir = process.env.BARYNT_PLUGINS_DIR;
  process.env.BARYNT_PLUGINS_DIR = root;
  rows = [];
  hashOf = {};
  G.__hostTest = [];
  delete G.__hostTestServices;
  for (const m of [
    mockAuth,
    mockPluginFindMany,
    mockWorkspaceRows,
    mockProjectRows,
    mockProjectFindUnique,
    mockStoreFindMany,
    mockSettingsFindUnique,
  ]) {
    m.mockReset();
  }
  mockAuth.mockResolvedValue({
    user: { id: "u1", firstName: "Mara", lastName: "Velez" },
  });
  // Like the database, it gives only the columns that were asked for: a column the
  // registry forgets to select is missing, not quietly there.
  mockPluginFindMany.mockImplementation(
    async (args: { select: Record<string, boolean> }) =>
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([key]) => args.select[key] === true),
        ),
      ),
  );
  mockWorkspaceRows.mockResolvedValue([]);
  mockProjectRows.mockResolvedValue([]);
  mockProjectFindUnique.mockResolvedValue({ workspaceId: "w1" });
  mockStoreFindMany.mockResolvedValue([{ url: OFFICIAL_STORE_URL }]);
  mockSettingsFindUnique.mockResolvedValue(null);
  state.snapshot = null;
  state.building = null;
  state.failedAt = null;
  state.loading = 0;
  state.booted.clear();
});

afterEach(async () => {
  if (savedDir === undefined) delete process.env.BARYNT_PLUGINS_DIR;
  else process.env.BARYNT_PLUGINS_DIR = savedDir;
  await rm(root, { recursive: true, force: true });
});

describe("code runs only with an approval for exactly its files", () => {
  it("does not import a plugin with code that is not approved", async () => {
    await install("calendar");
    expect(await statusOf("calendar")).toEqual({
      state: "blocked",
      reason: "not-approved",
    });
    // Not even imported: nothing of it ran.
    expect(trace()).toEqual([]);
  });

  it("runs a plugin whose code is approved for its hash, in the process", async () => {
    const hash = await install("calendar");
    rowOf("calendar").codeApprovalHash = hash;
    expect(await statusOf("calendar")).toEqual({
      state: "loaded",
      mode: "in-process",
    });
    expect(trace()[0]).toBe("register");
    expect(trace()).toHaveLength(2);
  });

  it("does not run it when the approval is for another hash, as after an update", async () => {
    await install("calendar");
    rowOf("calendar").codeApprovalHash = `sha512-${"B".repeat(86)}==`;
    expect(await statusOf("calendar")).toEqual({
      state: "blocked",
      reason: "approval-outdated",
    });
    expect(trace()).toEqual([]);
  });

  it("does not run it when its files changed after the approval, even with the right approval", async () => {
    const hash = await install("calendar");
    rowOf("calendar").codeApprovalHash = hash;
    await writeFile(join(root, "calendar", "1.0.0", "server.js"), "evil()");
    const status = await statusOf("calendar");
    expect(status).toMatchObject({ state: "failed", phase: "integrity" });
    expect(trace()).toEqual([]);
  });

  it("does not run a plugin without code as code: it needs no approval", async () => {
    await install("plain", { code: false });
    expect(await statusOf("plain")).toEqual({
      state: "loaded",
      mode: "declarative",
    });
  });
});

describe("a change takes effect on the next request", () => {
  it("runs a plugin from the moment it is approved, and boots it once", async () => {
    const hash = await install("calendar");
    expect(await statusOf("calendar")).toMatchObject({ state: "blocked" });
    change(() => {
      rowOf("calendar").codeApprovalHash = hash;
    });
    expect(await statusOf("calendar")).toMatchObject({ state: "loaded" });
    expect(trace().filter((t) => t.startsWith("boot"))).toHaveLength(1);
    // Built again for some other reason: registered again, not booted again.
    invalidatePluginRegistry();
    await snapshot();
    expect(trace().filter((t) => t.startsWith("boot"))).toHaveLength(1);
    expect(trace().filter((t) => t === "register")).toHaveLength(2);
  });

  it("stops handing a plugin out from the moment its approval is withdrawn", async () => {
    const hash = await install("calendar");
    rowOf("calendar").codeApprovalHash = hash;
    expect((await getActivePlugins("w1")).map((p) => p.id)).toEqual([
      "calendar",
    ]);
    change(() => {
      rowOf("calendar").codeApprovalHash = null;
    });
    expect(await getActivePlugins("w1")).toEqual([]);
    expect(await statusOf("calendar")).toMatchObject({
      state: "blocked",
      reason: "not-approved",
    });
  });

  it("stops handing out the code of a store that is switched off, approved or not", async () => {
    const hash = await install("calendar");
    rowOf("calendar").codeApprovalHash = hash;
    expect((await getActivePlugins("w1")).map((p) => p.id)).toEqual([
      "calendar",
    ]);
    mockStoreFindMany.mockResolvedValue([]);
    invalidatePluginRegistry();
    expect(await getActivePlugins("w1")).toEqual([]);
    expect(await statusOf("calendar")).toEqual({
      state: "blocked",
      reason: "store-not-active",
    });
  });

  it("does not run the code of a plugin from an upload, even when approved and even when unsigned plugins are allowed", async () => {
    const hash = await install("uploaded", { source: "UPLOAD", origin: null });
    rowOf("uploaded").codeApprovalHash = hash;
    mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: true });
    expect(await statusOf("uploaded")).toEqual({
      state: "blocked",
      reason: "unsigned-code",
    });
    expect(trace()).toEqual([]);
  });
});

describe("a plugin that boots after the server started", () => {
  it("does not see the user of the request that made it boot", async () => {
    const hash = await install("calendar");
    await snapshot();
    change(() => {
      rowOf("calendar").codeApprovalHash = hash;
    });
    // Someone is signed in, and it is their request that builds the registry.
    expect(await statusOf("calendar")).toMatchObject({ state: "loaded" });
    expect(trace()).toContain("boot user=null");
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("does answer once the plugins are loaded, from inside a request", async () => {
    const hash = await install("calendar");
    rowOf("calendar").codeApprovalHash = hash;
    await snapshot();
    const services = G.__hostTestServices;
    expect(await services?.user.current()).toEqual({
      id: "u1",
      name: "Mara Velez",
    });
  });

  it("knows it is loading only while it is: the count is back to zero", async () => {
    const hash = await install("calendar");
    rowOf("calendar").codeApprovalHash = hash;
    await snapshot();
    expect(state.loading).toBe(0);
  });
});

describe("which plugins apply in a workspace", () => {
  it("is every approved platform plugin, and a workspace plugin only where it is switched on", async () => {
    const platform = await install("everywhere");
    const chosen = await install("chosen", { scope: "WORKSPACE" });
    const other = await install("other", { scope: "WORKSPACE" });
    rowOf("everywhere").codeApprovalHash = platform;
    rowOf("chosen").codeApprovalHash = chosen;
    rowOf("other").codeApprovalHash = other;
    // Both workspace plugins are on somewhere; only one is on in this workspace.
    mockWorkspaceRows.mockImplementation(async (args: { where: object }) =>
      "workspaceId" in args.where
        ? [{ pluginId: "chosen" }]
        : [{ pluginId: "chosen" }, { pluginId: "other" }],
    );
    const active = await getActivePlugins("w1");
    expect(active.map((p) => p.id).sort()).toEqual(["chosen", "everywhere"]);
  });

  it("is nothing, without an error, when the workspace's settings cannot be read", async () => {
    const hash = await install("calendar", { scope: "WORKSPACE" });
    rowOf("calendar").codeApprovalHash = hash;
    mockWorkspaceRows.mockResolvedValueOnce([{ pluginId: "calendar" }]);
    await snapshot();
    mockWorkspaceRows.mockRejectedValue(new Error("connection lost"));
    const log = console.error;
    console.error = () => {};
    try {
      expect(await getActivePlugins("w1")).toEqual([]);
    } finally {
      console.error = log;
    }
  });
});

describe("which plugins apply in a project", () => {
  /** Three plugins that run, each approved: for the platform, per workspace and per project. */
  async function threeLevels() {
    for (const [id, scope] of [
      ["everywhere", "PLATFORM"],
      ["chosen", "WORKSPACE"],
      ["board", "PROJECT"],
    ] as const) {
      const hash = await install(id, { scope });
      rowOf(id).codeApprovalHash = hash;
    }
  }

  it("is what applies in the workspace and each project plugin the project switched on", async () => {
    await threeLevels();
    const other = await install("other-board", { scope: "PROJECT" });
    rowOf("other-board").codeApprovalHash = other;
    mockWorkspaceRows.mockImplementation(async (args: { where: object }) =>
      "workspaceId" in args.where
        ? [{ pluginId: "chosen" }]
        : [{ pluginId: "chosen" }],
    );
    mockProjectRows.mockImplementation(async (args: { where: object }) =>
      "projectId" in args.where
        ? [{ pluginId: "board" }]
        : [{ pluginId: "board" }, { pluginId: "other-board" }],
    );
    const active = await getActivePluginsInProject("p1");
    expect(active.map((p) => p.id).sort()).toEqual([
      "board",
      "chosen",
      "everywhere",
    ]);
  });

  it("asks for the project's own settings, and for the workspace the project is in", async () => {
    await threeLevels();
    mockProjectFindUnique.mockResolvedValue({ workspaceId: "w9" });
    mockProjectRows.mockResolvedValue([{ pluginId: "board" }]);
    await getActivePluginsInProject("p1");
    expect(mockProjectFindUnique).toHaveBeenCalledWith({
      where: { id: "p1" },
      select: { workspaceId: true },
    });
    expect(mockWorkspaceRows).toHaveBeenLastCalledWith({
      where: { workspaceId: "w9", enabled: true },
      select: { pluginId: true },
    });
    expect(mockProjectRows).toHaveBeenLastCalledWith({
      where: { projectId: "p1", enabled: true },
      select: { pluginId: true },
    });
  });

  it("is not a workspace's plugin that is on in another workspace, nor another project's plugin", async () => {
    await threeLevels();
    mockWorkspaceRows.mockImplementation(async (args: { where: object }) =>
      "workspaceId" in args.where ? [] : [{ pluginId: "chosen" }],
    );
    mockProjectRows.mockImplementation(async (args: { where: object }) =>
      "projectId" in args.where ? [] : [{ pluginId: "board" }],
    );
    const active = await getActivePluginsInProject("p1");
    expect(active.map((p) => p.id)).toEqual(["everywhere"]);
  });

  it("is nothing for a project that is not there, and that is not an error", async () => {
    await threeLevels();
    mockProjectFindUnique.mockResolvedValue(null);
    const log = console.error;
    const logged: unknown[] = [];
    console.error = (...args: unknown[]) => logged.push(args);
    try {
      expect(await getActivePluginsInProject("gone")).toEqual([]);
    } finally {
      console.error = log;
    }
    expect(logged).toEqual([]);
  });

  it("reads nothing of the project when no plugin runs", async () => {
    await snapshot();
    mockProjectFindUnique.mockClear();
    mockProjectRows.mockClear();
    expect(await getActivePluginsInProject("p3")).toEqual([]);
    expect(mockProjectFindUnique).not.toHaveBeenCalled();
    expect(mockProjectRows).not.toHaveBeenCalled();
  });

  it("is nothing, without an error, when the project's settings cannot be read", async () => {
    await threeLevels();
    mockProjectRows.mockResolvedValueOnce([{ pluginId: "board" }]);
    await snapshot();
    mockProjectRows.mockRejectedValue(new Error("connection lost"));
    const log = console.error;
    console.error = () => {};
    try {
      expect(await getActivePluginsInProject("p2")).toEqual([]);
    } finally {
      console.error = log;
    }
  });
});

describe("which plugins load because a workspace or a project switched them on", () => {
  it("loads a project plugin when some project has it on, and leaves it idle when none has", async () => {
    const hash = await install("board", { scope: "PROJECT" });
    rowOf("board").codeApprovalHash = hash;
    expect(await statusOf("board")).toEqual({ state: "idle" });
    change(() => mockProjectRows.mockResolvedValue([{ pluginId: "board" }]));
    expect(await statusOf("board")).toMatchObject({ state: "loaded" });
  });

  it("does not load a workspace plugin because a project row names it, nor a project plugin because a workspace row does", async () => {
    const a = await install("chosen", { scope: "WORKSPACE" });
    const b = await install("board", { scope: "PROJECT" });
    rowOf("chosen").codeApprovalHash = a;
    rowOf("board").codeApprovalHash = b;
    // Rows of the other kind, as if some had been written by hand: the database filters by
    // the plugin's scope, the way the registry asks for them.
    mockWorkspaceRows.mockImplementation(async (args: { where: object }) =>
      JSON.stringify(args.where).includes('"scope":"WORKSPACE"')
        ? []
        : [{ pluginId: "board" }],
    );
    mockProjectRows.mockImplementation(async (args: { where: object }) =>
      JSON.stringify(args.where).includes('"scope":"PROJECT"')
        ? []
        : [{ pluginId: "chosen" }],
    );
    expect(await statusOf("chosen")).toEqual({ state: "idle" });
    expect(await statusOf("board")).toEqual({ state: "idle" });
  });

  it("asks for the workspaces' rows of plugins that apply per workspace and the projects' rows of plugins that apply per project", async () => {
    await snapshot();
    expect(mockWorkspaceRows.mock.calls[0]?.[0]).toEqual({
      where: { enabled: true, plugin: { scope: "WORKSPACE" } },
      select: { pluginId: true },
      distinct: ["pluginId"],
    });
    expect(mockProjectRows.mock.calls[0]?.[0]).toEqual({
      where: { enabled: true, plugin: { scope: "PROJECT" } },
      select: { pluginId: true },
      distinct: ["pluginId"],
    });
  });
});
