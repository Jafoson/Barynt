import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { syncConfig, syncDue } from "@/lib/plugins/store/syncPolicy";
import { syncStore } from "./storeSync";

// What opening the store page does about the clones of the stores that are on: fetch a store
// that was never fetched, and one whose state is old. `after` is from `next/server`, so this is
// kept apart from `storeSync.ts`, which the actions import.

/** Opening the page waits for a first fetch this long: without it there is nothing to show. */
const WHEN_OPENED_MS = 15_000;

/**
 * For the store page, before it reads the catalog. A store that was never fetched is fetched
 * now, and the page waits (at most 15 seconds) because there is nothing to show without it;
 * one whose state is old is fetched after the page has been sent, so the visit is not slowed
 * down and the next one shows it. Needs `plugin.manage`. Never throws.
 */
export async function refreshStoresForPage(): Promise<void> {
  await requirePermission("plugin.manage", PLATFORM);
  try {
    const config = syncConfig(process.env);
    if (!config.auto) return;
    const stores = await db.pluginStore.findMany({
      where: { enabled: true },
      select: { id: true, syncedAt: true, syncAttemptedAt: true },
    });
    const now = new Date();
    const due = stores.map((store) => ({
      id: store.id,
      due: syncDue(store, config, now),
    }));
    const first = due.filter((s) => s.due === "never");
    const later = due.filter((s) => s.due === "stale");

    await Promise.all(first.map((s) => syncStore(s.id, WHEN_OPENED_MS)));
    if (later.length > 0) {
      after(async () => {
        await Promise.all(later.map((s) => syncStore(s.id))).catch(() => {});
      });
    }
  } catch {
    // What the page shows does not depend on this having worked.
  }
}
