import type {
  InstalledPlugin,
  PluginsOverview,
  RuntimeState,
} from "./overview";

// What a workspace's plugins page shows, put together from the platform's overview and the
// workspace's own switches. Pure: plain values in and out. It is a *selection* of the overview:
// the plugin directory's path, the hashes, where a plugin came from and how many workspaces
// use it are the platform's, and are not in the result.

/** What keeps a plugin from being switched on here, or from running. `null`: nothing. */
export type Blocker =
  | "platform-off"
  | "needs-approval"
  | "approval-outdated"
  | "cannot-run";

export interface WorkspacePlugin {
  id: string;
  version: string;
  name: string;
  description: string;
  author: string;
  categories: string[];
  /** What it asks to be allowed. A promise, not a fence (docs/plugins/security.md). */
  capabilities: string[];
  hasCode: boolean;
  /** The plugin comes from a store: somebody reviewed it, and the platform approved its code where it has some. */
  fromStore: boolean;
  /** Switched on in this workspace. */
  on: boolean;
  /** What keeps it from being switched on, or, when it is on, from running. */
  blocker: Blocker | null;
  /** What became of it in the registry, for a plugin that is on here and does not run. */
  state: RuntimeState;
}

/** A plugin that applies to the whole platform: shown, and not the workspace's to switch. */
export interface PlatformPlugin {
  id: string;
  version: string;
  name: string;
  description: string;
}

export interface WorkspacePluginsView {
  /** The platform has given workspaces the plugin store, so the page has a Store tab. */
  storeAvailable: boolean;
  /**
   * Whether the platform reads plugins at all. Why not (a path, an environment variable) is the
   * platform's and is not passed on.
   */
  available: boolean;
  plugins: WorkspacePlugin[];
  platform: PlatformPlugin[];
}

/** Why it cannot be switched on or does not run, from what the platform's overview says of it. */
export function blockerOf(
  plugin: Pick<
    InstalledPlugin,
    "platformOn" | "hasCode" | "state" | "approval"
  >,
): Blocker | null {
  if (!plugin.platformOn) return "platform-off";
  if (plugin.hasCode) {
    if (plugin.approval.kind === "open") return "needs-approval";
    if (plugin.approval.kind === "outdated") return "approval-outdated";
    if (plugin.approval.kind === "refused") return "cannot-run";
  }
  switch (plugin.state.kind) {
    case "running":
    case "idle":
    case "off":
      return null;
    // A plugin that is `blocked` for its approval was said above; anything else is not a
    // question of approval, and no switch will make it run.
    case "blocked":
      return plugin.state.reason === "not-approved"
        ? "needs-approval"
        : plugin.state.reason === "approval-outdated"
          ? "approval-outdated"
          : "cannot-run";
    default:
      return "cannot-run";
  }
}

/**
 * The plugins a workspace can use, and which of them it has switched on. `enabledHere` is the
 * ids of the plugins switched on in this workspace.
 */
export function buildWorkspacePlugins(
  overview: PluginsOverview,
  enabledHere: ReadonlySet<string>,
  storeAvailable: boolean,
): WorkspacePluginsView {
  const plugins: WorkspacePlugin[] = [];
  const platform: PlatformPlugin[] = [];
  for (const plugin of overview.installed) {
    if (plugin.scope === "PLATFORM") {
      if (plugin.platformOn) {
        platform.push({
          id: plugin.id,
          version: plugin.version,
          name: plugin.name,
          description: plugin.description,
        });
      }
      continue;
    }
    // What applies per project is a project's to switch on (its own settings), not the workspace's.
    if (plugin.scope !== "WORKSPACE") continue;
    const on = enabledHere.has(plugin.id);
    // A plugin the platform switched off is only shown where it is on here, to say why it is not
    // running; one that is off everywhere is nobody's business.
    if (!plugin.platformOn && !on) continue;
    plugins.push({
      id: plugin.id,
      version: plugin.version,
      name: plugin.name,
      description: plugin.description,
      author: plugin.author,
      categories: [...plugin.categories],
      capabilities: [...plugin.capabilities],
      hasCode: plugin.hasCode,
      fromStore: !plugin.unsigned,
      on,
      blocker: blockerOf(plugin),
      state: plugin.state,
    });
  }
  return {
    storeAvailable: storeAvailable && overview.dir !== null,
    available: overview.dir !== null,
    plugins,
    platform,
  };
}
