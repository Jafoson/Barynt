import "server-only";
import { db } from "@/lib/db";

// Where the plugin store is shown, and to whom, as the platform admin set it
// (`SystemSettings`, BARY-106). The store is always there for the platform admin;
// these say whether workspaces and projects get it too, and whether they see all of
// what the stores that are on offer or only what the admin released for them
// (`PluginStoreCurated`).
//
// Open by default, so the admin has to decide nothing for a workspace admin to be
// able to add a plugin. What that does not change: the code of a plugin still has to
// be approved by the platform, for its exact files, before it runs.

export interface StoreVisibility {
  /** Workspaces have the store. */
  inWorkspaces: boolean;
  /** Projects have the store. */
  inProjects: boolean;
  /** Where the store is shown, only the plugins the admin released. */
  curatedOnly: boolean;
}

/** What applies before the admin has set anything: open. */
export const DEFAULT_STORE_VISIBILITY: StoreVisibility = {
  inWorkspaces: true,
  inProjects: true,
  curatedOnly: false,
};

/** What applies when the setting cannot be read: nothing shown, and if shown, only what is released. */
const CLOSED: StoreVisibility = {
  inWorkspaces: false,
  inProjects: false,
  curatedOnly: true,
};

/**
 * The visibility the store is judged by, from the database. A missing row is the
 * default (open); a database that cannot be read means closed, and the reason is
 * logged. Nothing here falls back to "open" after an error: a store shown to
 * workspaces because a query failed would be the setting ignored.
 */
export async function getStoreVisibility(): Promise<StoreVisibility> {
  try {
    const row = await db.systemSettings.findUnique({
      where: { id: 1 },
      select: {
        pluginStoreInWorkspaces: true,
        pluginStoreInProjects: true,
        pluginStoreCuratedOnly: true,
      },
    });
    if (!row) return { ...DEFAULT_STORE_VISIBILITY };
    return {
      inWorkspaces: row.pluginStoreInWorkspaces === true,
      inProjects: row.pluginStoreInProjects === true,
      curatedOnly: row.pluginStoreCuratedOnly === true,
    };
  } catch (error) {
    console.error(
      "[plugins] The store visibility could not be read, so the store is not shown to workspaces and projects:",
      error instanceof Error ? error.message : String(error),
    );
    return { ...CLOSED };
  }
}
