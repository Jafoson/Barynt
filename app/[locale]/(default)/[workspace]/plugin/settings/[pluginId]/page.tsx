import { notFound } from "next/navigation";
import { WorkspacePluginSettings } from "@/features/plugins/components/PluginSettings/WorkspacePluginSettings";
import { settingsPageOf } from "@/features/plugins/settingsArea";
import { getPluginSettingsArea } from "@/features/plugins/settingsAreaQueries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/**
 * One plugin's settings in this workspace. Needs `plugin.enable` in the workspace, asked by the
 * query itself. A plugin that is not switched on here, one that declares no settings and one that
 * does not exist are all the same: the page is not there, never an empty form. Saving is
 * `saveWorkspacePluginSettings`, which checks everything again.
 */
export default async function WorkspacePluginSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string; locale: string; pluginId: string }>;
}) {
  const { workspace, locale, pluginId } = await params;
  setCurrentWorkspaceId(workspace);
  const area = await getPluginSettingsArea(workspace, locale);
  const plugin = area ? settingsPageOf(area, pluginId) : null;
  if (!plugin) notFound();
  return (
    <WorkspacePluginSettings
      workspaceId={workspace}
      plugin={plugin}
      form={plugin.settings}
    />
  );
}
