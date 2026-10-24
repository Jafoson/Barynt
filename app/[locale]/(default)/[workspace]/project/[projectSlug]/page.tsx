import { notFound } from "next/navigation";
import { getMyPreferences } from "@/features/account/queries";
import { setIssueViewGroups } from "@/features/issues/actions";
import { Board } from "@/features/issues/components/Board/Board";
import { BoardUnlessPhone } from "@/features/issues/components/Board/BoardUnlessPhone";
import { IssuePeek } from "@/features/issues/components/IssuePeek/IssuePeek";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { getIssueComposerData } from "@/features/issues/editor-data";
import { groupKeyFromParam, laneKeyFromParam } from "@/features/issues/group";
import {
  getIssuesByProject,
  getIssueViewGroups,
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
  // The grouping and order a view opens with when the address names none.
  const defaults = await getMyPreferences();

  const projects = await getWorkspaceProjects();
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) notFound();

  const groups = await getIssueViewGroups(project.id, "board");
  const [issues, statuses, composer, hiddenCardFields] = await Promise.all([
    getIssuesByProject(project.id, filters, {
      subIssues: groups.showSubIssues,
    }),
    getWorkspaceStatuses(),
    getIssueComposerData(),
    getIssueViewPreference(project.id, "board"),
  ]);
  if (!composer) notFound();

  const groupKey = groupKeyFromParam(filters.group ?? defaults.defaultGrouping);

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
          hiddenGroups={groups.hiddenGroups}
          hideEmptyGroups={groups.hideEmptyGroups}
          groupOrder={groups.groupOrder}
          onGroupsChange={setIssueViewGroups.bind(null, project.id, "board")}
          sortKey={sortKeyFromParam(filters.sort ?? defaults.defaultSort)}
          groupKey={groupKey}
          laneKey={laneKeyFromParam(filters.lanes, groupKey)}
          hideEmptyLanes={groups.hideEmptyLanes}
          collapsedLanes={groups.collapsedLanes}
        />
      </BoardUnlessPhone>
      {/* Opens the clicked issue as a side panel (`?issue=` in the URL). */}
      <IssuePeek data={composer} />
    </>
  );
}
