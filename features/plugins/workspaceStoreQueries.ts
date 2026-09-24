import "server-only";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { pluginsDirSetting } from "@/lib/plugins/discovery";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import { getStoreVisibility } from "@/lib/plugins/storeVisibility";
import { loadStoreCatalog, type StoreCatalogView } from "./storeQueries";

/**
 * What the store page shows a workspace admin: the plugins of the stores that are on that
 * apply per workspace, and what this workspace can do with each.
 */
export interface WorkspaceStoreView {
  view: StoreCatalogView;
  workspace: {
    id: string;
    /** Installed on the platform and off in this workspace: what a click switches on. */
    switchOn: string[];
  };
}

/** What a workspace admin is told of a store that cannot be read or fetched: that, and no more. */
export const STORE_UNAVAILABLE = "unavailable";
export const STORE_NOT_UPDATED = "failed";

/**
 * The store for a workspace, or `null` where the platform has not given it one (the setting is
 * off, or plugins are off). Needs `plugin.enable` in this workspace, asked here and not only by the
 * layout. **A selection, not the platform's page**: only the plugins that apply per workspace, and
 * where the platform asked for it only the ones it released; a plugin that is on the platform and
 * not in this workspace is offered as one to switch on, and one that is on here as installed;
 * nothing of a store's state is passed on but that it could not be read or updated (not the reason,
 * which can hold a path or an address), and never an update, which is the platform's.
 */
export async function getWorkspaceStore(
  workspaceId: string,
  locale: string,
): Promise<WorkspaceStoreView | null> {
  await requirePermission("plugin.enable", { workspaceId });
  const visibility = await getStoreVisibility();
  if (!visibility.inWorkspaces) return null;
  if (pluginsDirSetting().dir === null) return null;

  const [loaded, enabled] = await Promise.all([
    loadStoreCatalog(locale),
    db.pluginWorkspace.findMany({
      where: { workspaceId, enabled: true },
      select: { pluginId: true },
    }),
  ]);
  const onHere = new Set(enabled.map((row) => row.pluginId));
  const released = new Set(loaded.released);

  const entries: CatalogEntry[] = [];
  const switchOn: string[] = [];
  for (const entry of loaded.catalog.entries) {
    if (entry.scope !== "WORKSPACE") continue;
    if (visibility.curatedOnly && !released.has(entry.key)) continue;
    const here = onHere.has(entry.id);
    if (entry.installed !== null && !here) switchOn.push(entry.id);
    entries.push({
      ...entry,
      installed:
        here && entry.installed ? { ...entry.installed, update: null } : null,
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
    workspace: { id: workspaceId, switchOn },
  };
}
