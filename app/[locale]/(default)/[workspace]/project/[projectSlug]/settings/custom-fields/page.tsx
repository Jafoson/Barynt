import { notFound } from "next/navigation";
import { CustomFields } from "@/features/custom-fields/components/CustomFields/CustomFields";
import { getCustomFieldsView } from "@/features/custom-fields/queries";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/**
 * A project's custom fields. The workspace's fields apply here too and are
 * listed for reference; they are changed in the workspace settings.
 */
export default async function ProjectCustomFieldsPage({
  params,
}: {
  params: Promise<{ workspace: string; projectSlug: string }>;
}) {
  const { workspace, projectSlug } = await params;
  setCurrentWorkspaceId(workspace);

  const projects = await getWorkspaceProjects();
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) notFound();

  const view = await getCustomFieldsView({ projectId: project.id });
  if (!view) notFound();

  return (
    <CustomFields
      own={view.own}
      inherited={view.inherited}
      workspaceId={workspace}
      projectId={project.id}
      projectName={project.name}
    />
  );
}
