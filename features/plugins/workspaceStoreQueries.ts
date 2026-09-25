import "server-only";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { pluginsDirSetting } from "@/lib/plugins/discovery";
import { getStoreVisibility } from "@/lib/plugins/storeVisibility";
import { selectForLevel } from "./levelStore";
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

/**
 * The store for a workspace, or `null` where the platform has not given it one (the setting is
 * off, or plugins are off). Needs `plugin.enable` in this workspace, asked here and not only by the
 * layout. **A selection, not the platform's page** (`selectForLevel`): only the plugins that apply
 * per workspace, and where the platform asked for it only the ones it released.
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
  const { view, switchOn } = selectForLevel(
    loaded,
    visibility,
    new Set(enabled.map((row) => row.pluginId)),
    "WORKSPACE",
  );

  return {
    view,
    workspace: { id: workspaceId, switchOn },
  };
}
