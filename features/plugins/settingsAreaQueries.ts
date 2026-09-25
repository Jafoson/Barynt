import "server-only";
import { db } from "@/lib/db";
import { currentUserId, getAccess, projectIdsWith } from "@/lib/permissions";
import { resolveAvatarUrl } from "@/lib/storage";
import { loadOverview } from "./queries";
import {
  type AreaProject,
  type SettingsArea,
  settingsAreaOf,
} from "./settingsArea";
import { buildProjectPlugins, buildWorkspacePlugins } from "./workspacePlugins";

/**
 * The plugins' settings of a workspace, as **this person** may see them, or `null` for someone who
 * may not set any plugin up there (the caller turns it into "page not found", like the other
 * settings pages). Two things decide what they see, each asked here and not only by a layout:
 * `plugin.enable` in the workspace for the workspace's own plugins, and `plugin.enable` in a
 * project (`projectIdsWith`, all projects at once) for that project's. Someone who holds it in one
 * project only sees that project's plugins, and nothing of the workspace's.
 *
 * Only what a plugin admin needs is passed on, like the plugins pages it is put together from: not
 * the plugin directory's path, not a hash, not what is the platform's.
 */
export async function getPluginSettingsArea(
  workspaceId: string,
  locale: string,
): Promise<SettingsArea | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const [access, projectIds] = await Promise.all([
    getAccess({ workspaceId }),
    projectIdsWith(userId, workspaceId, "plugin.enable"),
  ]);
  const ownWorkspace = access.has("plugin.enable");
  if (!ownWorkspace && projectIds.size === 0) return null;

  const [overview, workspaceRows, projectRows] = await Promise.all([
    // Whether plugins from no store are allowed decides nothing here: code from no store does not
    // run whatever it says, and a plugin without code needs no approval.
    loadOverview(locale, async () => false),
    ownWorkspace
      ? db.pluginWorkspace.findMany({
          where: { workspaceId, enabled: true },
          select: { pluginId: true, config: true },
        })
      : Promise.resolve([]),
    projectIds.size > 0
      ? db.pluginProject.findMany({
          where: { enabled: true, projectId: { in: [...projectIds] } },
          select: {
            pluginId: true,
            projectId: true,
            config: true,
            project: {
              select: {
                id: true,
                slug: true,
                name: true,
                color: true,
                avatarKey: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const workspace = ownWorkspace
    ? buildWorkspacePlugins(
        overview,
        new Set(workspaceRows.map((row) => row.pluginId)),
        false,
        new Map(workspaceRows.map((row) => [row.pluginId, row.config])),
      )
    : null;

  // The plugins of each project that has any on: its own page, as its admin would see it.
  const byProject = new Map<string, typeof projectRows>();
  for (const row of projectRows) {
    byProject.set(row.projectId, [
      ...(byProject.get(row.projectId) ?? []),
      row,
    ]);
  }
  const projects = await Promise.all(
    [...byProject.values()].map(async (rows) => {
      const { project } = rows[0];
      const listed: AreaProject = {
        id: project.id,
        slug: project.slug,
        name: project.name,
        color: project.color,
        avatarUrl: (await resolveAvatarUrl(project.avatarKey)) ?? null,
      };
      return {
        project: listed,
        view: buildProjectPlugins(
          overview,
          new Set(rows.map((row) => row.pluginId)),
          false,
          new Map(rows.map((row) => [row.pluginId, row.config])),
        ),
      };
    }),
  );

  return settingsAreaOf({ workspace, projects });
}

/**
 * Whether the plugins' settings are offered to the logged-in user in this workspace: whoever may
 * switch plugins on in the workspace, and whoever may in a project of it. `workspaceAccess` is what
 * the settings layout already resolved, so an admin costs nothing more. Only what is shown: the
 * pages ask again.
 */
export async function canOpenPluginSettings(
  workspaceId: string,
  workspaceAccess: { has(permission: "plugin.enable"): boolean },
): Promise<boolean> {
  if (workspaceAccess.has("plugin.enable")) return true;
  const userId = await currentUserId();
  if (!userId) return false;
  return (await projectIdsWith(userId, workspaceId, "plugin.enable")).size > 0;
}
