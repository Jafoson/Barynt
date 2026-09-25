import "server-only";
import { db } from "@/lib/db";
import { getStoreVisibility } from "@/lib/plugins/storeVisibility";
import { enablePluginInProject } from "./projectActions";
import { installFromStore } from "./storeInstall";
import type { PluginActionResult } from "./types";
import { enablePlugin } from "./workspaceActions";

// What a workspace admin or a project admin adding a plugin from the store has in common, after the
// action has asked for the permission of its level and checked the request: what the platform
// decided about the store at that level, the platform's install for it, and the switch there. The
// code of a plugin is approved by the platform for its exact files before it runs, so a plugin with
// code that a level adds is installed and waits, and the switch says so instead of pretending.

const LEVELS = {
  workspace: {
    noun: "workspace",
    plural: "workspaces",
    only: "WORKSPACE",
  },
  project: {
    noun: "project",
    plural: "projects",
    only: "PROJECT",
  },
} as const;

/**
 * Adds the plugin `pluginId` in `version` from the store `storeId` for the workspace or project
 * `id`, and switches it on there when it can run.
 */
export async function addStorePluginForLevel(input: {
  level: "workspace" | "project";
  /** The workspace's or the project's id. */
  id: string;
  actorId: string;
  storeId: string;
  pluginId: string;
  version: string;
}): Promise<PluginActionResult> {
  const { level, id, actorId, storeId, pluginId, version } = input;
  const words = LEVELS[level];

  // What the platform decided, fail closed: a setting that cannot be read is "not shown".
  const visibility = await getStoreVisibility();
  const shown =
    level === "workspace" ? visibility.inWorkspaces : visibility.inProjects;
  if (!shown) {
    return { error: `The plugin store is not available in ${words.plural}.` };
  }
  if (visibility.curatedOnly) {
    const released = await db.pluginStoreCurated.findUnique({
      where: { storeId_pluginId: { storeId, pluginId } },
      select: { pluginId: true },
    });
    if (!released) {
      return {
        error: `The platform has not released this plugin for ${words.plural}.`,
      };
    }
  }

  const installed = await installFromStore({
    actorId,
    storeId,
    pluginId,
    version,
    only: words.only,
    ...(level === "workspace" ? { workspaceId: id } : { projectId: id }),
  });
  if ("error" in installed) return installed;

  // Installed. Switching it on has to end with it running here, which a plugin with code
  // cannot until the platform approves it: that is not a failure of the add.
  const enabled =
    level === "workspace"
      ? await enablePlugin(id, pluginId)
      : await enablePluginInProject(id, pluginId);
  if ("error" in enabled) {
    return {
      ok: true,
      warning: `${pluginId} was added, but it is not switched on in this ${words.noun} yet: ${enabled.error}`,
    };
  }
  return enabled;
}
