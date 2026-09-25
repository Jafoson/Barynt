import "server-only";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getStoreVisibility } from "@/lib/plugins/storeVisibility";
import { loadOverview } from "./queries";
import {
  buildProjectPlugins,
  type WorkspacePluginsView,
} from "./workspacePlugins";

/**
 * What a project's plugins page shows: the platform's plugins that apply per project, which of
 * them this project has switched on, and what keeps the others from it. Needs `plugin.enable` in
 * this project, asked here and not only by the layout. Only what a project admin needs is passed
 * on: not the plugin directory's path, not a hash, not how many other projects use a plugin.
 * The page has a Store tab where the platform gave projects the store.
 */
export async function getProjectPlugins(
  projectId: string,
  locale: string,
): Promise<WorkspacePluginsView> {
  await requirePermission("plugin.enable", { projectId });
  const [overview, enabled, visibility] = await Promise.all([
    // Whether plugins from no store are allowed decides nothing here, as in a workspace: code from
    // no store does not run whatever it says, and a plugin without code needs no approval.
    loadOverview(locale, async () => false),
    db.pluginProject.findMany({
      where: { projectId, enabled: true },
      select: { pluginId: true },
    }),
    // Whether the platform gave projects the store: fails closed, so a setting that cannot be
    // read is no Store tab.
    getStoreVisibility(),
  ]);
  return buildProjectPlugins(
    overview,
    new Set(enabled.map((e) => e.pluginId)),
    visibility.inProjects,
  );
}
