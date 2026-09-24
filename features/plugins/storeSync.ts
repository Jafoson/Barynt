import "server-only";
import { db } from "@/lib/db";
import { pluginsDirSetting } from "@/lib/plugins/discovery";
import { syncStoreClone } from "@/lib/plugins/store/sync";
import { openStoreToken } from "@/lib/plugins/storeCredentials";

// Updating the clone of one store and saying how it went on the store's row: what the
// button calls (`syncPluginStores`, in `storeActions.ts`) and what opening the store page
// calls (`storeRefresh.ts`). Nothing of a store is run; the clone is read as data
// (`lib/plugins/store/reader.ts`). This file stays free of `next/server`, so the actions
// that import it do not pull it in.

/** Someone pressed the button and is looking at it. */
export const WHEN_ASKED_MS = 30_000;
const MAX_ERROR_LENGTH = 300;

export type StoreSyncOutcome = { ok: true } | { error: string };

/**
 * Updates the clone of one store and records how it went on the store's row. `{ error }` is
 * for when it could not even be tried (no such store, it is switched off, no plugin directory);
 * a fetch that fails is recorded and is `{ ok: true }`: the page shows the state from before
 * and says why it could not be updated.
 */
export async function syncStore(
  storeId: string,
  timeoutMs = WHEN_ASKED_MS,
): Promise<StoreSyncOutcome> {
  const setting = pluginsDirSetting();
  if (setting.dir === null) {
    return {
      error:
        setting.problem ?? "Plugins are off: there is no plugin directory.",
    };
  }
  const store = await db.pluginStore.findUnique({
    where: { id: storeId },
    select: {
      key: true,
      url: true,
      enabled: true,
      credential: true,
      credentialUser: true,
    },
  });
  if (!store) return { error: "There is no such store." };
  if (!store.enabled) return { error: "The store is switched off." };

  const result = await syncStoreClone({
    pluginsDir: setting.dir,
    key: store.key,
    source: {
      url: store.url,
      // A token that does not open is no token: a private repository then fails to fetch
      // and says so, and a public one does not care.
      token: store.credential
        ? openStoreToken(store.key, store.credential)
        : null,
      user: store.credentialUser,
    },
    timeoutMs,
  });

  const now = new Date();
  // `updateMany`: the store may have been removed while it was being fetched.
  await db.pluginStore.updateMany({
    where: { id: storeId },
    data: result.ok
      ? { syncedAt: now, syncAttemptedAt: now, syncError: null }
      : {
          syncAttemptedAt: now,
          syncError: result.error.slice(0, MAX_ERROR_LENGTH),
        },
  });
  return { ok: true };
}
