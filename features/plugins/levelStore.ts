import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import type { StoreVisibility } from "@/lib/plugins/storeVisibility";
import type { StoreCatalogView } from "./storeQueries";

// What the store page shows a workspace admin or a project admin, made from the catalog of the
// stores that are on. Pure: plain values in and out. **A selection, not the platform's page**: only
// the plugins that apply at that level, and where the platform asked for it only the ones it
// released; a plugin that is on the platform and not at this level is offered as one to switch on,
// and one that is on here as installed; nothing of a store's state is passed on but that it could not
// be read or updated (not the reason, which can hold a path or an address), and never an update,
// which is the platform's.

/** What a workspace or project admin is told of a store that cannot be read or fetched: that, and no more. */
export const STORE_UNAVAILABLE = "unavailable";
export const STORE_NOT_UPDATED = "failed";

export function selectForLevel(
  loaded: Omit<StoreCatalogView, "visibility">,
  visibility: StoreVisibility,
  /** The ids of the plugins switched on at this level (this workspace, or this project). */
  onHere: ReadonlySet<string>,
  /** The scope of the plugins this level switches: a workspace's, or a project's. */
  scope: "WORKSPACE" | "PROJECT",
): { view: StoreCatalogView; switchOn: string[] } {
  const released = new Set(loaded.released);
  const entries: CatalogEntry[] = [];
  const switchOn: string[] = [];
  for (const entry of loaded.catalog.entries) {
    if (entry.scope !== scope) continue;
    if (visibility.curatedOnly && !released.has(entry.key)) continue;
    const here = onHere.has(entry.id);
    if (entry.installed !== null && !here) switchOn.push(entry.id);
    entries.push({
      ...entry,
      installed:
        here && entry.installed
          ? { ...entry.installed, update: null, addedCapabilities: [] }
          : null,
    });
  }
  return {
    view: {
      catalog: {
        entries,
        stores: loaded.catalog.stores.map((store) => ({
          id: store.id,
          name: store.name,
          official: store.official,
          error: store.error ? STORE_UNAVAILABLE : null,
          errorCode: store.errorCode,
          syncedAt: store.syncedAt,
          syncError: store.syncError ? STORE_NOT_UPDATED : null,
          problems: [],
        })),
      },
      visibility,
      released: [],
      problem: null,
    },
    switchOn,
  };
}
