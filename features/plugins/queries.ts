import "server-only";
import { getUnsignedPluginsAllowed } from "@/features/plugin-stores/queries";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { getPluginRegistry } from "@/lib/plugins/host";
import { getActiveStoreUrls } from "@/lib/plugins/stores";
import { readPluginDirectory } from "./disk";
import { buildOverview, type PluginsOverview } from "./overview";

/**
 * Everything the plugins page shows: what is installed, what lies in the plugin
 * directory, and what the registry says became of each plugin. Needs
 * `plugin.manage`, asked here and not only by the layout.
 */
export async function getPluginsOverview(
  locale: string,
): Promise<PluginsOverview> {
  await requirePermission("plugin.manage", PLATFORM);
  const [rows, counts, snapshot, directory, activeStores, allowUnsigned] =
    await Promise.all([
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
        },
      }),
      db.pluginWorkspace.groupBy({
        by: ["pluginId"],
        where: { enabled: true },
        _count: { _all: true },
      }),
      getPluginRegistry().get(),
      readPluginDirectory(),
      getActiveStoreUrls(),
      getUnsignedPluginsAllowed(),
    ]);
  return buildOverview({
    rows,
    // A directory that cannot be read has nothing to offer; the snapshot says why.
    discovered: directory.ok ? directory.plugins : [],
    snapshot,
    workspaceCounts: new Map(counts.map((c) => [c.pluginId, c._count._all])),
    activeStores,
    allowUnsigned,
    locale,
  });
}
