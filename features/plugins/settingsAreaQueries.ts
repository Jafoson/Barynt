import "server-only";
import { PermissionError } from "@/lib/permissions";
import { type SettingsArea, settingsAreaOf } from "./settingsArea";
import { getWorkspacePlugins } from "./workspaceQueries";

/**
 * The plugins' settings of a workspace, or `null` for someone who may not see them: it needs
 * `plugin.enable` in that workspace, asked by `getWorkspacePlugins` itself (a layout protects
 * nothing), and the caller turns `null` into "page not found", like the other settings pages.
 * Any other failure is not swallowed.
 */
export async function getPluginSettingsArea(
  workspaceId: string,
  locale: string,
): Promise<SettingsArea | null> {
  try {
    return settingsAreaOf(await getWorkspacePlugins(workspaceId, locale));
  } catch (error) {
    if (error instanceof PermissionError) return null;
    throw error;
  }
}
