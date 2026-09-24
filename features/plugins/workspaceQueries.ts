import "server-only";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { loadOverview } from "./queries";
import {
  buildWorkspacePlugins,
  type WorkspacePluginsView,
} from "./workspacePlugins";

/**
 * What a workspace's plugins page shows: the platform's plugins that apply per workspace, which
 * of them this workspace has switched on, and what keeps the others from it. Needs
 * `plugin.enable` in this workspace, asked here and not only by the layout. Only what a workspace
 * admin needs is passed on: not the plugin directory's path, not a hash.
 */
export async function getWorkspacePlugins(
  workspaceId: string,
  locale: string,
): Promise<WorkspacePluginsView> {
  await requirePermission("plugin.enable", { workspaceId });
  const [overview, enabled] = await Promise.all([
    // Whether plugins from no store are allowed decides nothing here: code from no store does not
    // run whatever it says, and a plugin without code needs no approval. So it is not read.
    loadOverview(locale, async () => false),
    db.pluginWorkspace.findMany({
      where: { workspaceId, enabled: true },
      select: { pluginId: true },
    }),
  ]);
  return buildWorkspacePlugins(
    overview,
    new Set(enabled.map((e) => e.pluginId)),
  );
}
