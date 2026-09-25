import { notFound } from "next/navigation";
import { ProjectPluginSettings } from "@/features/plugins/components/PluginSettings/ProjectPluginSettings";
import { projectPageOf } from "@/features/plugins/settingsArea";
import { getPluginSettingsArea } from "@/features/plugins/settingsAreaQueries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/**
 * A plugin's settings in one project. Needs `plugin.enable` in that project, asked by the query
 * itself (`projectIdsWith`). A plugin that is off in the project, one that declares no settings,
 * a project this person may not set plugins up in and one that does not exist are all the same:
 * the page is not there, never an empty form. Saving is `saveProjectPluginSettings`, which checks
 * everything again.
 */
export default async function ProjectPluginSettingsPage({
  params,
}: {
  params: Promise<{
    workspace: string;
    locale: string;
    pluginId: string;
    projectSlug: string;
  }>;
}) {
  const { workspace, locale, pluginId, projectSlug } = await params;
  setCurrentWorkspaceId(workspace);
  const area = await getPluginSettingsArea(workspace, locale);
  const page = area ? projectPageOf(area, pluginId, projectSlug) : null;
  if (!page) notFound();
  return (
    <ProjectPluginSettings
      workspaceId={workspace}
      plugin={page.plugin}
      project={page.project}
      form={page.settings}
    />
  );
}
