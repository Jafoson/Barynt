"use server";

import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { pluginVersionSchema } from "@/lib/plugins/manifest";
import { STORE_PLUGIN_ID } from "@/lib/plugins/store/format";
import { installFromStore } from "./storeInstall";
import { syncStore } from "./storeSync";
import type { PluginActionResult } from "./types";

// Installing a plugin from a store: read the entry from the store's clone, download the release
// and check it against the hash the store pinned and the manifest it lists, put it in the plugin
// directory in one step, record it as a plugin from that store (`storeInstall.ts`). The store page
// and its dialog are the question; this is the protection: who may, what is asked for, and that
// the risk is confirmed are all checked here.

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
  const actorId = await requirePermission("plugin.manage", PLATFORM);
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
  return installFromStore({ actorId, storeId, pluginId, version });
}

/**
 * Updates the clone of one store, or of every store that is on, when `storeId` is left out.
 * Needs `plugin.manage`. However the fetch goes, the store's row says (`syncedAt`,
 * `syncError`) and the page shows it; an `error` here is for a request that could not be
 * tried at all.
 */
export async function syncPluginStores(
  storeId?: string,
): Promise<PluginActionResult> {
  await requirePermission("plugin.manage", PLATFORM);
  if (storeId !== undefined) {
    if (
      typeof storeId !== "string" ||
      storeId.length === 0 ||
      storeId.length > 100
    ) {
      return { error: "Invalid request." };
    }
    const outcome = await syncStore(storeId);
    return "error" in outcome ? outcome : { ok: true };
  }
  const stores = await db.pluginStore.findMany({
    where: { enabled: true },
    select: { id: true },
  });
  const outcomes = await Promise.all(stores.map((s) => syncStore(s.id)));
  const failed = outcomes.find((o) => "error" in o);
  return failed ?? { ok: true };
}
