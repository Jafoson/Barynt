import "server-only";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";

export interface PluginStoreRow {
  id: string;
  name: string;
  url: string;
  official: boolean;
  enabled: boolean;
}

/** The connected stores for the settings page, the official one first. Needs `plugin.manage`. */
export async function getPluginStores(): Promise<PluginStoreRow[]> {
  await requirePermission("plugin.manage", PLATFORM);
  const stores = await db.pluginStore.findMany({
    orderBy: [{ official: "desc" }, { name: "asc" }],
    select: { id: true, name: true, url: true, official: true, enabled: true },
  });
  return stores;
}
