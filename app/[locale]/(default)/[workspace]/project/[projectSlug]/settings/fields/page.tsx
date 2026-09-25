import { notFound } from "next/navigation";
import { CustomFields } from "@/features/custom-fields/components/CustomFields/CustomFields";
import { getCustomFieldsView } from "@/features/custom-fields/queries";
import { setProjectFieldVisibility } from "@/features/projects/actions";
import { ProjectFields } from "@/features/projects/components/ProjectFields/ProjectFields";
import { getProjectFieldsView } from "@/features/projects/queries";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/** Which fields of the issue detail view this project shows (BARY-31), and the fields it adds (BARY-81). */
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

  const [view, customFields] = await Promise.all([
    getProjectFieldsView(project.id),
    getCustomFieldsView({ projectId: project.id }),
  ]);
  if (!view) notFound();

  return (
    <ProjectFields
      {...view}
      onChange={setProjectFieldVisibility.bind(null, project.id)}
    >
      {customFields && <CustomFields view={customFields} embedded />}
    </ProjectFields>
  );
}
