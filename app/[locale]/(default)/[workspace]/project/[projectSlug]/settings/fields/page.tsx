import { notFound } from "next/navigation";
import { setProjectFieldVisibility } from "@/features/projects/actions";
import { ProjectFields } from "@/features/projects/components/ProjectFields/ProjectFields";
import { getProjectFieldsView } from "@/features/projects/queries";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/** Which fields of the issue detail view this project shows (BARY-31). */
export default async function ProjectFieldsPage({
  params,
}: {
  params: Promise<{ workspace: string; projectSlug: string }>;
}) {
  const { workspace, projectSlug } = await params;
  setCurrentWorkspaceId(workspace);

  const projects = await getWorkspaceProjects();
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) notFound();

  const view = await getProjectFieldsView(project.id);
  if (!view) notFound();

  return (
    <ProjectFields
      {...view}
      onChange={setProjectFieldVisibility.bind(null, project.id)}
    />
  );
}
