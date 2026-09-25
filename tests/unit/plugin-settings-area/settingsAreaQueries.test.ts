import { beforeEach, describe, expect, it, mock } from "bun:test";

// What the plugins' settings of a workspace read, and who is offered them. What matters: it is
// asked as **this person**: the workspace's own plugins only with `plugin.enable` in the
// workspace, a project's only in the projects they hold it in (all asked at once), nothing is read
// for someone who holds it nowhere (the caller turns `null` into "page not found"), and a project's
// values are that project's and no other's. Own process: it replaces the database, the permissions
// and the overview, which have their own tests.

const mockUserId = mock(async (): Promise<string | null> => "u1");
const mockGetAccess = mock();
const mockProjectIdsWith = mock();
const mockLoadOverview = mock();
const mockWorkspaceRows = mock();
const mockProjectRows = mock();
const mockAvatar = mock();

mock.module("@/lib/permissions", () => ({
  currentUserId: mockUserId,
  getAccess: mockGetAccess,
  projectIdsWith: mockProjectIdsWith,
}));
mock.module("@/lib/db", () => ({
  db: {
    pluginWorkspace: { findMany: mockWorkspaceRows },
    pluginProject: { findMany: mockProjectRows },
  },
}));
mock.module("@/lib/storage", () => ({ resolveAvatarUrl: mockAvatar }));
mock.module("@/features/plugins/queries", () => ({
  loadOverview: mockLoadOverview,
}));

import type { InstalledPlugin } from "@/features/plugins/overview";
import {
  canOpenPluginSettings,
  getPluginSettingsArea,
} from "@/features/plugins/settingsAreaQueries";
import type { SettingField } from "@/lib/plugins/settings";

const field: SettingField = {
  id: "title",
  type: "text",
  label: "Title",
  description: null,
  required: false,
  placeholder: null,
  format: null,
  maxLength: 200,
  min: null,
  max: null,
  integer: false,
  options: [],
  default: "Untitled",
};

function installed(more: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return {
    id: "notes",
    version: "1.0.0",
    name: "Notes",
    description: "Takes notes",
    author: "Acme",
    license: "MIT",
    homepage: null,
    repository: null,
    categories: [],
    capabilities: [],
    scope: "WORKSPACE",
    source: "STORE",
    origin: null,
    unsigned: false,
    hasCode: false,
    platformOn: true,
    workspaces: 1,
    projects: 0,
    state: { kind: "running", mode: "declarative" },
    approval: { kind: "none" },
    integrity: "sha512-x",
    update: null,
    previousVersion: null,
    settings: [field],
    settingValues: null,
    storeUpdate: null,
    ...more,
  };
}
const overview = (plugins: InstalledPlugin[]) => ({
  dir: "/plugins",
  problem: null,
  issues: [],
  allowUnsigned: false,
  installed: plugins,
  available: [],
  unusable: [],
});
const webApp = {
  id: "p-1",
  slug: "web-app",
  name: "Web App",
  color: "#3b82f6",
  avatarKey: "avatars/web.png",
};
const mobile = {
  id: "p-2",
  slug: "mobile",
  name: "Mobile",
  color: "#22c55e",
  avatarKey: null,
};

/** What the person may do: the workspace's own plugins, and the projects they may set plugins up in. */
function as(workspace: boolean, projects: string[] = []) {
  mockGetAccess.mockResolvedValue({
    has: (permission: string) => workspace && permission === "plugin.enable",
  });
  mockProjectIdsWith.mockResolvedValue(new Set(projects));
}

beforeEach(() => {
  for (const m of [
    mockUserId,
    mockGetAccess,
    mockProjectIdsWith,
    mockLoadOverview,
    mockWorkspaceRows,
    mockProjectRows,
    mockAvatar,
  ]) {
    m.mockReset();
  }
  mockUserId.mockResolvedValue("u1");
  mockLoadOverview.mockResolvedValue(
    overview([
      installed(),
      installed({
        id: "roadmap",
        name: "Roadmap",
        scope: "PROJECT",
        workspaces: 0,
        projects: 2,
      }),
    ]),
  );
  mockWorkspaceRows.mockResolvedValue([]);
  mockProjectRows.mockResolvedValue([]);
  mockAvatar.mockResolvedValue(undefined);
  as(true);
});

describe("the plugins' settings of a workspace", () => {
  it("are nothing, and read nothing, without a session", async () => {
    mockUserId.mockResolvedValue(null);
    expect(await getPluginSettingsArea("ws-7", "de")).toBeNull();
    expect(mockLoadOverview).not.toHaveBeenCalled();
    expect(mockWorkspaceRows).not.toHaveBeenCalled();
  });

  it("are null, and read nothing, for someone who may set plugins up nowhere", async () => {
    as(false, []);
    expect(await getPluginSettingsArea("ws-7", "de")).toBeNull();
    expect(mockLoadOverview).not.toHaveBeenCalled();
    expect(mockWorkspaceRows).not.toHaveBeenCalled();
    expect(mockProjectRows).not.toHaveBeenCalled();
  });

  it("ask for plugin.enable in this workspace and in the projects of it, for this person", async () => {
    await getPluginSettingsArea("ws-7", "de");
    expect(mockGetAccess.mock.calls).toEqual([[{ workspaceId: "ws-7" }]]);
    expect(mockProjectIdsWith.mock.calls).toEqual([
      ["u1", "ws-7", "plugin.enable"],
    ]);
  });

  it("are the workspace's own plugins for whoever may set them up", async () => {
    mockWorkspaceRows.mockResolvedValue([
      { pluginId: "notes", config: { title: "Mine" } },
    ]);
    const area = await getPluginSettingsArea("ws-7", "de");
    expect(area?.ownWorkspace).toBe(true);
    expect(area?.plugins.map((p) => p.id)).toEqual(["notes"]);
    expect(area?.plugins[0].settings?.values).toEqual({ title: "Mine" });
  });

  it("list only the plugins this workspace has switched on, not every one the platform has", async () => {
    mockLoadOverview.mockResolvedValue(
      overview([
        installed({ id: "notes", name: "Notes" }),
        installed({ id: "other", name: "Other" }),
      ]),
    );
    mockWorkspaceRows.mockResolvedValue([{ pluginId: "notes", config: {} }]);
    const area = await getPluginSettingsArea("ws-7", "de");
    expect(area?.plugins.map((p) => p.id)).toEqual(["notes"]);
  });

  it("list only the plugins a project has switched on, not every one the platform has", async () => {
    as(false, ["p-1"]);
    mockLoadOverview.mockResolvedValue(
      overview([
        installed({ id: "roadmap", name: "Roadmap", scope: "PROJECT" }),
        installed({ id: "gantt", name: "Gantt", scope: "PROJECT" }),
      ]),
    );
    mockProjectRows.mockResolvedValue([
      { pluginId: "roadmap", projectId: "p-1", config: {}, project: webApp },
    ]);
    const area = await getPluginSettingsArea("ws-7", "de");
    expect(area?.projectPlugins.map((p) => p.id)).toEqual(["roadmap"]);
  });

  it("read the switches of this workspace, the ones that are on", async () => {
    await getPluginSettingsArea("ws-7", "de");
    expect(mockWorkspaceRows.mock.calls[0][0]).toEqual({
      where: { workspaceId: "ws-7", enabled: true },
      select: { pluginId: true, config: true },
    });
  });

  it("read the overview in the reader's language", async () => {
    await getPluginSettingsArea("ws-7", "de");
    expect(mockLoadOverview.mock.calls[0][0]).toBe("de");
  });

  it("do not read the projects' switches for someone who may set up none", async () => {
    as(true, []);
    await getPluginSettingsArea("ws-7", "de");
    expect(mockProjectRows).not.toHaveBeenCalled();
  });

  it("are the projects' alone for someone who may set plugins up in a project only, and read nothing of the workspace's", async () => {
    as(false, ["p-1"]);
    mockProjectRows.mockResolvedValue([
      {
        pluginId: "roadmap",
        projectId: "p-1",
        config: { title: "Q3" },
        project: webApp,
      },
    ]);
    const area = await getPluginSettingsArea("ws-7", "de");
    expect(area?.ownWorkspace).toBe(false);
    expect(area?.plugins).toEqual([]);
    expect(area?.projectPlugins.map((p) => p.id)).toEqual(["roadmap"]);
    expect(mockWorkspaceRows).not.toHaveBeenCalled();
  });

  it("read only the projects they may set up, the ones the switches are on in", async () => {
    as(false, ["p-1", "p-2"]);
    await getPluginSettingsArea("ws-7", "de");
    const query = mockProjectRows.mock.calls[0][0];
    expect(query.where).toEqual({
      enabled: true,
      projectId: { in: ["p-1", "p-2"] },
    });
  });

  it("are both, for someone who may set up both", async () => {
    as(true, ["p-1"]);
    mockWorkspaceRows.mockResolvedValue([{ pluginId: "notes", config: {} }]);
    mockProjectRows.mockResolvedValue([
      { pluginId: "roadmap", projectId: "p-1", config: {}, project: webApp },
    ]);
    const area = await getPluginSettingsArea("ws-7", "de");
    expect(area?.plugins.map((p) => p.id)).toEqual(["notes"]);
    expect(area?.projectPlugins.map((p) => p.id)).toEqual(["roadmap"]);
  });

  it("keep each project's values apart", async () => {
    as(false, ["p-1", "p-2"]);
    mockProjectRows.mockResolvedValue([
      {
        pluginId: "roadmap",
        projectId: "p-1",
        config: { title: "Web" },
        project: webApp,
      },
      {
        pluginId: "roadmap",
        projectId: "p-2",
        config: { title: "Mobile!" },
        project: mobile,
      },
    ]);
    const area = await getPluginSettingsArea("ws-7", "de");
    const values = Object.fromEntries(
      (area?.projectPlugins[0].projects ?? []).map((p) => [
        p.slug,
        p.settings?.values.title,
      ]),
    );
    expect(values).toEqual({ "web-app": "Web", mobile: "Mobile!" });
  });

  it("list a project's plugins in that project only", async () => {
    as(false, ["p-1", "p-2"]);
    mockLoadOverview.mockResolvedValue(
      overview([
        installed({ id: "roadmap", name: "Roadmap", scope: "PROJECT" }),
        installed({ id: "gantt", name: "Gantt", scope: "PROJECT" }),
      ]),
    );
    mockProjectRows.mockResolvedValue([
      { pluginId: "roadmap", projectId: "p-1", config: {}, project: webApp },
      { pluginId: "gantt", projectId: "p-2", config: {}, project: mobile },
    ]);
    const area = await getPluginSettingsArea("ws-7", "de");
    const where = Object.fromEntries(
      (area?.projectPlugins ?? []).map((p) => [
        p.id,
        p.projects.map((project) => project.slug),
      ]),
    );
    expect(where).toEqual({ roadmap: ["web-app"], gantt: ["mobile"] });
  });

  it("list every plugin a project has on, not only the last", async () => {
    as(false, ["p-1"]);
    mockLoadOverview.mockResolvedValue(
      overview([
        installed({ id: "roadmap", name: "Roadmap", scope: "PROJECT" }),
        installed({ id: "gantt", name: "Gantt", scope: "PROJECT" }),
      ]),
    );
    mockProjectRows.mockResolvedValue([
      { pluginId: "roadmap", projectId: "p-1", config: {}, project: webApp },
      { pluginId: "gantt", projectId: "p-1", config: {}, project: webApp },
    ]);
    const area = await getPluginSettingsArea("ws-7", "de");
    expect(area?.projectPlugins.map((p) => p.id)).toEqual(["gantt", "roadmap"]);
  });

  it("give a project with what it is: its slug, name, color and image", async () => {
    as(false, ["p-1"]);
    mockAvatar.mockResolvedValue("https://img/web.png");
    mockProjectRows.mockResolvedValue([
      { pluginId: "roadmap", projectId: "p-1", config: {}, project: webApp },
    ]);
    const area = await getPluginSettingsArea("ws-7", "de");
    const project = area?.projectPlugins[0].projects[0];
    expect(project).toMatchObject({
      id: "p-1",
      slug: "web-app",
      name: "Web App",
      color: "#3b82f6",
      avatarUrl: "https://img/web.png",
    });
    expect(mockAvatar.mock.calls[0][0]).toBe("avatars/web.png");
  });

  it("give no image for a project that has none", async () => {
    as(false, ["p-2"]);
    mockProjectRows.mockResolvedValue([
      { pluginId: "roadmap", projectId: "p-2", config: {}, project: mobile },
    ]);
    const area = await getPluginSettingsArea("ws-7", "de");
    expect(area?.projectPlugins[0].projects[0].avatarUrl).toBeNull();
  });

  it("list a plugin that is on in no project a person may set up in nowhere", async () => {
    as(false, ["p-1"]);
    mockProjectRows.mockResolvedValue([]);
    const area = await getPluginSettingsArea("ws-7", "de");
    expect(area?.projectPlugins).toEqual([]);
  });

  it("pass on nothing that is the platform's: the directory's path and the hashes are not in it", async () => {
    mockWorkspaceRows.mockResolvedValue([{ pluginId: "notes", config: {} }]);
    const json = JSON.stringify(await getPluginSettingsArea("ws-7", "de"));
    expect(json).not.toContain("/plugins");
    expect(json).not.toContain("sha512");
  });

  it("do not take another failure for a missing permission", async () => {
    mockLoadOverview.mockRejectedValue(new Error("database is down"));
    await expect(getPluginSettingsArea("ws-7", "de")).rejects.toThrow(
      "database is down",
    );
  });
});

describe("who is offered the plugins' settings", () => {
  it("is whoever may set plugins up in the workspace, and nothing more is asked", async () => {
    const asked: string[] = [];
    const has = (permission: "plugin.enable") => {
      asked.push(permission);
      return true;
    };
    expect(await canOpenPluginSettings("ws-7", { has })).toBe(true);
    expect(asked).toEqual(["plugin.enable"]);
    expect(mockProjectIdsWith).not.toHaveBeenCalled();
  });

  it("is whoever may in a project of the workspace, when not in the workspace itself", async () => {
    mockProjectIdsWith.mockResolvedValue(new Set(["p-1"]));
    expect(await canOpenPluginSettings("ws-7", { has: () => false })).toBe(
      true,
    );
    expect(mockProjectIdsWith.mock.calls).toEqual([
      ["u1", "ws-7", "plugin.enable"],
    ]);
  });

  it("is nobody who may in no project and in no workspace", async () => {
    mockProjectIdsWith.mockResolvedValue(new Set());
    expect(await canOpenPluginSettings("ws-7", { has: () => false })).toBe(
      false,
    );
  });

  it("is nobody without a session", async () => {
    mockUserId.mockResolvedValue(null);
    expect(await canOpenPluginSettings("ws-7", { has: () => false })).toBe(
      false,
    );
    expect(mockProjectIdsWith).not.toHaveBeenCalled();
  });
});
