import "server-only";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
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
 */
export async function getProjectPlugins(
  projectId: string,
  locale: string,
): Promise<WorkspacePluginsView> {
  await requirePermission("plugin.enable", { projectId });
  const [overview, enabled] = await Promise.all([
    // Whether plugins from no store are allowed decides nothing here, as in a workspace: code from
    // no store does not run whatever it says, and a plugin without code needs no approval.
    loadOverview(locale, async () => false),
    db.pluginProject.findMany({
      where: { projectId, enabled: true },
      select: { pluginId: true },
    }),
  ]);
  // The store in a project is a later step, so the page has no Store tab yet.
  return buildProjectPlugins(
    overview,
    new Set(enabled.map((e) => e.pluginId)),
    false,
  );
}
