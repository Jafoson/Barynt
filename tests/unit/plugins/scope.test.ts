import { describe, expect, it } from "bun:test";
import { PLUGIN_SCOPES } from "@/lib/plugins/manifest";
import {
  dependencyScopeFits,
  manifestScopeOf,
  type PluginRowScope,
  rowScopeOf,
} from "@/lib/plugins/scope";

// Where a plugin applies, in the manifest's spelling and the database's, and which plugin may
// lean on which. Pure logic: what the resolver, the pages and the actions all decide by.

describe("the database's scope for a manifest's", () => {
  it.each([
    ["workspace", "WORKSPACE"],
    ["platform", "PLATFORM"],
    ["project", "PROJECT"],
  ] as const)("is %s → %s", (manifest, row) => {
    expect(rowScopeOf(manifest)).toBe(row);
  });

  it("counts a manifest without a scope as a workspace plugin", () => {
    expect(rowScopeOf(undefined)).toBe("WORKSPACE");
  });
});

describe("the manifest's scope for the database's", () => {
  it.each([
    ["WORKSPACE", "workspace"],
    ["PLATFORM", "platform"],
    ["PROJECT", "project"],
  ] as const)("is %s → %s", (row, manifest) => {
    expect(manifestScopeOf(row)).toBe(manifest);
  });

  it("is the way back for every scope a manifest can name", () => {
    for (const scope of PLUGIN_SCOPES) {
      expect(manifestScopeOf(rowScopeOf(scope))).toBe(scope);
    }
    const rows: PluginRowScope[] = ["WORKSPACE", "PLATFORM", "PROJECT"];
    for (const row of rows) {
      expect(rowScopeOf(manifestScopeOf(row))).toBe(row);
    }
  });
});

describe("which plugin may lean on which", () => {
  it.each([
    // A plugin for the whole platform runs everywhere, so it needs one that does too.
    ["platform", "platform", true],
    ["platform", "workspace", false],
    ["platform", "project", false],
    // A workspace plugin: the same level, or the whole platform.
    ["workspace", "workspace", true],
    ["workspace", "platform", true],
    ["workspace", "project", false],
    // A project plugin: the same level, or the whole platform.
    ["project", "project", true],
    ["project", "platform", true],
    ["project", "workspace", false],
  ] as const)("a %s plugin on a %s plugin: %s", (scope, dependency, fits) => {
    expect(dependencyScopeFits(scope, dependency)).toBe(fits);
  });

  it("counts a plugin without a scope as a workspace plugin, on either side", () => {
    expect(dependencyScopeFits(undefined, "workspace")).toBe(true);
    expect(dependencyScopeFits(undefined, "platform")).toBe(true);
    expect(dependencyScopeFits(undefined, "project")).toBe(false);
    expect(dependencyScopeFits("workspace", undefined)).toBe(true);
    expect(dependencyScopeFits("platform", undefined)).toBe(false);
    expect(dependencyScopeFits("project", undefined)).toBe(false);
  });
});
