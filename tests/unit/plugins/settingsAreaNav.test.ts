import { describe, expect, it } from "bun:test";
import type { SettingsArea } from "@/features/plugins/settingsArea";
import { settingsNavItems } from "@/features/plugins/settingsAreaNav";
import type { SettingsForm } from "@/lib/plugins/settings";

// The rows of the plugins' settings navigation. What matters: the overview first, then the
// workspace's plugins that have settings, then the ones set per project, each as the row it should
// be: the icon, the address, and where the row counts as open (a plugin set per project also on the
// pages beneath it, one for each project). A plugin without settings has no row.

const form: SettingsForm = { fields: [], values: {} };
const entry = (
  id: string,
  name: string,
  settings: SettingsForm | null = form,
) => ({
  id,
  name,
  description: "",
  version: "1.0.0",
  settings,
});
const web = {
  id: "p-1",
  slug: "web-app",
  name: "Web App",
  color: "#000",
  avatarUrl: null,
};
const area: SettingsArea = {
  ownWorkspace: true,
  plugins: [entry("notes", "Notes"), entry("quiet", "Quiet", null)],
  projectPlugins: [
    { ...entry("roadmap", "Roadmap"), projects: [{ ...web, settings: form }] },
    {
      ...entry("mute", "Mute", null),
      projects: [{ ...web, settings: null }],
    },
  ],
};
const items = (a: SettingsArea = area) =>
  settingsNavItems(a, "nimbus", "Overview");

describe("the rows of the plugins' settings navigation", () => {
  it("start with the overview, at the area's address, with the label it was given", () => {
    expect(items()[0]).toEqual({
      href: "/nimbus/plugin/settings",
      label: "Overview",
      icon: "lucide:layout-list",
    });
  });

  it("have a row for each plugin that has settings, and none for one that declares nothing", () => {
    expect(items().map((row) => row.label)).toEqual([
      "Overview",
      "Notes",
      "Roadmap",
    ]);
  });

  it("give a workspace plugin the puzzle piece and its own page, open on that page alone", () => {
    expect(items()[1]).toEqual({
      href: "/nimbus/plugin/settings/notes",
      label: "Notes",
      icon: "lucide:puzzle",
    });
    expect(items()[1]).not.toHaveProperty("activeHref");
  });

  it("give a plugin set per project the projects' icon, and let it be open beneath its page too", () => {
    expect(items()[2]).toEqual({
      href: "/nimbus/plugin/settings/roadmap",
      label: "Roadmap",
      icon: "lucide:folders",
      activeHref: "/nimbus/plugin/settings/roadmap/*",
    });
  });

  it("carry this workspace's address", () => {
    const rows = settingsNavItems(area, "other", "Overview");
    expect(rows.map((row) => row.href)).toEqual([
      "/other/plugin/settings",
      "/other/plugin/settings/notes",
      "/other/plugin/settings/roadmap",
    ]);
    expect(rows[2].activeHref).toBe("/other/plugin/settings/roadmap/*");
  });

  it("are the overview alone where no plugin has settings", () => {
    const rows = items({ ownWorkspace: true, plugins: [], projectPlugins: [] });
    expect(rows.map((row) => row.label)).toEqual(["Overview"]);
  });
});
