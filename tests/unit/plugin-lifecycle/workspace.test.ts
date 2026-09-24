import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A workspace switching a plugin on and off. What matters: only `plugin.enable`, for
// the workspace in the request, a plugin that applies to the whole platform has no
// such switch, switching on has to end with the plugin running there (or the row is
// put back and the admin is told why), `onEnable` can refuse and `onDisable` cannot,
// what depends on what is respected in that workspace, and two admins at once
// change it once. The plugin directory is real, the database is an in-memory
// stand-in that answers like the queries do, and the registry says what runs.

interface Row {
  pluginId: string;
  workspaceId: string;
  enabled: boolean;
  config?: unknown;
}

const mockPluginFindMany = mock();
const mockWorkspaceFindUnique = mock();
const mockAuditCreate = mock();
const mockRevalidate = mock();
const mockRegistryGet = mock();
const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "admin1",
);

let rows: Row[];
const calls: string[] = [];

/** `where` as the queries here write it: equality, and `pluginId: { in: [...] }`. */
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, wanted]) => {
    if (key === "pluginId" && typeof wanted === "object" && wanted !== null) {
      return (wanted as { in: string[] }).in.includes(row.pluginId);
    }
    return (row as unknown as Record<string, unknown>)[key] === wanted;
  });
}

const mockRowFindUnique = mock(
  async (args: {
    where: { pluginId_workspaceId: { pluginId: string; workspaceId: string } };
  }) => {
    const { pluginId, workspaceId } = args.where.pluginId_workspaceId;
    const found = rows.find(
      (r) => r.pluginId === pluginId && r.workspaceId === workspaceId,
    );
    return found ? { enabled: found.enabled } : null;
  },
);
const mockRowFindMany = mock(async (args: { where: Record<string, unknown> }) =>
  rows
    .filter((row) => matches(row, args.where))
    .map((row) => ({ pluginId: row.pluginId })),
);
const mockRowUpdateMany = mock(
  async (args: { where: Record<string, unknown>; data: Partial<Row> }) => {
    const found = rows.filter((row) => matches(row, args.where));
    for (const row of found) Object.assign(row, args.data);
    calls.push(`updateMany ${JSON.stringify(args.data)}`);
    return { count: found.length };
  },
);
const mockRowCreate = mock(async (args: { data: Row }) => {
  if (
    rows.some(
      (r) =>
        r.pluginId === args.data.pluginId &&
        r.workspaceId === args.data.workspaceId,
    )
  ) {
    throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
  }
  rows.push({ ...args.data });
  calls.push("create");
  return args.data;
});
const mockRowDeleteMany = mock(
  async (args: { where: Record<string, unknown> }) => {
    const before = rows.length;
    rows = rows.filter((row) => !matches(row, args.where));
    calls.push("deleteMany");
    return { count: before - rows.length };
  },
);

mock.module("@/lib/db", () => ({
  db: {
    plugin: { findMany: mockPluginFindMany },
    workspace: { findUnique: mockWorkspaceFindUnique },
    pluginWorkspace: {
      findUnique: mockRowFindUnique,
      findMany: mockRowFindMany,
      updateMany: mockRowUpdateMany,
      create: mockRowCreate,
      deleteMany: mockRowDeleteMany,
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
mock.module("react", () => ({ cache: <T>(fn: T) => fn }));
mock.module("@/lib/plugins/host", () => ({
  getPluginRegistry: () => ({ get: mockRegistryGet }),
}));

import {
  disablePlugin,
  enablePlugin,
} from "@/features/plugins/workspaceActions";
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

type Scope = "WORKSPACE" | "PLATFORM" | "PROJECT";
interface Installed {
  id: string;
  version: string;
  scope: Scope;
  status: "ENABLED" | "DISABLED";
}
let installedRows: Installed[];

/** What the registry says the plugins are, and which run with which hooks. */
let statuses: Record<string, unknown>;
let hooks: Record<string, Record<string, unknown>>;

const HOST = { barynt: expect.any(String), sdk: expect.any(String) };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-workspace-"));
  savedDir = process.env.BARYNT_PLUGINS_DIR;
  process.env.BARYNT_PLUGINS_DIR = root;
  rows = [];
  calls.length = 0;
  installedRows = [];
  statuses = {};
  hooks = {};
  for (const m of [
    mockPluginFindMany,
    mockWorkspaceFindUnique,
    mockAuditCreate,
    mockRevalidate,
    mockRegistryGet,
    mockRequirePermission,
    mockRowFindUnique,
    mockRowFindMany,
    mockRowUpdateMany,
    mockRowCreate,
    mockRowDeleteMany,
  ]) {
    m.mockClear();
  }
  mockRequirePermission.mockResolvedValue("admin1");
  mockPluginFindMany.mockImplementation(async () => installedRows);
  mockWorkspaceFindUnique.mockImplementation(
    async (args: { where: { id: string } }) =>
      args.where.id === "w1" ? { id: "w1", name: "Team One" } : null,
  );
  mockAuditCreate.mockResolvedValue({});
  // As after a build: a plugin that is switched on somewhere and installed runs, unless
  // the test says otherwise.
  mockRegistryGet.mockImplementation(async () => ({
    problem: null,
    plugins: installedRows.map((p) => ({
      id: p.id,
      status: statuses[p.id] ?? { state: "loaded", mode: "in-process" },
    })),
    active: installedRows
      .filter(
        (p) => (statuses[p.id] as { state?: string })?.state !== "blocked",
      )
      .map((p) => ({ id: p.id, version: p.version, hooks: hooks[p.id] ?? {} })),
  }));
  state.snapshot = FAKE;
  state.generation = 0;
});

afterEach(async () => {
  if (savedDir === undefined) delete process.env.BARYNT_PLUGINS_DIR;
  else process.env.BARYNT_PLUGINS_DIR = savedDir;
  await rm(root, { recursive: true, force: true });
});

/** A plugin in the directory, and installed, per workspace unless said otherwise. */
async function installed(
  id: string,
  more: {
    scope?: Scope;
    status?: "ENABLED" | "DISABLED";
    dependencies?: Record<string, string>;
    files?: boolean;
  } = {},
): Promise<void> {
  const scope = more.scope ?? "WORKSPACE";
  if (more.files !== false) {
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
        scope: scope.toLowerCase(),
        dependencies: more.dependencies ?? {},
      }),
    );
    const hashed = await hashPluginDirectory(dir);
    if (!hashed.ok) throw new Error(hashed.issue);
  }
  installedRows.push({
    id,
    version: "1.0.0",
    scope,
    status: more.status ?? "ENABLED",
  });
}

const on = (pluginId: string, workspaceId = "w1", enabled = true): void => {
  rows.push({ pluginId, workspaceId, enabled });
};

const enabledIn = (workspaceId = "w1") =>
  rows
    .filter((r) => r.workspaceId === workspaceId && r.enabled)
    .map((r) => r.pluginId)
    .sort();

/** Nothing was written, audited or told to the cache or the registry. */
function untouched(): boolean {
  return (
    calls.length === 0 &&
    mockAuditCreate.mock.calls.length === 0 &&
    mockRevalidate.mock.calls.length === 0 &&
    state.snapshot === FAKE &&
    state.generation === 0
  );
}

const errorOf = (result: unknown) => (result as { error: string }).error;

describe("who may", () => {
  it("asks for plugin.enable in the workspace of the request, for each action", async () => {
    await installed("calendar");
    await enablePlugin("w1", "calendar");
    await disablePlugin("w1", "calendar");
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.enable", { workspaceId: "w1" }],
      ["plugin.enable", { workspaceId: "w1" }],
    ]);
  });

  it("does nothing at all, and looks nothing up, when the permission is refused", async () => {
    await installed("calendar");
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(enablePlugin("w1", "calendar")).rejects.toThrow("not allowed");
    await expect(disablePlugin("w1", "calendar")).rejects.toThrow(
      "not allowed",
    );
    expect(untouched()).toBe(true);
    expect(mockPluginFindMany).not.toHaveBeenCalled();
    expect(mockRegistryGet).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing", undefined],
    ["an empty id", ""],
    ["no text", 42],
    ["a very long id", "w".repeat(101)],
  ])(
    "does not even ask for the permission for a workspace given as %s",
    async (_name, workspace) => {
      await installed("calendar");
      expect(await enablePlugin(workspace as string, "calendar")).toEqual({
        error: "Invalid request.",
      });
      expect(await disablePlugin(workspace as string, "calendar")).toEqual({
        error: "Invalid request.",
      });
      expect(mockRequirePermission).not.toHaveBeenCalled();
      expect(untouched()).toBe(true);
    },
  );

  it.each([
    ["a path", "../etc"],
    ["capitals", "Calendar"],
    ["no text", 42],
    ["nothing", undefined],
  ])("is refused for a plugin given as %s", async (_name, id) => {
    expect(await enablePlugin("w1", id as string)).toEqual({
      error: "Invalid request.",
    });
    expect(await disablePlugin("w1", id as string)).toEqual({
      error: "Invalid request.",
    });
    expect(mockPluginFindMany).not.toHaveBeenCalled();
    expect(untouched()).toBe(true);
  });
});

describe("which plugins have a switch per workspace", () => {
  it.each([
    ["is not installed", undefined],
    ["applies to the whole platform", "platform"],
  ])("refuses a plugin that %s", async (_name, kind) => {
    if (kind === "platform")
      await installed("everywhere", { scope: "PLATFORM" });
    const id = kind === "platform" ? "everywhere" : "calendar";
    const enable = await enablePlugin("w1", id);
    const disable = await disablePlugin("w1", id);
    expect(errorOf(enable)).toBe(kind ? errorOf(disable) : "Unknown plugin.");
    expect(errorOf(disable)).toBe(
      kind
        ? "This plugin applies to the whole platform. Only the platform switches it on or off."
        : "Unknown plugin.",
    );
    expect(untouched()).toBe(true);
  });

  it("refuses a plugin that applies per project, which a project switches on and a workspace does not", async () => {
    await installed("board", { scope: "PROJECT" });
    const message =
      "This plugin applies per project. A project switches it on or off, not a workspace.";
    expect(await enablePlugin("w1", "board")).toEqual({ error: message });
    expect(await disablePlugin("w1", "board")).toEqual({ error: message });
    expect(untouched()).toBe(true);
  });

  it("refuses to switch on a plugin the platform switched off", async () => {
    await installed("calendar", { status: "DISABLED" });
    expect(await enablePlugin("w1", "calendar")).toEqual({
      error: "The platform has switched this plugin off.",
    });
    expect(untouched()).toBe(true);
  });

  it("still lets a workspace switch off a plugin the platform switched off", async () => {
    await installed("calendar", { status: "DISABLED" });
    on("calendar");
    expect(await disablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(enabledIn()).toEqual([]);
  });

  it("refuses a workspace that does not exist", async () => {
    await installed("calendar");
    expect(await enablePlugin("w2", "calendar")).toEqual({
      error: "Unknown workspace.",
    });
    expect(await disablePlugin("w2", "calendar")).toEqual({
      error: "Unknown workspace.",
    });
    expect(untouched()).toBe(true);
  });
});

describe("switching on", () => {
  it("adds the row for this workspace and no other, and audits it with the workspace", async () => {
    await installed("calendar");
    on("calendar", "w9");
    expect(await enablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(rows).toEqual([
      { pluginId: "calendar", workspaceId: "w9", enabled: true },
      { pluginId: "calendar", workspaceId: "w1", enabled: true },
    ]);
    expect(mockAuditCreate.mock.calls).toHaveLength(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.workspace.enabled",
      actorId: "admin1",
      workspaceId: "w1",
      targetType: "plugin",
      targetId: "calendar",
      targetLabel: "calendar@1.0.0",
      meta: { version: "1.0.0", hook: "none" },
    });
  });

  it("tells the registry to decide again, and the cache", async () => {
    await installed("calendar");
    await enablePlugin("w1", "calendar");
    expect(state.snapshot).toBeNull();
    expect(state.generation).toBe(1);
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("switches a row that was off on again, and keeps what the workspace had set", async () => {
    await installed("calendar");
    rows.push({
      pluginId: "calendar",
      workspaceId: "w1",
      enabled: false,
      config: { colour: "red" },
    });
    expect(await enablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(rows).toEqual([
      {
        pluginId: "calendar",
        workspaceId: "w1",
        enabled: true,
        config: { colour: "red" },
      },
    ]);
    expect(calls).toEqual(['updateMany {"enabled":true}']);
  });

  it("does nothing, quietly, when it is on already", async () => {
    await installed("calendar");
    on("calendar");
    expect(await enablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(untouched()).toBe(true);
    expect(mockRegistryGet).not.toHaveBeenCalled();
  });

  it("does nothing, quietly, and puts nothing back, when another admin switched it on at the same moment", async () => {
    await installed("calendar");
    // The other admin's row is there, but this admin's read was a moment older.
    on("calendar");
    mockRowFindUnique.mockResolvedValueOnce(null);
    expect(await enablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(enabledIn()).toEqual(["calendar"]);
    expect(mockRowDeleteMany).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
    expect(state.generation).toBe(0);
    expect(mockRegistryGet).not.toHaveBeenCalled();
  });

  it("does not switch on a row of another workspace", async () => {
    await installed("calendar");
    rows.push({ pluginId: "calendar", workspaceId: "w9", enabled: false });
    expect(await enablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(rows).toEqual([
      { pluginId: "calendar", workspaceId: "w9", enabled: false },
      { pluginId: "calendar", workspaceId: "w1", enabled: true },
    ]);
  });

  it("does not swallow any other database error, and puts nothing back", async () => {
    await installed("calendar");
    mockRowCreate.mockRejectedValueOnce(new Error("connection lost"));
    await expect(enablePlugin("w1", "calendar")).rejects.toThrow(
      "connection lost",
    );
    expect(mockRowDeleteMany).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe("what it needs in this workspace", () => {
  it("is refused while a plugin it needs is not switched on here, and names it", async () => {
    await installed("notes");
    await installed("board", { dependencies: { notes: "^1" } });
    expect(errorOf(await enablePlugin("w1", "board"))).toBe(
      "Switch on notes in this workspace first, board needs it.",
    );
    expect(untouched()).toBe(true);
  });

  it("names all of them when there are several", async () => {
    await installed("tags");
    await installed("notes");
    await installed("board", { dependencies: { tags: "^1", notes: "^1" } });
    expect(errorOf(await enablePlugin("w1", "board"))).toBe(
      "Switch on notes, tags in this workspace first, board needs them.",
    );
  });

  it("is refused when it is switched on in another workspace only", async () => {
    await installed("notes");
    await installed("board", { dependencies: { notes: "^1" } });
    on("notes", "w9");
    expect(errorOf(await enablePlugin("w1", "board"))).toContain(
      "Switch on notes",
    );
  });

  it("is refused when it is in this workspace but switched off", async () => {
    await installed("notes");
    await installed("board", { dependencies: { notes: "^1" } });
    on("notes", "w1", false);
    expect(errorOf(await enablePlugin("w1", "board"))).toContain(
      "Switch on notes",
    );
  });

  it("is allowed once it is switched on here", async () => {
    await installed("notes");
    await installed("board", { dependencies: { notes: "^1" } });
    on("notes");
    expect(await enablePlugin("w1", "board")).toEqual({ ok: true });
    expect(enabledIn()).toEqual(["board", "notes"]);
  });

  it("does not ask for a plugin of the platform: it applies everywhere already", async () => {
    await installed("platformkit", { scope: "PLATFORM" });
    await installed("board", { dependencies: { platformkit: "^1" } });
    expect(await enablePlugin("w1", "board")).toEqual({ ok: true });
  });

  it("leaves a plugin that is not installed to the registry, which says it cannot run", async () => {
    await installed("board", { dependencies: { notes: "^1" } });
    statuses.board = {
      state: "incompatible",
      problems: [
        { code: "dependency-missing", dependency: "notes", range: "^1" },
      ],
    };
    expect(errorOf(await enablePlugin("w1", "board"))).toContain(
      "needs the plugin notes (^1), which is not installed",
    );
  });

  it("is refused when its manifest cannot be read from the plugin directory", async () => {
    await installed("calendar", { files: false });
    expect(errorOf(await enablePlugin("w1", "calendar"))).toContain(
      "manifest cannot be read",
    );
    expect(untouched()).toBe(true);
  });

  it("is refused, and says why, when there is no usable plugin directory", async () => {
    await installed("calendar");
    process.env.BARYNT_PLUGINS_DIR = "relative/plugins";
    expect(errorOf(await enablePlugin("w1", "calendar"))).toContain(
      "must be an absolute path",
    );
    expect(untouched()).toBe(true);
  });
});

describe("switching on has to end with the plugin running", () => {
  it("is put back, and refused with the reason, when the plugin does not run", async () => {
    await installed("calendar");
    statuses.calendar = { state: "blocked", reason: "not-approved" };
    const result = await enablePlugin("w1", "calendar");
    expect(errorOf(result)).toBe(
      "It cannot run in this workspace. The platform has not approved its code to run.",
    );
    expect(rows).toEqual([]);
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
    // Told twice: when the row appeared, and when it was put back.
    expect(state.generation).toBe(2);
    expect(state.snapshot).toBeNull();
  });

  it("puts back only this workspace's row, not the one another workspace has", async () => {
    await installed("calendar");
    on("calendar", "w9");
    statuses.calendar = { state: "blocked", reason: "not-approved" };
    await enablePlugin("w1", "calendar");
    expect(rows).toEqual([
      { pluginId: "calendar", workspaceId: "w9", enabled: true },
    ]);
  });

  it("puts a row that was off back to off, with what the workspace had set", async () => {
    await installed("calendar");
    rows.push({
      pluginId: "calendar",
      workspaceId: "w1",
      enabled: false,
      config: { colour: "red" },
    });
    on("calendar", "w9");
    statuses.calendar = { state: "failed", phase: "boot", message: "no room" };
    const result = await enablePlugin("w1", "calendar");
    expect(errorOf(result)).toBe(
      "It cannot run in this workspace. It failed to load (boot): no room",
    );
    // Only this workspace's row is put back; another workspace keeps it on.
    expect(rows).toEqual([
      {
        pluginId: "calendar",
        workspaceId: "w1",
        enabled: false,
        config: { colour: "red" },
      },
      { pluginId: "calendar", workspaceId: "w9", enabled: true },
    ]);
  });

  it("gives the registry's own reason when it could not be built at all", async () => {
    await installed("calendar");
    mockRegistryGet.mockResolvedValue({
      problem: "The plugins could not be loaded: database down",
      plugins: [],
      active: [],
    });
    expect(errorOf(await enablePlugin("w1", "calendar"))).toBe(
      "It cannot run in this workspace. The plugins could not be loaded: database down",
    );
    expect(rows).toEqual([]);
  });

  it("is refused when the registry does not list it at all", async () => {
    await installed("calendar");
    mockRegistryGet.mockResolvedValue({
      problem: null,
      plugins: [],
      active: [],
    });
    expect(errorOf(await enablePlugin("w1", "calendar"))).toContain(
      "The registry does not know it.",
    );
    expect(rows).toEqual([]);
  });

  it.each(["idle", "disabled"])(
    "is refused when the registry says it is %s",
    async (state_) => {
      await installed("calendar");
      statuses.calendar = { state: state_ };
      expect(errorOf(await enablePlugin("w1", "calendar"))).toContain(
        "It cannot run in this workspace.",
      );
      expect(rows).toEqual([]);
    },
  );

  it("puts the row back and passes the error on when the registry throws", async () => {
    await installed("calendar");
    mockRegistryGet.mockRejectedValue(new Error("registry broke"));
    await expect(enablePlugin("w1", "calendar")).rejects.toThrow(
      "registry broke",
    );
    expect(rows).toEqual([]);
    expect(state.generation).toBe(2);
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe("onEnable", () => {
  const context = {
    plugin: { id: "calendar", version: "1.0.0" },
    host: HOST,
    workspace: { id: "w1", name: "Team One" },
  };

  it("runs once the plugin runs in the workspace, with the plugin, the host and the workspace", async () => {
    await installed("calendar");
    const seen: unknown[] = [];
    hooks.calendar = {
      onEnable: (ctx: unknown) => {
        seen.push(ctx);
        // At this moment the workspace has it on, and the registry has been told.
        seen.push(enabledIn(), state.generation);
      },
    };
    expect(await enablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(seen).toEqual([context, ["calendar"], 1]);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.meta).toEqual({
      version: "1.0.0",
      hook: "ran",
    });
  });

  it("is the hook of this plugin and of no other, and no other hook", async () => {
    await installed("calendar");
    await installed("notes");
    const ran: string[] = [];
    hooks.calendar = {
      onEnable: () => void ran.push("calendar.onEnable"),
      onDisable: () => void ran.push("calendar.onDisable"),
      onUninstall: () => void ran.push("calendar.onUninstall"),
    };
    hooks.notes = { onEnable: () => void ran.push("notes.onEnable") };
    await enablePlugin("w1", "calendar");
    expect(ran).toEqual(["calendar.onEnable"]);
  });

  it("runs the hook of the plugin that is switched on when it is not the first the registry lists", async () => {
    await installed("calendar");
    await installed("notes");
    const ran: string[] = [];
    hooks.calendar = { onEnable: () => void ran.push("calendar.onEnable") };
    hooks.notes = { onEnable: () => void ran.push("notes.onEnable") };
    await enablePlugin("w1", "notes");
    expect(ran).toEqual(["notes.onEnable"]);
  });

  it("waits for an async hook", async () => {
    await installed("calendar");
    const order: string[] = [];
    hooks.calendar = {
      onEnable: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("hook");
      },
    };
    await enablePlugin("w1", "calendar");
    order.push("after");
    expect(order).toEqual(["hook", "after"]);
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("no calendar for you");
      },
    ],
    [
      "rejects",
      async () => {
        throw new Error("no calendar for you");
      },
    ],
  ])(
    "refuses the switch, and puts the row back, when the hook %s",
    async (_n, onEnable) => {
      await installed("calendar");
      hooks.calendar = { onEnable };
      expect(errorOf(await enablePlugin("w1", "calendar"))).toBe(
        "The plugin refused to be switched on: no calendar for you",
      );
      expect(rows).toEqual([]);
      expect(mockAuditCreate).not.toHaveBeenCalled();
      expect(mockRevalidate).not.toHaveBeenCalled();
      expect(state.generation).toBe(2);
    },
  );

  it("puts a row that was off back to off when the hook refuses", async () => {
    await installed("calendar");
    rows.push({ pluginId: "calendar", workspaceId: "w1", enabled: false });
    hooks.calendar = {
      onEnable: () => {
        throw new Error("no");
      },
    };
    await enablePlugin("w1", "calendar");
    expect(rows).toEqual([
      { pluginId: "calendar", workspaceId: "w1", enabled: false },
    ]);
  });

  it("is not run for a plugin the registry does not run", async () => {
    await installed("calendar");
    const ran = mock();
    hooks.calendar = { onEnable: ran };
    statuses.calendar = { state: "blocked", reason: "not-approved" };
    await enablePlugin("w1", "calendar");
    expect(ran).toHaveBeenCalledTimes(0);
  });
});

describe("switching off", () => {
  it("switches this workspace's row off, audits it with the workspace, and tells the registry and the cache", async () => {
    await installed("calendar");
    on("calendar");
    on("calendar", "w9");
    expect(await disablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(rows).toEqual([
      { pluginId: "calendar", workspaceId: "w1", enabled: false },
      { pluginId: "calendar", workspaceId: "w9", enabled: true },
    ]);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.workspace.disabled",
      actorId: "admin1",
      workspaceId: "w1",
      targetType: "plugin",
      targetId: "calendar",
      targetLabel: "calendar@1.0.0",
      meta: { version: "1.0.0", hook: "none" },
    });
    expect(state.snapshot).toBeNull();
    expect(state.generation).toBe(1);
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("keeps the row and what the workspace had set, so switching on again finds it", async () => {
    await installed("calendar");
    rows.push({
      pluginId: "calendar",
      workspaceId: "w1",
      enabled: true,
      config: { colour: "red" },
    });
    await disablePlugin("w1", "calendar");
    expect(rows).toEqual([
      {
        pluginId: "calendar",
        workspaceId: "w1",
        enabled: false,
        config: { colour: "red" },
      },
    ]);
  });

  it.each([
    ["there is no row", () => {}],
    ["the row is off", () => on("calendar", "w1", false)],
    ["it is on in another workspace only", () => on("calendar", "w9")],
  ])("does nothing, quietly, when %s", async (_name, arrange) => {
    await installed("calendar");
    arrange();
    const before = JSON.stringify(rows);
    expect(await disablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(JSON.stringify(rows)).toBe(before);
    expect(untouched()).toBe(true);
    expect(mockRegistryGet).not.toHaveBeenCalled();
  });

  it("does nothing, quietly, when another admin switched it off at the same moment", async () => {
    await installed("calendar");
    on("calendar");
    mockRowUpdateMany.mockImplementationOnce(async () => ({ count: 0 }));
    const ran = mock();
    hooks.calendar = { onDisable: ran };
    expect(await disablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
    expect(state.generation).toBe(0);
    expect(ran).toHaveBeenCalledTimes(0);
  });

  it("only switches off a row that is on: the write says so", async () => {
    await installed("calendar");
    on("calendar");
    await disablePlugin("w1", "calendar");
    expect(mockRowUpdateMany.mock.calls[0]?.[0]).toEqual({
      where: { pluginId: "calendar", workspaceId: "w1", enabled: true },
      data: { enabled: false },
    });
  });
});

describe("what depends on it in this workspace", () => {
  it("is refused while a plugin that needs it is on here, and names it", async () => {
    await installed("notes");
    await installed("board", { dependencies: { notes: "^1" } });
    on("notes");
    on("board");
    expect(errorOf(await disablePlugin("w1", "notes"))).toBe(
      "Not done. board needs it in this workspace. Switch that one off first.",
    );
    expect(enabledIn()).toEqual(["board", "notes"]);
    expect(untouched()).toBe(true);
  });

  it("names all of them when there are several", async () => {
    await installed("notes");
    await installed("wiki", { dependencies: { notes: "^1" } });
    await installed("board", { dependencies: { notes: "^1" } });
    on("notes");
    on("wiki");
    on("board");
    expect(errorOf(await disablePlugin("w1", "notes"))).toBe(
      "Not done. board, wiki need it in this workspace. Switch those off first.",
    );
  });

  it("does not count a plugin that needs it but is off here, or on in another workspace only", async () => {
    await installed("notes");
    await installed("board", { dependencies: { notes: "^1" } });
    await installed("wiki", { dependencies: { notes: "^1" } });
    on("notes");
    on("board", "w1", false);
    on("wiki", "w9");
    expect(await disablePlugin("w1", "notes")).toEqual({ ok: true });
  });

  it("does not count a plugin that does not need it", async () => {
    await installed("notes");
    await installed("board");
    on("notes");
    on("board");
    expect(await disablePlugin("w1", "notes")).toEqual({ ok: true });
    expect(enabledIn()).toEqual(["board"]);
  });

  it("can switch off the one that needs another, and then the other", async () => {
    await installed("notes");
    await installed("board", { dependencies: { notes: "^1" } });
    on("notes");
    on("board");
    expect(await disablePlugin("w1", "board")).toEqual({ ok: true });
    expect(await disablePlugin("w1", "notes")).toEqual({ ok: true });
    expect(enabledIn()).toEqual([]);
  });

  it("stays possible when the plugin directory cannot be read: nothing is known to need it", async () => {
    await installed("notes");
    await installed("board", { dependencies: { notes: "^1" } });
    on("notes");
    on("board");
    process.env.BARYNT_PLUGINS_DIR = "relative/plugins";
    expect(await disablePlugin("w1", "notes")).toEqual({ ok: true });
  });
});

describe("onDisable", () => {
  const context = {
    plugin: { id: "calendar", version: "1.0.0" },
    host: HOST,
    workspace: { id: "w1", name: "Team One" },
  };

  it("runs after the switch, with the plugin, the host and the workspace, and the audit says so", async () => {
    await installed("calendar");
    on("calendar");
    const seen: unknown[] = [];
    hooks.calendar = {
      onDisable: (ctx: unknown) => {
        seen.push(ctx, enabledIn(), state.generation);
      },
    };
    expect(await disablePlugin("w1", "calendar")).toEqual({ ok: true });
    expect(seen).toEqual([context, [], 1]);
    expect(mockAuditCreate.mock.calls[0]?.[0].data.meta).toEqual({
      version: "1.0.0",
      hook: "ran",
    });
  });

  it("uses the plugin as it ran before the switch, even when the registry has dropped it since", async () => {
    await installed("calendar");
    on("calendar");
    const ran = mock();
    const events: string[] = [];
    mockRegistryGet.mockImplementationOnce(async () => {
      events.push("registry read");
      return {
        problem: null,
        plugins: [],
        active: [
          {
            id: "calendar",
            version: "1.0.0",
            hooks: { onDisable: ran },
          },
        ],
      };
    });
    mockRowUpdateMany.mockImplementationOnce(async () => {
      events.push("switched off");
      return { count: 1 };
    });
    // From now on the registry no longer lists it.
    mockRegistryGet.mockResolvedValue({
      problem: null,
      plugins: [],
      active: [],
    });
    await disablePlugin("w1", "calendar");
    expect(events).toEqual(["registry read", "switched off"]);
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it("is the hook of this plugin and of no other, and no other hook", async () => {
    await installed("calendar");
    await installed("notes");
    on("calendar");
    const ran: string[] = [];
    hooks.calendar = {
      onEnable: () => void ran.push("calendar.onEnable"),
      onDisable: () => void ran.push("calendar.onDisable"),
    };
    hooks.notes = { onDisable: () => void ran.push("notes.onDisable") };
    await disablePlugin("w1", "calendar");
    expect(ran).toEqual(["calendar.onDisable"]);
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
    "cannot refuse: it is off all the same when the hook %s, with a warning",
    async (_n, onDisable) => {
      await installed("calendar");
      on("calendar");
      hooks.calendar = { onDisable };
      expect(await disablePlugin("w1", "calendar")).toEqual({
        ok: true,
        warning:
          "calendar is switched off, but its onDisable failed: cleanup failed",
      });
      expect(enabledIn()).toEqual([]);
      expect(mockAuditCreate.mock.calls[0]?.[0].data.meta).toEqual({
        version: "1.0.0",
        hook: "failed",
        hookError: "cleanup failed",
      });
      expect(state.snapshot).toBeNull();
      expect(mockRevalidate).toHaveBeenCalledTimes(1);
    },
  );

  it("says there was none when the plugin has no hook, or does not run", async () => {
    await installed("calendar");
    await installed("notes");
    on("calendar");
    on("notes");
    hooks.calendar = { onEnable: () => {} };
    await disablePlugin("w1", "calendar");
    expect(mockAuditCreate.mock.calls[0]?.[0].data.meta.hook).toBe("none");
    statuses.notes = { state: "blocked", reason: "not-approved" };
    const ran = mock();
    hooks.notes = { onDisable: ran };
    await disablePlugin("w1", "notes");
    expect(mockAuditCreate.mock.calls[1]?.[0].data.meta.hook).toBe("none");
    expect(ran).toHaveBeenCalledTimes(0);
  });
});
