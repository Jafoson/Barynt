import { notFound } from "next/navigation";
import { ProjectPlugins } from "@/features/plugins/components/ProjectPlugins/ProjectPlugins";
import { getProjectPlugins } from "@/features/plugins/projectQueries";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { PermissionError } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * The plugins of a project: which of the platform's plugins that apply per project it switches
 * on. Needs `plugin.enable` in this project; the query asks for it itself, a layout protects
 * nothing.
 */
export default async function ProjectPluginsPage({
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
    const view = await getProjectPlugins(project.id, locale);
    return <ProjectPlugins projectId={project.id} view={view} />;
  } catch (error) {
    // Whoever may not is told the page is not there, like on the other settings pages.
    if (error instanceof PermissionError) notFound();
    throw error;
  }
}
