import { beforeEach, describe, expect, it, mock } from "bun:test";

// What a plugin reads of its own settings: `ctx.settings`. What matters: the values are the ones the
// host resolves (what is stored while it still fits the definition, else the default, else null), a
// plugin only ever reads its own, only where it is switched on (by the platform and, for a
// workspace or a project, there), only for a person who may see that workspace or project, and
// only at the level it applies to. One answer, `null`, for every "nothing to read here". No real
// session, no real database.

const mockAuth = mock();
const mockWorkspaceId = mock();
const mockCanEnter = mock();
const mockCan = mock();
const mockWorkspaceFind = mock();
const mockPluginFind = mock();
const mockPluginWorkspaceFind = mock();
const mockPluginProjectFind = mock();

mock.module("@/auth", () => ({ auth: mockAuth }));
mock.module("@/lib/permissions", () => ({
  canEnterWorkspace: mockCanEnter,
  can: mockCan,
}));
mock.module("@/lib/db", () => ({
  db: {
    workspace: { findUnique: mockWorkspaceFind },
    plugin: { findUnique: mockPluginFind },
    pluginWorkspace: { findUnique: mockPluginWorkspaceFind },
    pluginProject: { findUnique: mockPluginProjectFind },
  },
}));

import { getRegistryState } from "@/lib/plugins/registryState";
import { createHostServices } from "@/lib/plugins/services";

const READER = Symbol.for("barynt.currentWorkspaceReader");
const holder = globalThis as unknown as Record<symbol, unknown>;

const PLUGIN = { id: "reports", version: "1.0.0" };

/** The settings a manifest declares: a text with a default, a bounded number, a yes/no, a choice. */
const SETTINGS = [
  {
    id: "endpoint",
    type: "text",
    label: "Address",
    default: "https://default.example",
  },
  {
    id: "interval",
    type: "number",
    label: "Every",
    integer: true,
    min: 1,
    max: 60,
    default: 15,
  },
  { id: "enabled", type: "boolean", label: "On" },
  {
    id: "format",
    type: "select",
    label: "Format",
    options: [
      { value: "csv", label: "CSV" },
      { value: "json", label: "JSON" },
    ],
  },
];
const manifest = (
  scope: "platform" | "workspace" | "project",
  settings = SETTINGS,
) => ({ scope, contributes: { settings } }) as never;

/** Someone is signed in, in the workspace the request is in, and may enter it. */
function inWorkspace(id = "ws-7") {
  mockAuth.mockResolvedValue({
    user: { id: "u1", firstName: "Mara", lastName: "Velez" },
  });
  mockWorkspaceId.mockReturnValue(id);
  mockCanEnter.mockResolvedValue(true);
  mockWorkspaceFind.mockResolvedValue({ id, name: "Nimbus" });
}
const platformRow = (more: Record<string, unknown> = {}) => ({
  status: "ENABLED",
  scope: "WORKSPACE",
  config: {},
  ...more,
});

beforeEach(() => {
  for (const m of [
    mockAuth,
    mockWorkspaceId,
    mockCanEnter,
    mockCan,
    mockWorkspaceFind,
    mockPluginFind,
    mockPluginWorkspaceFind,
    mockPluginProjectFind,
  ]) {
    m.mockReset();
  }
  mockAuth.mockResolvedValue(null);
  mockWorkspaceId.mockReturnValue(null);
  holder[READER] = mockWorkspaceId;
  mockCanEnter.mockResolvedValue(false);
  mockCan.mockResolvedValue(false);
  mockWorkspaceFind.mockResolvedValue(null);
  mockPluginFind.mockResolvedValue(null);
  mockPluginWorkspaceFind.mockResolvedValue(null);
  mockPluginProjectFind.mockResolvedValue(null);
  getRegistryState().loading = 0;
});

const settingsOf = (
  scope: "platform" | "workspace" | "project",
  settings = SETTINGS,
) => createHostServices(PLUGIN, manifest(scope, settings)).settings;

describe("a plugin for the whole platform", () => {
  const row = (config: unknown, more: Record<string, unknown> = {}) =>
    platformRow({ scope: "PLATFORM", config, ...more });

  it("reads what the platform set, and the defaults for the rest, as null where there is none", async () => {
    mockPluginFind.mockResolvedValue(
      row({ endpoint: "https://set.example", format: "json" }),
    );
    expect(await settingsOf("platform").current()).toEqual({
      endpoint: "https://set.example",
      interval: 15,
      enabled: false,
      format: "json",
    });
  });

  it("gives null for a setting that is not set and has no default", async () => {
    mockPluginFind.mockResolvedValue(row({}));
    const values = await settingsOf("platform").current();
    expect(values?.format).toBeNull();
    expect(values?.interval).toBe(15);
  });

  it("gives the default where the stored value no longer fits the definition", async () => {
    mockPluginFind.mockResolvedValue(
      row({ interval: 999, format: "xml", endpoint: 5 }),
    );
    expect(await settingsOf("platform").current()).toEqual({
      endpoint: "https://default.example",
      interval: 15,
      enabled: false,
      format: null,
    });
  });

  it("has exactly the settings the manifest declares, never a stored key it does not", async () => {
    mockPluginFind.mockResolvedValue(
      row({ endpoint: "https://x.example", secret: "s3cret" }),
    );
    const values = await settingsOf("platform").current();
    expect(Object.keys(values ?? {}).sort()).toEqual([
      "enabled",
      "endpoint",
      "format",
      "interval",
    ]);
    expect(JSON.stringify(values)).not.toContain("s3cret");
  });

  it("copes with a stored config that is not an object", async () => {
    for (const config of [null, "text", 7, [], undefined]) {
      mockPluginFind.mockResolvedValue(row(config));
      expect((await settingsOf("platform").current())?.interval).toBe(15);
    }
  });

  it("has an empty answer, not null, for a plugin that declares no settings", async () => {
    mockPluginFind.mockResolvedValue(row({ anything: 1 }));
    expect(await settingsOf("platform", []).current()).toEqual({});
  });

  it("needs no request: it answers with nobody signed in and no workspace", async () => {
    mockPluginFind.mockResolvedValue(row({}));
    expect(await settingsOf("platform").current()).not.toBeNull();
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("answers while plugins load too: a boot that reads its own configuration gets it", async () => {
    getRegistryState().loading = 1;
    mockPluginFind.mockResolvedValue(row({}));
    expect(await settingsOf("platform").current()).not.toBeNull();
  });

  it("reads its own row, by its own id", async () => {
    mockPluginFind.mockResolvedValue(row({}));
    await createHostServices(
      { id: "other-plugin", version: "2.0.0" },
      manifest("platform"),
    ).settings.current();
    expect(mockPluginFind.mock.calls[0][0].where).toEqual({
      id: "other-plugin",
    });
  });

  it("is null when the platform has switched the plugin off, or it is not installed", async () => {
    mockPluginFind.mockResolvedValue(row({}, { status: "DISABLED" }));
    expect(await settingsOf("platform").current()).toBeNull();
    mockPluginFind.mockResolvedValue(null);
    expect(await settingsOf("platform").current()).toBeNull();
  });

  it("is null when the installed plugin is not of this level any more", async () => {
    mockPluginFind.mockResolvedValue(row({}, { scope: "WORKSPACE" }));
    expect(await settingsOf("platform").current()).toBeNull();
  });

  it("has nothing for a project: it is the platform's, not a project's", async () => {
    mockPluginFind.mockResolvedValue(row({}));
    expect(await settingsOf("platform").ofProject("p-1")).toBeNull();
    expect(mockPluginProjectFind).not.toHaveBeenCalled();
  });

  it("gives values a plugin cannot change", async () => {
    mockPluginFind.mockResolvedValue(row({}));
    const values = await settingsOf("platform").current();
    expect(Object.isFrozen(values)).toBe(true);
    expect(() => {
      (values as Record<string, unknown>).endpoint = "https://evil.example";
    }).toThrow();
  });

  it("gives a value that does not follow a later change of the stored one", async () => {
    const config = { endpoint: "https://first.example" };
    mockPluginFind.mockResolvedValue(row(config));
    const values = await settingsOf("platform").current();
    config.endpoint = "https://changed.example";
    expect(values?.endpoint).toBe("https://first.example");
  });
});

describe("a plugin for a workspace", () => {
  const here = (config: unknown, more: Record<string, unknown> = {}) => ({
    enabled: true,
    config,
    ...more,
  });

  it("reads what this workspace set, of the workspace the request is in", async () => {
    inWorkspace("ws-7");
    mockPluginFind.mockResolvedValue(platformRow());
    mockPluginWorkspaceFind.mockResolvedValue(here({ interval: 30 }));
    const values = await settingsOf("workspace").current();
    expect(values?.interval).toBe(30);
    expect(values?.endpoint).toBe("https://default.example");
    expect(mockPluginWorkspaceFind.mock.calls[0][0].where).toEqual({
      pluginId_workspaceId: { pluginId: "reports", workspaceId: "ws-7" },
    });
  });

  it("reads the workspace of another request, not the first one's", async () => {
    inWorkspace("ws-7");
    mockPluginFind.mockResolvedValue(platformRow());
    mockPluginWorkspaceFind.mockResolvedValue(here({}));
    const service = settingsOf("workspace");
    await service.current();
    inWorkspace("ws-9");
    await service.current();
    expect(
      mockPluginWorkspaceFind.mock.calls.map(
        (c) => c[0].where.pluginId_workspaceId.workspaceId,
      ),
    ).toEqual(["ws-7", "ws-9"]);
  });

  it("is null outside a request", async () => {
    mockPluginFind.mockResolvedValue(platformRow());
    expect(await settingsOf("workspace").current()).toBeNull();
    expect(mockPluginWorkspaceFind).not.toHaveBeenCalled();
  });

  it("is null for someone who is not signed in", async () => {
    inWorkspace();
    mockAuth.mockResolvedValue(null);
    mockPluginFind.mockResolvedValue(platformRow());
    mockPluginWorkspaceFind.mockResolvedValue(here({}));
    expect(await settingsOf("workspace").current()).toBeNull();
  });

  it("is null for someone who may not enter the workspace", async () => {
    inWorkspace();
    mockCanEnter.mockResolvedValue(false);
    mockPluginFind.mockResolvedValue(platformRow());
    mockPluginWorkspaceFind.mockResolvedValue(here({ interval: 30 }));
    expect(await settingsOf("workspace").current()).toBeNull();
    expect(mockPluginWorkspaceFind).not.toHaveBeenCalled();
  });

  it("is null while plugins load: a boot inside a request must not see that request's workspace", async () => {
    inWorkspace();
    getRegistryState().loading = 1;
    mockPluginFind.mockResolvedValue(platformRow());
    mockPluginWorkspaceFind.mockResolvedValue(here({}));
    expect(await settingsOf("workspace").current()).toBeNull();
  });

  it("is null where the workspace has the plugin off, or never switched it on", async () => {
    inWorkspace();
    mockPluginFind.mockResolvedValue(platformRow());
    mockPluginWorkspaceFind.mockResolvedValue(
      here({ interval: 30 }, { enabled: false }),
    );
    expect(await settingsOf("workspace").current()).toBeNull();
    mockPluginWorkspaceFind.mockResolvedValue(null);
    expect(await settingsOf("workspace").current()).toBeNull();
  });

  it("is null when the platform has switched the plugin off, whatever the workspace says", async () => {
    inWorkspace();
    mockPluginFind.mockResolvedValue(platformRow({ status: "DISABLED" }));
    mockPluginWorkspaceFind.mockResolvedValue(here({ interval: 30 }));
    expect(await settingsOf("workspace").current()).toBeNull();
    expect(mockPluginWorkspaceFind).not.toHaveBeenCalled();
  });

  it("is null when the installed plugin is not of this level any more", async () => {
    inWorkspace();
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PROJECT" }));
    mockPluginWorkspaceFind.mockResolvedValue(here({}));
    expect(await settingsOf("workspace").current()).toBeNull();
  });

  it("has nothing for a project: a workspace plugin's settings are the workspace's", async () => {
    inWorkspace();
    mockPluginFind.mockResolvedValue(platformRow());
    expect(await settingsOf("workspace").ofProject("p-1")).toBeNull();
    expect(mockPluginProjectFind).not.toHaveBeenCalled();
    expect(mockCan).not.toHaveBeenCalled();
  });

  it("gives the values as resolved, and frozen", async () => {
    inWorkspace();
    mockPluginFind.mockResolvedValue(platformRow());
    mockPluginWorkspaceFind.mockResolvedValue(
      here({ interval: 0, enabled: true }),
    );
    const values = await settingsOf("workspace").current();
    expect(values?.interval).toBe(15);
    expect(values?.enabled).toBe(true);
    expect(Object.isFrozen(values)).toBe(true);
  });
});

describe("a plugin for a project", () => {
  const here = (config: unknown, more: Record<string, unknown> = {}) => ({
    enabled: true,
    config,
    ...more,
  });
  function mayView(id = "u1") {
    mockAuth.mockResolvedValue({ user: { id } });
    mockCan.mockResolvedValue(true);
  }

  it("reads what the project set, for someone who may see the project", async () => {
    mayView();
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PROJECT" }));
    mockPluginProjectFind.mockResolvedValue(here({ format: "csv" }));
    const values = await settingsOf("project").ofProject("p-1");
    expect(values?.format).toBe("csv");
    expect(values?.interval).toBe(15);
    expect(mockPluginProjectFind.mock.calls[0][0].where).toEqual({
      pluginId_projectId: { pluginId: "reports", projectId: "p-1" },
    });
  });

  it("asks whether this person may see this project", async () => {
    mayView("u9");
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PROJECT" }));
    mockPluginProjectFind.mockResolvedValue(here({}));
    await settingsOf("project").ofProject("p-4");
    expect(mockCan.mock.calls).toEqual([
      ["u9", "project.view", { projectId: "p-4" }],
    ]);
  });

  it("is null for someone who may not see the project, and reads nothing of it", async () => {
    mayView();
    mockCan.mockResolvedValue(false);
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PROJECT" }));
    mockPluginProjectFind.mockResolvedValue(here({ format: "csv" }));
    expect(await settingsOf("project").ofProject("p-1")).toBeNull();
    expect(mockPluginProjectFind).not.toHaveBeenCalled();
  });

  it("is null for someone who is not signed in, and outside a request", async () => {
    mockCan.mockResolvedValue(true);
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PROJECT" }));
    mockPluginProjectFind.mockResolvedValue(here({}));
    expect(await settingsOf("project").ofProject("p-1")).toBeNull();
    expect(mockCan).not.toHaveBeenCalled();
  });

  it("is null while plugins load", async () => {
    mayView();
    getRegistryState().loading = 1;
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PROJECT" }));
    mockPluginProjectFind.mockResolvedValue(here({}));
    expect(await settingsOf("project").ofProject("p-1")).toBeNull();
  });

  it("is null where the project has the plugin off, or never switched it on", async () => {
    mayView();
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PROJECT" }));
    mockPluginProjectFind.mockResolvedValue(here({}, { enabled: false }));
    expect(await settingsOf("project").ofProject("p-1")).toBeNull();
    mockPluginProjectFind.mockResolvedValue(null);
    expect(await settingsOf("project").ofProject("p-1")).toBeNull();
  });

  it("is null when the platform has switched the plugin off, or it is not of this level any more", async () => {
    mayView();
    mockPluginProjectFind.mockResolvedValue(here({}));
    mockPluginFind.mockResolvedValue(
      platformRow({ scope: "PROJECT", status: "DISABLED" }),
    );
    expect(await settingsOf("project").ofProject("p-1")).toBeNull();
    mockPluginFind.mockResolvedValue(platformRow({ scope: "WORKSPACE" }));
    expect(await settingsOf("project").ofProject("p-1")).toBeNull();
  });

  it("is null for a project id that is no id, without asking anyone", async () => {
    mayView();
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PROJECT" }));
    for (const id of ["", undefined, null, 7, {}, ["p-1"]]) {
      expect(await settingsOf("project").ofProject(id as never)).toBeNull();
    }
    expect(mockCan).not.toHaveBeenCalled();
    expect(mockPluginProjectFind).not.toHaveBeenCalled();
  });

  it("has nothing for the current request: a project is named, not guessed", async () => {
    mayView();
    inWorkspace();
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PROJECT" }));
    mockPluginProjectFind.mockResolvedValue(here({}));
    // Even a workspace row for the same plugin must not answer for a plugin of the project level.
    mockPluginWorkspaceFind.mockResolvedValue({
      enabled: true,
      config: { interval: 30 },
    });
    expect(await settingsOf("project").current()).toBeNull();
    expect(mockPluginProjectFind).not.toHaveBeenCalled();
    expect(mockPluginWorkspaceFind).not.toHaveBeenCalled();
  });

  it("reads the project it is asked for, and each project apart", async () => {
    mayView();
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PROJECT" }));
    mockPluginProjectFind.mockImplementation(async ({ where }) =>
      here({
        format: where.pluginId_projectId.projectId === "p-1" ? "csv" : "json",
      }),
    );
    const service = settingsOf("project");
    expect((await service.ofProject("p-1"))?.format).toBe("csv");
    expect((await service.ofProject("p-2"))?.format).toBe("json");
  });
});

describe("the service of one plugin", () => {
  it("is frozen, and so is what it hands out", () => {
    const service = settingsOf("platform");
    expect(Object.isFrozen(service)).toBe(true);
    expect(() => {
      (service as { current: unknown }).current = async () => ({});
    }).toThrow();
  });

  it("belongs to the plugin it was made for: it reads that plugin's row and no other", async () => {
    mockPluginFind.mockResolvedValue(platformRow({ scope: "PLATFORM" }));
    const a = createHostServices(
      { id: "a-plugin", version: "1.0.0" },
      manifest("platform"),
    ).settings;
    const b = createHostServices(
      { id: "b-plugin", version: "1.0.0" },
      manifest("platform"),
    ).settings;
    await a.current();
    await b.current();
    expect(mockPluginFind.mock.calls.map((c) => c[0].where.id)).toEqual([
      "a-plugin",
      "b-plugin",
    ]);
  });

  it("uses the settings of the manifest it was made with, not another plugin's", async () => {
    mockPluginFind.mockResolvedValue(
      platformRow({ scope: "PLATFORM", config: { one: "x" } }),
    );
    const one = settingsOf("platform", [
      { id: "one", type: "text", label: "One" } as never,
    ]);
    const two = settingsOf("platform", [
      { id: "two", type: "text", label: "Two" } as never,
    ]);
    expect(await one.current()).toEqual({ one: "x" });
    expect(await two.current()).toEqual({ two: null });
  });
});
