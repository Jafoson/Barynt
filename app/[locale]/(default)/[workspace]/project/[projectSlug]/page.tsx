import { notFound } from "next/navigation";
import { Board } from "@/features/issues/components/Board/Board";
import { BoardUnlessPhone } from "@/features/issues/components/Board/BoardUnlessPhone";
import { IssuePeek } from "@/features/issues/components/IssuePeek/IssuePeek";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { getIssueComposerData } from "@/features/issues/editor-data";
import { groupKeyFromParam } from "@/features/issues/group";
import {
  getIssuesByProject,
  getIssueViewPreference,
} from "@/features/issues/queries";
import { sortKeyFromParam } from "@/features/issues/sort";
import {
  getWorkspaceProjects,
  getWorkspaceStatuses,
} from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; projectSlug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { workspace, projectSlug } = await params;
  const filters = await searchParams;
  setCurrentWorkspaceId(workspace);

  const projects = await getWorkspaceProjects();
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) notFound();

  const [issues, statuses, composer, hiddenCardFields] = await Promise.all([
    getIssuesByProject(project.id, filters),
    getWorkspaceStatuses(),
    getIssueComposerData(),
    getIssueViewPreference(project.id, "board"),
  ]);
  if (!composer) notFound();

  return (
    <>
      <Topbar count={issues.length} view="board" projectId={project.id} />
      <BoardUnlessPhone>
        <Board
          issues={issues}
          projectId={project.id}
          statuses={statuses}
          composer={composer}
          hiddenCardFields={hiddenCardFields}
          sortKey={sortKeyFromParam(filters.sort)}
          groupKey={groupKeyFromParam(filters.group)}
        />
      </BoardUnlessPhone>
      {/* Opens the clicked issue as a side panel (`?issue=` in the URL). */}
      <IssuePeek data={composer} />
    </>
  );
}
