import "server-only";
import { getPluginStoreVisibility } from "@/features/plugin-stores/queries";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { discoverPlugins, pluginsDirSetting } from "@/lib/plugins/discovery";
import { buildCatalog, type Catalog } from "@/lib/plugins/store/catalog";
import { storeCloneDir } from "@/lib/plugins/store/paths";
import { readStoreDirectory } from "@/lib/plugins/store/reader";
import type { StoreVisibility } from "@/lib/plugins/storeVisibility";
import { BARYNT_VERSION } from "@/lib/version";

export interface StoreCatalogView {
  catalog: Catalog;
  /** Where the store is shown and to whom, as the admin set it. */
  visibility: StoreVisibility;
  /** Plugins the admin released for workspaces and projects, as `<store id>/<plugin id>`. */
  released: string[];
  /** Why there is nothing to read from: plugins are off. `null` when all is well. */
  problem: string | null;
}

/**
 * What the store page for the platform admin shows: the catalog of the stores that are
 * on, read from their local clones, with what is installed, and which plugins the admin
 * released for workspaces and projects. Needs `plugin.manage`, asked here and not only by
 * the layout.
 */
export async function getStoreCatalogView(
  locale: string,
): Promise<StoreCatalogView> {
  await requirePermission("plugin.manage", PLATFORM);
  const [loaded, visibility] = await Promise.all([
    loadStoreCatalog(locale),
    getPluginStoreVisibility(),
  ]);
  return { ...loaded, visibility };
}

/**
 * The catalog and the releases, without asking who wants them: for a caller that has asked
 * for its own permission and shows only part of it (`workspaceStoreQueries.ts`). It is never
 * handed to a page as it is: it has the state of every store, with the reasons.
 */
export async function loadStoreCatalog(
  locale: string,
): Promise<Omit<StoreCatalogView, "visibility">> {
  const [stores, installed, released] = await Promise.all([
    db.pluginStore.findMany({
      where: { enabled: true },
      orderBy: [{ official: "desc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        official: true,
        syncedAt: true,
        syncError: true,
      },
    }),
    db.plugin.findMany({ select: { id: true, version: true, origin: true } }),
    db.pluginStoreCurated.findMany({
      select: { storeId: true, pluginId: true },
    }),
  ]);

  const setting = pluginsDirSetting();
  const dir = setting.dir;
  // What the installed files ask for, so that an update can say what it asks for in addition.
  const onDisk = dir ? (await discoverPlugins(dir)).plugins : [];
  const inputs = await Promise.all(
    stores.map(async (store) => ({
      id: store.id,
      key: store.key,
      name: store.name,
      official: store.official,
      snapshot: dir
        ? await readStoreDirectory(storeCloneDir(dir, store.key))
        : ({
            ok: false,
            error: "Plugins are off: there is no plugin directory.",
            code: "unreadable",
          } as const),
      syncedAt: store.syncedAt,
      syncError: store.syncError,
    })),
  );

  return {
    catalog: buildCatalog({
      stores: inputs,
      installed: installed.map((row) => {
        const found = onDisk.find(
          (p) => p.id === row.id && p.version === row.version,
        );
        return {
          ...row,
          capabilities: found?.ok ? found.manifest.capabilities : null,
        };
      }),
      hostVersion: BARYNT_VERSION,
      locale,
    }),
    released: released.map((r) => `${r.storeId}/${r.pluginId}`),
    problem: setting.dir === null ? (setting.problem ?? null) : null,
  };
}
