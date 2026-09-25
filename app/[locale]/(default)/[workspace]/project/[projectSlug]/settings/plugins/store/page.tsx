import { notFound } from "next/navigation";
import { PluginStore } from "@/features/plugins/components/PluginStore/PluginStore";
import { getProjectStore } from "@/features/plugins/projectStoreQueries";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { projectSettingsPath } from "@/lib/nav";
import { PermissionError } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * The plugin store for a project: the plugins that apply per project, to add for the project or
 * switch on. Needs `plugin.enable` in this project, and the platform having given projects the
 * store (`SystemSettings`, open by default); otherwise the page is not there.
 */
export default async function ProjectPluginStorePage({
  params,
}: {
  params: Promise<{ workspace: string; projectSlug: string; locale: string }>;
}) {
  const { workspace, projectSlug, locale } = await params;
  setCurrentWorkspaceId(workspace);

  const projects = await getWorkspaceProjects();
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) notFound();

  try {
    const store = await getProjectStore(project.id, locale);
    if (!store) notFound();
    return (
      <PluginStore
        view={store.view}
        project={{
          ...store.project,
          basePath: projectSettingsPath(workspace, projectSlug, "plugins"),
        }}
      />
    );
  } catch (error) {
    if (error instanceof PermissionError) notFound();
    throw error;
  }
}
