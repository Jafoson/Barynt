import type { PluginScope } from "./manifest";

// Where a plugin applies, in the two spellings it has: the manifest's (`scope: "project"`,
// lowercase, what a plugin author writes) and the database's (`Plugin.scope`, an enum). One
// place turns one into the other, so a place that decides by scope never has to guess what
// "not platform" means: with three scopes it is not one thing.
//
// No imports but a type: the manifest schema, the resolver and the pages read it alike.

/** `Plugin.scope` in the database. */
export type PluginRowScope = "WORKSPACE" | "PLATFORM" | "PROJECT";

const ROW_OF: Record<PluginScope, PluginRowScope> = {
  workspace: "WORKSPACE",
  platform: "PLATFORM",
  project: "PROJECT",
};

const MANIFEST_OF: Record<PluginRowScope, PluginScope> = {
  WORKSPACE: "workspace",
  PLATFORM: "platform",
  PROJECT: "project",
};

/** The database's scope for a manifest's. A manifest that leaves it out is a workspace plugin. */
export function rowScopeOf(scope: PluginScope | undefined): PluginRowScope {
  return ROW_OF[scope ?? "workspace"];
}

/** The manifest's scope for the database's. */
export function manifestScopeOf(scope: PluginRowScope): PluginScope {
  return MANIFEST_OF[scope];
}

/**
 * Whether a plugin that applies as `scope` may depend on one that applies as `dependency`
 * (either may be left out: a workspace plugin). It may lean on one that is on wherever it is:
 * a plugin for the whole platform, or one that applies at the same level. A platform plugin
 * runs everywhere, so it needs one that is on everywhere; a workspace plugin and a project
 * plugin do not lean on each other, because one is on per workspace and the other per project,
 * and nothing says they are on in the same places.
 */
export function dependencyScopeFits(
  scope: PluginScope | undefined,
  dependency: PluginScope | undefined,
): boolean {
  const target = dependency ?? "workspace";
  return target === "platform" || target === (scope ?? "workspace");
}
