"use server";

import { requirePermission } from "@/lib/permissions";
import { pluginVersionSchema } from "@/lib/plugins/manifest";
import { STORE_PLUGIN_ID } from "@/lib/plugins/store/format";
import { addStorePluginForLevel } from "./storeLevelAdd";
import type { PluginActionResult } from "./types";

// A project adding a plugin from the store: what the platform admin allowed by default (the store
// shown in projects, open unless the admin closed it). It is the platform's install
// (`storeInstall.ts`: the same checks, the same release, the same record) done for a project
// admin and followed by the switch in that project (`storeLevelAdd.ts`). What it does **not**
// change: the code of a plugin is approved by the platform for its exact files before it runs, so a
// plugin with code that a project adds is installed and waits, and the switch says so instead of
// pretending. A plugin that applies to the whole platform, or per workspace, is not a project's to
// bring in.

/**
 * Adds the plugin `pluginId` in `version` from the store `storeId` for the project, and
 * switches it on there when it can run. Needs `plugin.enable` in that project.
 */
export async function addStorePluginToProject(
  projectId: string,
  storeId: string,
  pluginId: string,
  version: string,
  input?: { acknowledged?: boolean },
): Promise<PluginActionResult> {
  if (
    typeof projectId !== "string" ||
    projectId.length === 0 ||
    projectId.length > 100
  ) {
    return { error: "Invalid request." };
  }
  const actorId = await requirePermission("plugin.enable", { projectId });
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
  return addStorePluginForLevel({
    level: "project",
    id: projectId,
    actorId,
    storeId,
    pluginId,
    version,
  });
}
