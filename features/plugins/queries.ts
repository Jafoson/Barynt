import "server-only";
import { getUnsignedPluginsAllowed } from "@/features/plugin-stores/queries";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { getPluginRegistry } from "@/lib/plugins/host";
import { getActiveStoreUrls } from "@/lib/plugins/stores";
import { readPluginDirectory } from "./disk";
import { buildOverview, type PluginsOverview } from "./overview";
import { loadStoreCatalog } from "./storeQueries";

/**
 * Everything the plugins page shows: what is installed, what lies in the plugin
 * directory, and what the registry says became of each plugin. Needs
 * `plugin.manage`, asked here and not only by the layout.
 */
export async function getPluginsOverview(
  locale: string,
): Promise<PluginsOverview> {
  await requirePermission("plugin.manage", PLATFORM);
  // The setting is read so that a database error is an error, not "off": an admin who is
  // shown "off" while it is on would be misled.
  return loadOverview(locale, getUnsignedPluginsAllowed, () =>
    storeUpdatesOf(locale),
  );
}

/**
 * Which installed plugins have a newer version in the store they came from, as plugin id →
 * version. Only what fits this Barynt: one that cannot be installed is not pointed at.
 */
async function storeUpdatesOf(locale: string): Promise<Map<string, string>> {
  const { catalog } = await loadStoreCatalog(locale);
  const updates = new Map<string, string>();
  for (const entry of catalog.entries) {
    if (entry.installed?.update && entry.compatible) {
      updates.set(entry.id, entry.installed.update);
    }
  }
  return updates;
}

/**
 * The same, without asking who wants it: for a caller that has asked for its own
 * permission and shows only part of it (`workspaceQueries.ts`). It is never handed
 * to a page as it is: it has the plugin directory's path and the hashes in it.
 * `allowUnsigned` says whether plugins from no store are allowed, read the way the
 * caller needs it.
 */
export async function loadOverview(
  locale: string,
  allowUnsigned: () => Promise<boolean>,
  storeUpdates?: () => Promise<ReadonlyMap<string, string>>,
): Promise<PluginsOverview> {
  const [
    rows,
    counts,
    projectCounts,
    snapshot,
    directory,
    activeStores,
    unsignedAllowed,
    updates,
  ] = await Promise.all([
    db.plugin.findMany({
      select: {
        id: true,
        version: true,
        status: true,
        source: true,
        scope: true,
        origin: true,
        integrity: true,
        codeApprovalHash: true,
        previousVersion: true,
        previousIntegrity: true,
      },
    }),
    db.pluginWorkspace.groupBy({
      by: ["pluginId"],
      where: { enabled: true },
      _count: { _all: true },
    }),
    db.pluginProject.groupBy({
      by: ["pluginId"],
      where: { enabled: true },
      _count: { _all: true },
    }),
    getPluginRegistry().get(),
    readPluginDirectory(),
    getActiveStoreUrls(),
    allowUnsigned(),
    storeUpdates?.(),
  ]);
  return buildOverview({
    rows,
    // A directory that cannot be read has nothing to offer; the snapshot says why.
    discovered: directory.ok ? directory.plugins : [],
    snapshot,
    workspaceCounts: new Map(counts.map((c) => [c.pluginId, c._count._all])),
    projectCounts: new Map(
      projectCounts.map((c) => [c.pluginId, c._count._all]),
    ),
    activeStores,
    allowUnsigned: unsignedAllowed,
    storeUpdates: updates,
    locale,
  });
}
