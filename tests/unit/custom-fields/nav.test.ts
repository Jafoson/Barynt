import { describe, expect, it } from "bun:test";
import {
  navEntryAllowed,
  PROJECT_SETTINGS_NAV,
  PROJECT_SETTINGS_PERMISSIONS,
  WORKSPACE_SETTINGS_NAV,
  WORKSPACE_SETTINGS_PERMISSIONS,
} from "@/lib/nav";
import type { Permission } from "@/lib/rbac";

// Where the custom fields are offered: a section of the workspace's settings for whoever holds
// `customfield.manage` in the workspace (the page asks again, this is only what is shown), the
// Fields section every project already has, and the settings themselves for someone who holds
// nothing else.

const workspaceEntry = WORKSPACE_SETTINGS_NAV.find(
  (e) => e.section === "fields",
);
const holds =
  (...keys: Permission[]) =>
  (permission: Permission) =>
    keys.includes(permission);

describe("the Fields section of the workspace settings", () => {
  it("is there, and needs customfield.manage", () => {
    expect(workspaceEntry).toMatchObject({
      section: "fields",
      icon: "lucide:layout-list",
      labelKey: "fields",
      permission: "customfield.manage",
    });
  });

  it("is offered to whoever holds customfield.manage, and to nobody else", () => {
    expect(
      navEntryAllowed(holds("customfield.manage"), workspaceEntry ?? {}),
    ).toBe(true);
    expect(navEntryAllowed(holds(), workspaceEntry ?? {})).toBe(false);
    expect(
      navEntryAllowed(
        holds("role.manage", "label.create", "workspace.update"),
        workspaceEntry ?? {},
      ),
    ).toBe(false);
  });

  it("stands after the labels", () => {
    const sections = WORKSPACE_SETTINGS_NAV.map((e) => e.section);
    expect(sections.indexOf("fields")).toBeGreaterThan(
      sections.indexOf("labels"),
    );
  });

  it("is only there once", () => {
    expect(
      WORKSPACE_SETTINGS_NAV.filter((e) => e.section === "fields"),
    ).toHaveLength(1);
  });
});

describe("the settings of someone who holds nothing but customfield.manage", () => {
  it("are reachable in the workspace and in a project", () => {
    expect(
      WORKSPACE_SETTINGS_PERMISSIONS.some(holds("customfield.manage")),
    ).toBe(true);
    expect(PROJECT_SETTINGS_PERMISSIONS.some(holds("customfield.manage"))).toBe(
      true,
    );
  });
});

describe("the Fields section of a project's settings", () => {
  it("is open to whoever may see the project: the switches of the built-in fields are shown to all", () => {
    const entry = PROJECT_SETTINGS_NAV.find((e) => e.section === "fields");
    expect(entry).toBeDefined();
    expect(entry?.permission).toBeUndefined();
  });
});
