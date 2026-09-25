import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// A project adding a plugin from the store. What matters: `plugin.enable` in that project first;
// the request is checked and the risk is confirmed on the server; the store is only there where
// the platform gave projects one (what it set for workspaces does not count), and where the
// platform asked for it only for what it released; the install is the platform's
// (`installFromStore`, for a plugin that applies per project only, with the project that asked);
// switching on follows and, when it cannot yet (the platform has not approved the code), that is
// a warning and not a failure of the add.

const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "member1",
);
const mockCuratedFindUnique = mock();
const mockSettingsFindUnique = mock();
const mockInstall = mock(
  async (_input: unknown): Promise<unknown> => ({ ok: true }),
);
const mockEnable = mock(
  async (_project: string, _id: string): Promise<unknown> => ({ ok: true }),
);

mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PLATFORM: { scope: "platform" },
}));
mock.module("@/lib/db", () => ({
  db: {
    pluginStoreCurated: { findUnique: mockCuratedFindUnique },
    systemSettings: { findUnique: mockSettingsFindUnique },
  },
}));
mock.module("@/features/plugins/storeInstall", () => ({
  installFromStore: mockInstall,
}));
mock.module("@/features/plugins/projectActions", () => ({
  enablePluginInProject: mockEnable,
}));

import { addStorePluginToProject } from "@/features/plugins/projectStoreActions";

const OPEN = {
  pluginStoreInWorkspaces: true,
  pluginStoreInProjects: true,
  pluginStoreCuratedOnly: false,
};
const add = (
  more: {
    project?: unknown;
    store?: unknown;
    plugin?: unknown;
    version?: unknown;
    input?: unknown;
  } = {},
) =>
  addStorePluginToProject(
    (more.project ?? "p-7") as string,
    (more.store ?? "store-1") as string,
    (more.plugin ?? "notes") as string,
    (more.version ?? "1.0.0") as string,
    ("input" in more ? more.input : { acknowledged: true }) as {
      acknowledged?: boolean;
    },
  );
const nothingDone = () => {
  expect(mockInstall).not.toHaveBeenCalled();
  expect(mockEnable).not.toHaveBeenCalled();
};

beforeEach(() => {
  for (const m of [
    mockRequirePermission,
    mockCuratedFindUnique,
    mockSettingsFindUnique,
    mockInstall,
    mockEnable,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("member1");
  mockSettingsFindUnique.mockResolvedValue(OPEN);
  mockCuratedFindUnique.mockResolvedValue({ pluginId: "notes" });
  mockInstall.mockResolvedValue({ ok: true });
  mockEnable.mockResolvedValue({ ok: true });
});

describe("who may", () => {
  it("asks for plugin.enable in the project of the request, first, and never for plugin.manage", async () => {
    await add();
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.enable", { projectId: "p-7" }],
    ]);
  });

  it("does nothing when it is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(add()).rejects.toThrow("not allowed");
    nothingDone();
    expect(mockSettingsFindUnique).not.toHaveBeenCalled();
  });

  it("does not even ask for a project that is not text", async () => {
    for (const project of [42, "", "w".repeat(101), undefined]) {
      expect(
        await addStorePluginToProject(
          project as never,
          "store-1",
          "notes",
          "1.0.0",
          {
            acknowledged: true,
          },
        ),
      ).toEqual({ error: "Invalid request." });
    }
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

describe("what is asked for", () => {
  it.each([
    ["a store id that is not text", { store: 42 }],
    ["an empty store id", { store: "" }],
    ["a store id that is too long", { store: "s".repeat(101) }],
    ["a plugin id that is a path", { plugin: "../etc" }],
    ["a plugin id that is not text", { plugin: true }],
    ["a plugin id with capitals", { plugin: "Notes" }],
    ["a version that is a range", { version: "^1.0.0" }],
    ["a version that is not text", { version: 1 }],
  ])("is refused with %s", async (_n, more) => {
    expect(await add(more)).toEqual({ error: "Invalid request." });
    nothingDone();
  });

  it.each([
    ["nothing", undefined],
    ["false", { acknowledged: false }],
    ["the text true", { acknowledged: "true" as never }],
    ["an empty object", {}],
  ])("needs the yes, and %s is not that", async (_n, input) => {
    expect(await add({ input })).toEqual({
      error:
        "Confirm that you have read what the plugin asks for before it is added.",
    });
    nothingDone();
  });
});

describe("what the platform allowed", () => {
  it("is nothing when the store is not shown in projects", async () => {
    mockSettingsFindUnique.mockResolvedValue({
      ...OPEN,
      pluginStoreInProjects: false,
    });
    expect(await add()).toEqual({
      error: "The plugin store is not available in projects.",
    });
    nothingDone();
  });

  it("is not closed by what the platform set for workspaces, nor opened by it", async () => {
    mockSettingsFindUnique.mockResolvedValue({
      ...OPEN,
      pluginStoreInWorkspaces: false,
    });
    expect(await add()).toEqual({ ok: true });
    mockInstall.mockClear();
    mockSettingsFindUnique.mockResolvedValue({
      ...OPEN,
      pluginStoreInWorkspaces: true,
      pluginStoreInProjects: false,
    });
    expect(await add()).toEqual({
      error: "The plugin store is not available in projects.",
    });
    expect(mockInstall).not.toHaveBeenCalled();
  });

  it("is nothing when the setting cannot be read: it does not fall back to open", async () => {
    mockSettingsFindUnique.mockRejectedValue(new Error("database down"));
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await add()).toEqual({
        error: "The plugin store is not available in projects.",
      });
    } finally {
      quiet.mockRestore();
    }
    nothingDone();
  });

  it("is everything by default, without a release", async () => {
    mockCuratedFindUnique.mockResolvedValue(null);
    expect(await add()).toEqual({ ok: true });
    expect(mockCuratedFindUnique).not.toHaveBeenCalled();
  });

  it("is only what was released, where the platform asked for that, for this store and this plugin", async () => {
    mockSettingsFindUnique.mockResolvedValue({
      ...OPEN,
      pluginStoreCuratedOnly: true,
    });
    expect(await add()).toEqual({ ok: true });
    expect(mockCuratedFindUnique).toHaveBeenCalledWith({
      where: { storeId_pluginId: { storeId: "store-1", pluginId: "notes" } },
      select: { pluginId: true },
    });
    mockInstall.mockClear();
    mockCuratedFindUnique.mockResolvedValue(null);
    expect(await add()).toEqual({
      error: "The platform has not released this plugin for projects.",
    });
    expect(mockInstall).not.toHaveBeenCalled();
  });
});

describe("the install", () => {
  it("is the platform's, for a plugin that applies per project, on behalf of this project and this person", async () => {
    await add();
    expect(mockInstall.mock.calls).toEqual([
      [
        {
          actorId: "member1",
          storeId: "store-1",
          pluginId: "notes",
          version: "1.0.0",
          only: "PROJECT",
          projectId: "p-7",
        },
      ],
    ]);
  });

  it("takes nothing from the client but the ids and the yes", async () => {
    await addStorePluginToProject("p-7", "store-1", "notes", "1.0.0", {
      acknowledged: true,
      source: "STORE",
      origin: "https://evil.example",
    } as never);
    expect(
      Object.keys(mockInstall.mock.calls[0]?.[0] as object).sort(),
    ).toEqual([
      "actorId",
      "only",
      "pluginId",
      "projectId",
      "storeId",
      "version",
    ]);
  });

  it("is what the installer says when it refuses, and nothing is switched on", async () => {
    mockInstall.mockResolvedValue({ error: "The store is switched off." });
    expect(await add()).toEqual({ error: "The store is switched off." });
    expect(mockEnable).not.toHaveBeenCalled();
  });
});

describe("the switch after it", () => {
  it("is in this project, for this plugin, once it is installed", async () => {
    expect(await add()).toEqual({ ok: true });
    expect(mockEnable.mock.calls).toEqual([["p-7", "notes"]]);
  });

  it("is a warning, not a failure, when it cannot be switched on yet: the plugin is added", async () => {
    mockEnable.mockResolvedValue({
      error: "The platform has not approved its code.",
    });
    expect(await add()).toEqual({
      ok: true,
      warning:
        "notes was added, but it is not switched on in this project yet: The platform has not approved its code.",
    });
  });

  it("passes on a warning of the switch", async () => {
    mockEnable.mockResolvedValue({
      ok: true,
      warning: "onProjectEnable was slow",
    });
    expect(await add()).toEqual({
      ok: true,
      warning: "onProjectEnable was slow",
    });
  });
});
