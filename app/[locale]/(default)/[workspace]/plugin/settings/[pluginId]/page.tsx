import { notFound } from "next/navigation";
import { WorkspacePluginSettings } from "@/features/plugins/components/PluginSettings/WorkspacePluginSettings";
import { PluginSettingsProjects } from "@/features/plugins/components/PluginSettingsProjects/PluginSettingsProjects";
import { pluginPageOf } from "@/features/plugins/settingsArea";
import { getPluginSettingsArea } from "@/features/plugins/settingsAreaQueries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/**
 * One plugin's settings. A plugin of the workspace's own is its form; a plugin that is set per
 * project is the projects to choose from. Needs `plugin.enable` in the workspace (for the first) or
 * in a project (for the second), asked by the query itself. A plugin that is not switched on, one
 * that declares no settings, one this person may not set up and one that does not exist are all
 * the same: the page is not there, never an empty form. Saving is `saveWorkspacePluginSettings`,
 * which checks everything again.
 */
export default async function WorkspacePluginSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string; locale: string; pluginId: string }>;
}) {
  const { workspace, locale, pluginId } = await params;
  setCurrentWorkspaceId(workspace);
  const area = await getPluginSettingsArea(workspace, locale);
  if (!area) notFound();

  const page = pluginPageOf(area, pluginId);
  if (!page) notFound();
  if (page.kind === "projects") {
    return (
      <PluginSettingsProjects workspaceId={workspace} plugin={page.plugin} />
    );
  }
  return (
    <WorkspacePluginSettings
      workspaceId={workspace}
      plugin={page.plugin}
      form={page.plugin.settings}
    />
  );
}
