import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Saving a plugin's settings. What matters: the permission of the level the plugin applies to,
// asked first (`plugin.manage` for the platform's, `plugin.enable` in the workspace or project for
// theirs); only that level can save them, and only where the plugin is on; what is sent is checked
// against what the plugin's own manifest declares, so a key the plugin does not have or a value that
// does not fit is refused and nothing is written; only what differs from the default is kept;
// a change is audited with the settings it touched and never with their values; and nothing that
// decides what may run is told. The plugin directory is real, the database is an in-memory stand-in.

const mockPluginFindUnique = mock();
const mockPluginUpdateMany = mock();
const mockWorkspaceRowFindUnique = mock();
const mockWorkspaceRowUpdateMany = mock();
const mockProjectRowFindUnique = mock();
const mockProjectRowUpdateMany = mock();
const mockProjectFindUnique = mock();
const mockAuditCreate = mock();
const mockRevalidate = mock();
const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "admin1",
);

mock.module("@/lib/db", () => ({
  db: {
    plugin: {
      findUnique: mockPluginFindUnique,
      updateMany: mockPluginUpdateMany,
    },
    pluginWorkspace: {
      findUnique: mockWorkspaceRowFindUnique,
      updateMany: mockWorkspaceRowUpdateMany,
    },
    pluginProject: {
      findUnique: mockProjectRowFindUnique,
      updateMany: mockProjectRowUpdateMany,
    },
    project: { findUnique: mockProjectFindUnique },
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
  savePlatformPluginSettings,
  saveProjectPluginSettings,
  saveWorkspacePluginSettings,
} from "@/features/plugins/settingsActions";
import { getRegistryState } from "@/lib/plugins/registryState";

const state = getRegistryState();

let root: string;
let savedDir: string | undefined;

const SETTINGS = [
  {
    id: "title",
    type: "text",
    label: "Title",
    default: "Board",
    maxLength: 20,
  },
  {
    id: "limit",
    type: "number",
    label: "Limit",
    min: 1,
    max: 100,
    integer: true,
  },
  { id: "compact", type: "boolean", label: "Compact" },
  {
    id: "view",
    type: "select",
    label: "View",
    options: [
      { value: "board", label: "Board" },
      { value: "list", label: "List" },
    ],
    default: "board",
  },
  { id: "hook", type: "text", label: "Hook", format: "url", required: true },
];
const VALID = { hook: "https://example.com/hook" };

/** The plugin is in the directory, with settings unless said otherwise, and installed. */
async function install(
  id: string,
  scope: "workspace" | "project" | "platform",
  more: {
    settings?: unknown[];
    version?: string;
    files?: boolean;
    row?: Record<string, unknown> | null;
  } = {},
) {
  const version = more.version ?? "1.0.0";
  if (more.files !== false) {
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
        scope,
        contributes: { settings: more.settings ?? SETTINGS },
      }),
    );
  }
  mockPluginFindUnique.mockImplementation(
    async (args: { where: { id: string } }) =>
      args.where.id === id
        ? { version, scope: scope.toUpperCase(), config: more.row ?? {} }
        : null,
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-settings-"));
  savedDir = process.env.BARYNT_PLUGINS_DIR;
  process.env.BARYNT_PLUGINS_DIR = root;
  for (const m of [
    mockPluginFindUnique,
    mockPluginUpdateMany,
    mockWorkspaceRowFindUnique,
    mockWorkspaceRowUpdateMany,
    mockProjectRowFindUnique,
    mockProjectRowUpdateMany,
    mockProjectFindUnique,
    mockAuditCreate,
    mockRevalidate,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("admin1");
  mockPluginFindUnique.mockResolvedValue(null);
  mockPluginUpdateMany.mockResolvedValue({ count: 1 });
  mockWorkspaceRowFindUnique.mockResolvedValue({ enabled: true, config: {} });
  mockWorkspaceRowUpdateMany.mockResolvedValue({ count: 1 });
  mockProjectRowFindUnique.mockResolvedValue({ enabled: true, config: {} });
  mockProjectRowUpdateMany.mockResolvedValue({ count: 1 });
  mockProjectFindUnique.mockResolvedValue({ workspaceId: "w1" });
  mockAuditCreate.mockResolvedValue({});
  state.snapshot = { builtAt: 0 } as never;
  state.generation = 0;
});

afterEach(async () => {
  if (savedDir === undefined) delete process.env.BARYNT_PLUGINS_DIR;
  else process.env.BARYNT_PLUGINS_DIR = savedDir;
  await rm(root, { recursive: true, force: true });
});

const errorOf = (result: unknown) => (result as { error: string }).error;
const issuesOf = (result: unknown) =>
  (result as { issues?: { id: string; message: string }[] }).issues;

/** Nothing was written, audited or told to the cache or the registry. */
function untouched(): boolean {
  return (
    mockPluginUpdateMany.mock.calls.length === 0 &&
    mockWorkspaceRowUpdateMany.mock.calls.length === 0 &&
    mockProjectRowUpdateMany.mock.calls.length === 0 &&
    mockAuditCreate.mock.calls.length === 0 &&
    mockRevalidate.mock.calls.length === 0
  );
}

describe("who may", () => {
  it("asks for plugin.manage on the platform for a platform plugin, first", async () => {
    await install("audit", "platform");
    await savePlatformPluginSettings("audit", VALID);
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.manage", { scope: "platform" }],
    ]);
  });

  it("asks for plugin.enable in that workspace for a workspace's, and never for plugin.manage", async () => {
    await install("board", "workspace");
    await saveWorkspacePluginSettings("w1", "board", VALID);
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.enable", { workspaceId: "w1" }],
    ]);
  });

  it("asks for plugin.enable in that project for a project's", async () => {
    await install("board", "project");
    await saveProjectPluginSettings("p1", "board", VALID);
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.enable", { projectId: "p1" }],
    ]);
  });

  it("reads nothing and writes nothing when the permission is refused, at any level", async () => {
    await install("board", "workspace");
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(savePlatformPluginSettings("board", VALID)).rejects.toThrow(
      "not allowed",
    );
    await expect(
      saveWorkspacePluginSettings("w1", "board", VALID),
    ).rejects.toThrow("not allowed");
    await expect(
      saveProjectPluginSettings("p1", "board", VALID),
    ).rejects.toThrow("not allowed");
    expect(mockPluginFindUnique).not.toHaveBeenCalled();
    expect(mockProjectFindUnique).not.toHaveBeenCalled();
    expect(untouched()).toBe(true);
  });

  it.each([
    ["nothing", undefined],
    ["an empty id", ""],
    ["no text", 42],
    ["a very long id", "w".repeat(101)],
  ])(
    "does not even ask for the permission for a workspace or a project given as %s",
    async (_n, id) => {
      expect(
        await saveWorkspacePluginSettings(id as string, "board", VALID),
      ).toEqual({ error: "Invalid request." });
      expect(
        await saveProjectPluginSettings(id as string, "board", VALID),
      ).toEqual({ error: "Invalid request." });
      expect(mockRequirePermission).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a path", "../etc"],
    ["capitals", "Board"],
    ["no text", 42],
    ["nothing", undefined],
  ])(
    "is refused for a plugin given as %s, before anything is read",
    async (_n, id) => {
      expect(await savePlatformPluginSettings(id as string, VALID)).toEqual({
        error: "Invalid request.",
      });
      expect(
        await saveWorkspacePluginSettings("w1", id as string, VALID),
      ).toEqual({ error: "Invalid request." });
      expect(
        await saveProjectPluginSettings("p1", id as string, VALID),
      ).toEqual({
        error: "Invalid request.",
      });
      expect(mockPluginFindUnique).not.toHaveBeenCalled();
    },
  );
});

describe("which plugin, and where", () => {
  it("is refused for a plugin that is not installed", async () => {
    expect(errorOf(await savePlatformPluginSettings("audit", VALID))).toBe(
      "Unknown plugin.",
    );
    expect(
      errorOf(await saveWorkspacePluginSettings("w1", "board", VALID)),
    ).toBe("Unknown plugin.");
    expect(errorOf(await saveProjectPluginSettings("p1", "board", VALID))).toBe(
      "Unknown plugin.",
    );
    expect(untouched()).toBe(true);
  });

  it("is only for the level the plugin applies to: not a project's plugin by a workspace, not a workspace's by the platform", async () => {
    await install("board", "project");
    expect(
      errorOf(await saveWorkspacePluginSettings("w1", "board", VALID)),
    ).toBe(
      "This plugin does not apply per workspace, so it has no settings there.",
    );
    expect(errorOf(await savePlatformPluginSettings("board", VALID))).toBe(
      "This plugin does not apply to the whole platform, so the platform has no settings for it.",
    );
    await install("board", "workspace");
    expect(errorOf(await saveProjectPluginSettings("p1", "board", VALID))).toBe(
      "This plugin does not apply per project, so it has no settings there.",
    );
    await install("board", "platform");
    expect(
      errorOf(await saveWorkspacePluginSettings("w1", "board", VALID)),
    ).toContain("does not apply per workspace");
    expect(
      errorOf(await saveProjectPluginSettings("p1", "board", VALID)),
    ).toContain("does not apply per project");
    expect(untouched()).toBe(true);
  });

  it("is refused for a project that is not there", async () => {
    await install("board", "project");
    mockProjectFindUnique.mockResolvedValue(null);
    expect(errorOf(await saveProjectPluginSettings("p9", "board", VALID))).toBe(
      "Unknown project.",
    );
    expect(mockProjectFindUnique).toHaveBeenCalledWith({
      where: { id: "p9" },
      select: { workspaceId: true },
    });
    expect(untouched()).toBe(true);
  });

  it("is refused for a plugin without settings, and for one whose manifest cannot be read", async () => {
    await install("board", "workspace", { settings: [] });
    expect(errorOf(await saveWorkspacePluginSettings("w1", "board", {}))).toBe(
      "This plugin has no settings.",
    );
    await install("ghost", "workspace", { files: false });
    expect(
      errorOf(await saveWorkspacePluginSettings("w1", "ghost", VALID)),
    ).toContain("manifest cannot be read");
    expect(untouched()).toBe(true);
  });

  it("reads the manifest of the version that is installed, not another that lies there", async () => {
    await install("board", "workspace", {
      version: "1.1.0",
      settings: [{ id: "old", type: "text", label: "Old" }],
    });
    await install("board", "workspace", { version: "1.0.0" });
    mockPluginFindUnique.mockResolvedValue({
      version: "1.1.0",
      scope: "WORKSPACE",
      config: {},
    });
    expect(
      await saveWorkspacePluginSettings("w1", "board", { old: "x" }),
    ).toEqual({
      ok: true,
    });
    expect(
      errorOf(await saveWorkspacePluginSettings("w1", "board", VALID)),
    ).toBe("Some settings are not valid.");
  });

  it("is refused, and says why, when there is no usable plugin directory", async () => {
    await install("board", "workspace");
    process.env.BARYNT_PLUGINS_DIR = "relative/plugins";
    expect(
      errorOf(await saveWorkspacePluginSettings("w1", "board", VALID)),
    ).toContain("must be an absolute path");
    expect(untouched()).toBe(true);
  });

  it("is refused for a workspace or a project where the plugin is not switched on, or was switched off", async () => {
    await install("board", "workspace");
    mockWorkspaceRowFindUnique.mockResolvedValue(null);
    expect(
      errorOf(await saveWorkspacePluginSettings("w1", "board", VALID)),
    ).toBe("Switch the plugin on in this workspace first.");
    mockWorkspaceRowFindUnique.mockResolvedValue({
      enabled: false,
      config: {},
    });
    expect(
      errorOf(await saveWorkspacePluginSettings("w1", "board", VALID)),
    ).toBe("Switch the plugin on in this workspace first.");
    await install("board", "project");
    mockProjectRowFindUnique.mockResolvedValue(null);
    expect(errorOf(await saveProjectPluginSettings("p1", "board", VALID))).toBe(
      "Switch the plugin on in this project first.",
    );
    mockProjectRowFindUnique.mockResolvedValue({ enabled: false, config: {} });
    expect(errorOf(await saveProjectPluginSettings("p1", "board", VALID))).toBe(
      "Switch the plugin on in this project first.",
    );
    expect(untouched()).toBe(true);
  });

  it("looks for the row of exactly this plugin in exactly this workspace or project", async () => {
    await install("board", "workspace");
    await saveWorkspacePluginSettings("w1", "board", VALID);
    expect(mockWorkspaceRowFindUnique).toHaveBeenCalledWith({
      where: { pluginId_workspaceId: { pluginId: "board", workspaceId: "w1" } },
      select: { enabled: true, config: true },
    });
    await install("board", "project");
    await saveProjectPluginSettings("p1", "board", VALID);
    expect(mockProjectRowFindUnique).toHaveBeenCalledWith({
      where: { pluginId_projectId: { pluginId: "board", projectId: "p1" } },
      select: { enabled: true, config: true },
    });
  });
});

describe("what is sent", () => {
  it("is refused when a value does not fit, with the setting and what is wrong, and nothing is written", async () => {
    await install("board", "workspace");
    const result = await saveWorkspacePluginSettings("w1", "board", {
      ...VALID,
      limit: 0,
      view: "grid",
    });
    expect(errorOf(result)).toBe("Some settings are not valid.");
    expect(issuesOf(result)).toEqual([
      { id: "limit", message: "must be at least 1" },
      { id: "view", message: "must be one of the choices" },
    ]);
    expect(untouched()).toBe(true);
  });

  it("is refused when it holds a key the plugin does not have, which the form never sends", async () => {
    await install("board", "workspace");
    const result = await saveWorkspacePluginSettings("w1", "board", {
      ...VALID,
      admin: true,
      __proto__x: 1,
    });
    expect(issuesOf(result)).toEqual([
      { id: "admin", message: "is not a setting of this plugin" },
      { id: "__proto__x", message: "is not a setting of this plugin" },
    ]);
    expect(untouched()).toBe(true);
  });

  it("is refused when a required setting is missing", async () => {
    await install("board", "workspace");
    expect(
      issuesOf(await saveWorkspacePluginSettings("w1", "board", {})),
    ).toEqual([{ id: "hook", message: "is required" }]);
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a text", "hook"],
    ["a list", [VALID]],
  ])("is refused when it is not an object: %s", async (_n, values) => {
    await install("board", "workspace");
    expect(
      issuesOf(await saveWorkspacePluginSettings("w1", "board", values)),
    ).toEqual([{ id: "", message: "must be an object" }]);
    expect(untouched()).toBe(true);
  });

  it("is checked before the row is written, and a manifest that asks for something else is not the client's to change", async () => {
    await install("board", "workspace");
    // The client says what it likes about the plugin; only the manifest decides.
    const result = await saveWorkspacePluginSettings("w1", "board", {
      ...VALID,
      title: "x".repeat(21),
    });
    expect(issuesOf(result)).toEqual([
      { id: "title", message: "must be at most 20 characters" },
    ]);
  });
});

describe("saving for a workspace", () => {
  it("keeps only what differs from the default, on the row of this plugin in this workspace, and only while it is on", async () => {
    await install("board", "workspace");
    expect(
      await saveWorkspacePluginSettings("w1", "board", {
        title: "Sprint",
        limit: 20,
        compact: true,
        view: "board",
        hook: "https://example.com/hook",
      }),
    ).toEqual({ ok: true });
    expect(mockWorkspaceRowUpdateMany.mock.calls).toEqual([
      [
        {
          where: { pluginId: "board", workspaceId: "w1", enabled: true },
          data: {
            config: {
              title: "Sprint",
              limit: 20,
              compact: true,
              hook: "https://example.com/hook",
            },
          },
        },
      ],
    ]);
  });

  it("audits which settings it touched, with the workspace, and never their values", async () => {
    await install("board", "workspace");
    mockWorkspaceRowFindUnique.mockResolvedValue({
      enabled: true,
      config: { limit: 5, hook: "https://old.example.com" },
    });
    await saveWorkspacePluginSettings("w1", "board", {
      limit: 5,
      compact: true,
      hook: "https://secret-looking.example.com/token",
    });
    expect(mockAuditCreate.mock.calls).toHaveLength(1);
    const data = mockAuditCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      action: "plugin.settings.changed",
      actorId: "admin1",
      workspaceId: "w1",
      targetType: "plugin",
      targetId: "board",
      targetLabel: "board@1.0.0",
      meta: {
        version: "1.0.0",
        level: "workspace",
        changed: ["compact", "hook"],
      },
    });
    expect(data.projectId ?? null).toBeNull();
    expect(JSON.stringify(data)).not.toContain("secret-looking");
    expect(JSON.stringify(data)).not.toContain("old.example");
  });

  it("does nothing, and says ok, when the values are the ones stored already, whatever order they are in", async () => {
    await install("board", "workspace");
    mockWorkspaceRowFindUnique.mockResolvedValue({
      enabled: true,
      config: { limit: 5, hook: "https://example.com/hook" },
    });
    expect(
      await saveWorkspacePluginSettings("w1", "board", {
        hook: "https://example.com/hook",
        limit: 5,
      }),
    ).toEqual({ ok: true });
    expect(untouched()).toBe(true);
  });

  it("saves a change back to the defaults, and audits it", async () => {
    await install("board", "workspace");
    mockWorkspaceRowFindUnique.mockResolvedValue({
      enabled: true,
      config: { title: "Sprint", hook: "https://example.com/hook" },
    });
    await saveWorkspacePluginSettings("w1", "board", VALID);
    expect(mockWorkspaceRowUpdateMany.mock.calls[0]?.[0].data).toEqual({
      config: { hook: "https://example.com/hook" },
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.meta.changed).toEqual([
      "title",
    ]);
  });

  it("tells the cache, and not the registry: nothing that decides what may run changed", async () => {
    await install("board", "workspace");
    await saveWorkspacePluginSettings("w1", "board", VALID);
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
    expect(state.generation).toBe(0);
    expect(state.snapshot).not.toBeNull();
  });

  it("writes nothing, and says so, when the plugin was switched off while the settings were saved", async () => {
    await install("board", "workspace");
    mockWorkspaceRowUpdateMany.mockResolvedValue({ count: 0 });
    expect(
      errorOf(await saveWorkspacePluginSettings("w1", "board", VALID)),
    ).toBe("Switch the plugin on in this workspace first.");
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("does not swallow a database error", async () => {
    await install("board", "workspace");
    mockWorkspaceRowUpdateMany.mockRejectedValue(new Error("connection lost"));
    await expect(
      saveWorkspacePluginSettings("w1", "board", VALID),
    ).rejects.toThrow("connection lost");
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe("saving for a project", () => {
  it("keeps only what differs from the default, on the row of this plugin in this project", async () => {
    await install("board", "project");
    expect(
      await saveProjectPluginSettings("p1", "board", { ...VALID, limit: 3 }),
    ).toEqual({ ok: true });
    expect(mockProjectRowUpdateMany.mock.calls).toEqual([
      [
        {
          where: { pluginId: "board", projectId: "p1", enabled: true },
          data: { config: { limit: 3, hook: "https://example.com/hook" } },
        },
      ],
    ]);
    expect(mockWorkspaceRowUpdateMany).not.toHaveBeenCalled();
  });

  it("audits with the project and its workspace", async () => {
    await install("board", "project");
    await saveProjectPluginSettings("p1", "board", VALID);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.settings.changed",
      workspaceId: "w1",
      projectId: "p1",
      targetId: "board",
      meta: { level: "project", changed: ["hook"], version: "1.0.0" },
    });
  });

  it("does nothing when nothing changed, and writes nothing when the plugin was switched off meanwhile", async () => {
    await install("board", "project");
    mockProjectRowFindUnique.mockResolvedValue({
      enabled: true,
      config: VALID,
    });
    expect(await saveProjectPluginSettings("p1", "board", VALID)).toEqual({
      ok: true,
    });
    expect(untouched()).toBe(true);
    mockProjectRowFindUnique.mockResolvedValue({ enabled: true, config: {} });
    mockProjectRowUpdateMany.mockResolvedValue({ count: 0 });
    expect(errorOf(await saveProjectPluginSettings("p1", "board", VALID))).toBe(
      "Switch the plugin on in this project first.",
    );
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe("saving for the platform", () => {
  it("writes the plugin's own row, only if it applies to the whole platform, and audits without a workspace", async () => {
    await install("audit", "platform", {
      row: { hook: "https://example.com/hook", limit: 5 },
    });
    expect(
      await savePlatformPluginSettings("audit", {
        hook: "https://example.com/hook",
        compact: true,
      }),
    ).toEqual({ ok: true });
    expect(mockPluginUpdateMany.mock.calls).toEqual([
      [
        {
          where: { id: "audit", scope: "PLATFORM" },
          data: {
            config: { hook: "https://example.com/hook", compact: true },
          },
        },
      ],
    ]);
    const data = mockAuditCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      action: "plugin.settings.changed",
      targetId: "audit",
      meta: {
        level: "platform",
        changed: ["compact", "limit"],
        version: "1.0.0",
      },
    });
    expect(data.workspaceId ?? null).toBeNull();
    expect(data.projectId ?? null).toBeNull();
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
    expect(state.generation).toBe(0);
  });

  it("does nothing when nothing changed, and says the plugin is unknown when the row is gone", async () => {
    await install("audit", "platform", { row: VALID });
    expect(await savePlatformPluginSettings("audit", VALID)).toEqual({
      ok: true,
    });
    expect(untouched()).toBe(true);
    await install("audit", "platform");
    mockPluginUpdateMany.mockResolvedValue({ count: 0 });
    expect(errorOf(await savePlatformPluginSettings("audit", VALID))).toBe(
      "Unknown plugin.",
    );
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("refuses values that do not fit, like any level", async () => {
    await install("audit", "platform");
    expect(
      issuesOf(await savePlatformPluginSettings("audit", { hook: "nope" })),
    ).toEqual([{ id: "hook", message: "must be a full web address" }]);
    expect(untouched()).toBe(true);
  });
});
