import { describe, expect, it } from "bun:test";
import {
  navEntryAllowed,
  PROJECT_SETTINGS_NAV,
  PROJECT_SETTINGS_PERMISSIONS,
  WORKSPACE_SETTINGS_NAV,
} from "@/lib/nav";
import type { Permission } from "@/lib/rbac";

// Where a project's plugins page is offered: a section of the project settings for whoever holds
// `plugin.enable` in the project, and nobody else (the page asks again, this is only what is shown).

const entry = PROJECT_SETTINGS_NAV.find((e) => e.section === "plugins");
const holds =
  (...keys: Permission[]) =>
  (permission: Permission) =>
    keys.includes(permission);

describe("the Plugins section of the project settings", () => {
  it("is there, and needs plugin.enable, as the workspace's does", () => {
    expect(entry).toMatchObject({
      section: "plugins",
      icon: "lucide:puzzle",
      labelKey: "plugins",
      permission: "plugin.enable",
    });
    expect(
      WORKSPACE_SETTINGS_NAV.find((e) => e.section === "plugins")?.permission,
    ).toBe("plugin.enable");
  });

  it("is offered to whoever holds plugin.enable in the project, and to nobody else", () => {
    expect(navEntryAllowed(holds("plugin.enable"), entry ?? {})).toBe(true);
    expect(navEntryAllowed(holds(), entry ?? {})).toBe(false);
    expect(
      navEntryAllowed(
        holds("role.manage", "label.create", "project.update"),
        entry ?? {},
      ),
    ).toBe(false);
  });

  it("makes the project settings reachable for someone who holds nothing but plugin.enable", () => {
    expect(PROJECT_SETTINGS_PERMISSIONS).toContain("plugin.enable");
    expect(PROJECT_SETTINGS_PERMISSIONS.some(holds("plugin.enable"))).toBe(
      true,
    );
  });

  it("stands before the activity, after the labels and the fields", () => {
    const sections = PROJECT_SETTINGS_NAV.map((e) => e.section);
    expect(sections.indexOf("plugins")).toBeGreaterThan(
      sections.indexOf("fields"),
    );
    expect(sections.indexOf("plugins")).toBeLessThan(
      sections.indexOf("activity"),
    );
  });
});
