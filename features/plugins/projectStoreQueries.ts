import "server-only";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { pluginsDirSetting } from "@/lib/plugins/discovery";
import { getStoreVisibility } from "@/lib/plugins/storeVisibility";
import { selectForLevel } from "./levelStore";
import { loadStoreCatalog, type StoreCatalogView } from "./storeQueries";

/**
 * What the store page shows a project admin: the plugins of the stores that are on that apply
 * per project, and what this project can do with each.
 */
export interface ProjectStoreView {
  view: StoreCatalogView;
  project: {
    id: string;
    /** Installed on the platform and off in this project: what a click switches on. */
    switchOn: string[];
  };
}

/**
 * The store for a project, or `null` where the platform has not given it one (*Show the store in
 * projects* is off, or plugins are off). Needs `plugin.enable` in this project, asked here and not
 * only by the layout. **A selection, not the platform's page** (`selectForLevel`): only the
 * plugins that apply per project, and where the platform asked for it only the ones it released.
 */
export async function getProjectStore(
  projectId: string,
  locale: string,
): Promise<ProjectStoreView | null> {
  await requirePermission("plugin.enable", { projectId });
  const visibility = await getStoreVisibility();
  if (!visibility.inProjects) return null;
  if (pluginsDirSetting().dir === null) return null;

  const [loaded, enabled] = await Promise.all([
    loadStoreCatalog(locale),
    db.pluginProject.findMany({
      where: { projectId, enabled: true },
      select: { pluginId: true },
    }),
  ]);
  const { view, switchOn } = selectForLevel(
    loaded,
    visibility,
    new Set(enabled.map((row) => row.pluginId)),
    "PROJECT",
  );
  return { view, project: { id: projectId, switchOn } };
}
