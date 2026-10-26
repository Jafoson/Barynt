import { describe, expect, it } from "bun:test";
import { activationScopeKey } from "@/lib/plugins/activation";
import { isPermissionAllowedIn, PERMISSIONS, SYSTEM_ROLES } from "@/lib/rbac";

describe("activationScopeKey", () => {
  it("keys a workspace activation by the workspace", () => {
    expect(activationScopeKey({ workspaceId: "w1" })).toBe("ws:w1");
    expect(activationScopeKey({ workspaceId: "w1", projectId: null })).toBe(
      "ws:w1",
    );
  });

  it("keys a project activation by the project, not the workspace", () => {
    expect(activationScopeKey({ workspaceId: "w1", projectId: "p1" })).toBe(
      "pr:p1",
    );
  });
});

describe("plugin permissions", () => {
  it("plugin.manage exists on the platform only", () => {
    expect(PERMISSIONS["plugin.manage"].scopes).toEqual(["PLATFORM"]);
  });

  it("plugin.enable works in a workspace and in a project", () => {
    expect(isPermissionAllowedIn("plugin.enable", "WORKSPACE")).toBe(true);
    expect(isPermissionAllowedIn("plugin.enable", "PROJECT")).toBe(true);
    expect(isPermissionAllowedIn("plugin.enable", "PLATFORM")).toBe(false);
  });

  const holders = (key: "plugin.manage" | "plugin.enable") =>
    SYSTEM_ROLES.filter((r) => r.allow.includes(key)).map(
      (r) => `${r.scope}:${r.key}`,
    );

  it("only the platform admin may manage plugins", () => {
    expect(holders("plugin.manage")).toEqual(["PLATFORM:platform_admin"]);
  });

  it("workspace owner/admin and project admin may enable them, members may not", () => {
    const h = holders("plugin.enable");
    expect(h).toContain("WORKSPACE:owner");
    expect(h).toContain("PROJECT:project_admin");
    expect(h).not.toContain("WORKSPACE:member");
    expect(h).not.toContain("PROJECT:contributor");
  });
});
