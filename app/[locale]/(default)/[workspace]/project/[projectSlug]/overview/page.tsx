import { notFound } from "next/navigation";
import { DashboardLoader } from "@/features/dashboard/components/DashboardLoader/DashboardLoader";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/**
 * A project's dashboard (BARY-169) — and its overview: the "about" widget
 * says what the project is, the others how it's doing. Range and scope come
 * from the address, else from what the person last chose.
 */
export default async function ProjectDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; projectSlug: string }>;
  searchParams: Promise<{ range?: string; scope?: string }>;
}) {
  const { workspace, projectSlug } = await params;
  setCurrentWorkspaceId(workspace);

  const projects = await getWorkspaceProjects();
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) notFound();

  return (
    <>
      {/* The same tabs as the board and list (BARY-177). */}
      <Topbar count={0} view="board" projectId={project.id} mode="dashboard" />
      <DashboardLoader
        target={{ kind: "project", id: project.id }}
        workspace={workspace}
        params={await searchParams}
        area="project"
      />
    </>
  );
}
