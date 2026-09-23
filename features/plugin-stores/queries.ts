import "server-only";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";

export interface PluginStoreRow {
  id: string;
  name: string;
  url: string;
  official: boolean;
  enabled: boolean;
  /** Whether a token is stored. The token itself never leaves the server. */
  hasCredential: boolean;
  /** The user name that goes with the token. Not a secret. */
  credentialUser: string | null;
}

/** The connected stores for the settings page, the official one first. Needs `plugin.manage`. */
export async function getPluginStores(): Promise<PluginStoreRow[]> {
  await requirePermission("plugin.manage", PLATFORM);
  const stores = await db.pluginStore.findMany({
    orderBy: [{ official: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      url: true,
      official: true,
      enabled: true,
      credential: true,
      credentialUser: true,
    },
  });
  // Rows go to a client component. Each field is named here, so the sealed token
  // stays behind and only the fact that there is one is passed on.
  return stores.map((store) => ({
    id: store.id,
    name: store.name,
    url: store.url,
    official: store.official,
    enabled: store.enabled,
    hasCredential: typeof store.credential === "string",
    credentialUser: store.credentialUser,
  }));
}
