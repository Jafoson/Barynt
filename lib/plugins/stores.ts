import "server-only";
import { db } from "@/lib/db";

/**
 * The addresses of the plugin stores that are switched on: the list the policy
 * (`decideExecution(input, activeStores)`) is given.
 *
 * It fails closed. If the stores cannot be read, none is on, so no plugin code
 * runs in the process until they can be. Nothing here falls back to the official
 * store: an admin who switched it off must not find it on again because of a
 * database error.
 */
export async function getActiveStoreUrls(): Promise<string[]> {
  try {
    const stores = await db.pluginStore.findMany({
      where: { enabled: true },
      select: { url: true },
    });
    return stores.map((store) => store.url);
  } catch (error) {
    console.error(
      "[plugins] The plugin stores could not be read, so none is on:",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}
