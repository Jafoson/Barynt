import { describe, expect, it } from "bun:test";
import {
  pluginSettingsPath,
  type SettingsScopeKey,
  settingsScopeItems,
  visibleSettingsScope,
} from "@/lib/nav";

// Where the plugins' settings are, and how they get into the switcher of the settings areas
// (Personal, Project, Workspace, and now Plugins). What matters: the addresses, that the area is
// the last choice, and that it is offered to whoever may switch plugins on and to nobody else.

const labels: Record<SettingsScopeKey, string> = {
  account: "Personal",
  project: "Project",
  workspace: "Workspace",
  plugin: "Plugins",
};
const items = (projectSlug?: string) =>
  settingsScopeItems({ workspaceId: "nimbus", projectSlug, labels });

describe("the address of the plugins' settings", () => {
  it("is /<workspace>/plugin/settings for the overview", () => {
    expect(pluginSettingsPath("nimbus")).toBe("/nimbus/plugin/settings");
    expect(pluginSettingsPath("nimbus", undefined)).toBe(
      "/nimbus/plugin/settings",
    );
    expect(pluginSettingsPath("nimbus", "")).toBe("/nimbus/plugin/settings");
  });

  it("adds the plugin's id for one plugin's page", () => {
    expect(pluginSettingsPath("nimbus", "github-sync")).toBe(
      "/nimbus/plugin/settings/github-sync",
    );
    expect(pluginSettingsPath("other", "notes")).toBe(
      "/other/plugin/settings/notes",
    );
  });
});

describe("the plugins as a settings area", () => {
  it("is the last choice, after the workspace", () => {
    expect(items("web").map((item) => item.key)).toEqual([
      "account",
      "project",
      "workspace",
      "plugin",
    ]);
  });

  it("says its name, has the puzzle piece and leads to the overview", () => {
    expect(items().find((item) => item.key === "plugin")).toEqual({
      key: "plugin",
      label: "Plugins",
      icon: "lucide:puzzle",
      href: "/nimbus/plugin/settings",
    });
  });

  it("does not need a project: it is there without one", () => {
    expect(items().find((item) => item.key === "plugin")?.href).toBe(
      "/nimbus/plugin/settings",
    );
  });
});

describe("who is offered the plugins", () => {
  const keys = (allowed: {
    workspace: boolean;
    project: boolean;
    plugin: boolean;
  }) => visibleSettingsScope(items("web"), allowed).map((item) => item.key);

  it("is whoever may switch plugins on", () => {
    expect(keys({ workspace: true, project: true, plugin: true })).toEqual([
      "account",
      "project",
      "workspace",
      "plugin",
    ]);
  });

  it("is nobody else, whatever else they may do", () => {
    expect(keys({ workspace: true, project: true, plugin: false })).toEqual([
      "account",
      "project",
      "workspace",
    ]);
  });

  it("is offered to someone who may do nothing else", () => {
    expect(keys({ workspace: false, project: false, plugin: true })).toEqual([
      "account",
      "plugin",
    ]);
  });

  it("leaves Personal alone when nothing else is allowed", () => {
    expect(keys({ workspace: false, project: false, plugin: false })).toEqual([
      "account",
    ]);
  });

  it("does not let the other permissions stand in for it", () => {
    expect(
      visibleSettingsScope(items("web"), {
        workspace: true,
        project: false,
        plugin: false,
      }).some((item) => item.key === "plugin"),
    ).toBe(false);
  });
});
