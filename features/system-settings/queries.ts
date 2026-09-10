import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { getSystemSettings } from "@/lib/system-settings";

export interface SystemSettingsData {
  allowWorkspaceCreation: boolean;
  defaultWorkspaceId: string | null;
  /** `null` with no default set, or if the workspace it once pointed at was
   *  deleted (the FK then already cleared `defaultWorkspaceId` itself). */
  defaultWorkspaceName: string | null;
  /** Pickable as the default — suspended workspaces are left out, same as
   *  the reassign-owner picker in `features/admin`. */
  workspaces: { id: string; name: string }[];
}

/**
 * The settings page's data: current flags plus the workspace list for the
 * default-workspace picker. Checks itself; the admin layout isn't a
 * security boundary for individual queries (see `features/admin/queries.ts`).
 */
export const getSystemSettingsData = cache(
  async (): Promise<SystemSettingsData> => {
    await requirePermission("system.settings.manage", PLATFORM);

    const [settings, workspaces] = await Promise.all([
      getSystemSettings(),
      db.workspace.findMany({
        select: { id: true, name: true, suspended: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const defaultWorkspace = settings.defaultWorkspaceId
      ? (workspaces.find((w) => w.id === settings.defaultWorkspaceId) ?? null)
      : null;

    return {
      allowWorkspaceCreation: settings.allowWorkspaceCreation,
      defaultWorkspaceId: settings.defaultWorkspaceId,
      defaultWorkspaceName: defaultWorkspace?.name ?? null,
      workspaces: workspaces
        .filter((w) => !w.suspended)
        .map((w) => ({ id: w.id, name: w.name })),
    };
  },
);
