"use server";

import { PLATFORM, requirePermission } from "@/lib/permissions";
import { pluginVersionSchema } from "@/lib/plugins/manifest";
import { STORE_PLUGIN_ID } from "@/lib/plugins/store/format";
import type { PluginActionResult } from "./types";

// Installing a plugin from a store: download the archive the entry names, check its
// SHA-512 against the entry, unpack it safely, check the manifest against the entry's,
// and put it into the plugin directory in one step (BARY-107). The store page and its
// dialog are built; this is the action they call. Until the download and the unpacking
// exist it says so instead of pretending, and it does nothing.

/**
 * Installs the plugin `pluginId` in `version` from the store `storeId`. Needs
 * `plugin.manage`.
 */
export async function installStorePlugin(
  storeId: string,
  pluginId: string,
  version: string,
  input?: { acknowledged?: boolean },
): Promise<PluginActionResult> {
  await requirePermission("plugin.manage", PLATFORM);
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
        "Confirm that you have read what the plugin asks for before it is installed.",
    };
  }
  return {
    error:
      "Installing from a store is not available yet: downloading and unpacking a plugin come with the next step.",
  };
}
