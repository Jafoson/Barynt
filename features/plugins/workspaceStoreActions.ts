"use server";

import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { pluginVersionSchema } from "@/lib/plugins/manifest";
import { STORE_PLUGIN_ID } from "@/lib/plugins/store/format";
import { getStoreVisibility } from "@/lib/plugins/storeVisibility";
import { installFromStore } from "./storeInstall";
import type { PluginActionResult } from "./types";
import { enablePlugin } from "./workspaceActions";

// A workspace adding a plugin from the store: what the platform admin allowed by default (the
// store shown in workspaces, open unless the admin closed it). It is the platform's install
// (`storeInstall.ts`: the same checks, the same release, the same record) done for a workspace
// admin and followed by the switch in that workspace. What it does **not** change: the code of
// a plugin is approved by the platform for its exact files before it runs, so a plugin with code
// that a workspace adds is installed and waits, and the switch says so instead of pretending.
// A plugin that applies to the whole platform is not a workspace's to bring in.

/**
 * Adds the plugin `pluginId` in `version` from the store `storeId` for the workspace, and
 * switches it on there when it can run. Needs `plugin.enable` in that workspace.
 */
export async function addStorePluginToWorkspace(
  workspaceId: string,
  storeId: string,
  pluginId: string,
  version: string,
  input?: { acknowledged?: boolean },
): Promise<PluginActionResult> {
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    workspaceId.length > 100
  ) {
    return { error: "Invalid request." };
  }
  const actorId = await requirePermission("plugin.enable", { workspaceId });
  if (
    typeof storeId !== "string" ||
    storeId.length === 0 ||
    storeId.length > 100 ||
    typeof pluginId !== "string" ||
    !STORE_PLUGIN_ID.test(pluginId) ||
    !pluginVersionSchema.safeParse(version).success
  ) {
    return { error: "Invalid request." };
  }
  if (input?.acknowledged !== true) {
    return {
      error:
        "Confirm that you have read what the plugin asks for before it is added.",
    };
  }

  // What the platform decided, fail closed: a setting that cannot be read is "not shown".
  const visibility = await getStoreVisibility();
  if (!visibility.inWorkspaces) {
    return { error: "The plugin store is not available in workspaces." };
  }
  if (visibility.curatedOnly) {
    const released = await db.pluginStoreCurated.findUnique({
      where: { storeId_pluginId: { storeId, pluginId } },
      select: { pluginId: true },
    });
    if (!released) {
      return {
        error: "The platform has not released this plugin for workspaces.",
      };
    }
  }

  const installed = await installFromStore({
    actorId,
    storeId,
    pluginId,
    version,
    only: "WORKSPACE",
    workspaceId,
  });
  if ("error" in installed) return installed;

  // Installed. Switching it on has to end with it running here, which a plugin with code
  // cannot until the platform approves it: that is not a failure of the add.
  const enabled = await enablePlugin(workspaceId, pluginId);
  if ("error" in enabled) {
    return {
      ok: true,
      warning: `${pluginId} was added, but it is not switched on in this workspace yet: ${enabled.error}`,
    };
  }
  return enabled;
}
