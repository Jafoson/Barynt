import { Suspense } from "react";
import {
  setIssueViewFieldVisibility,
  setIssueViewGroups,
  setMyIssuesViewFieldVisibility,
  setMyIssuesViewGroups,
} from "@/features/issues/actions";
import {
  getIssueViewGroups,
  getIssueViewPreference,
  getMyIssuesViewGroups,
  getMyIssuesViewPreference,
} from "@/features/issues/queries";
import {
  getCurrentWorkspace,
  getWorkspaceIssueTypes,
  getWorkspaceLabels,
  getWorkspaceMembers,
  getWorkspacePriorities,
  getWorkspaceProjects,
  getWorkspaceStatuses,
} from "@/features/workspaces/queries";
import { TopbarClient } from "./TopbarClient";

interface TopbarProps {
  /** Issues in the current view — already narrowed by the active filters. */
  count: number;
  /** Which board/list is showing — decides whose display preference to load. */
  view: "board" | "list";
  /** Left out for the cross-project "my issues" board/list (BARY-33). */
  projectId?: string;
}

/** Title, issue count, search, filter/sort/view bar above the board and list. */
export async function Topbar({ count, view, projectId }: TopbarProps) {
  const [
    workspace,
    projects,
    statuses,
    priorities,
    members,
    labels,
    hiddenCardFields,
    groups,
    issueTypes,
  ] = await Promise.all([
    getCurrentWorkspace(),
    getWorkspaceProjects(),
    getWorkspaceStatuses(),
    getWorkspacePriorities(),
    getWorkspaceMembers(),
    getWorkspaceLabels(),
    projectId
      ? getIssueViewPreference(projectId, view)
      : getMyIssuesViewPreference(view),
    projectId
      ? getIssueViewGroups(projectId, view)
      : getMyIssuesViewGroups(view),
    getWorkspaceIssueTypes(),
  ]);

  if (!workspace) return null;

  // Bound Server Actions, not closures — Client Components can only receive
  // props across the boundary that are themselves Server Actions; binding
  // projectId/view here keeps `ViewSettings` itself unaware of which of the
  // two preference models (project-scoped vs. workspace-scoped, BARY-33) it's
  // writing to.
  const onDisplayChange = projectId
    ? setIssueViewFieldVisibility.bind(null, projectId, view)
    : setMyIssuesViewFieldVisibility.bind(null, view);

  const onGroupsChange = projectId
    ? setIssueViewGroups.bind(null, projectId, view)
    : setMyIssuesViewGroups.bind(null, view);

  return (
    <Suspense>
      <TopbarClient
        count={count}
        workspaceId={workspace.id}
        projects={projects}
        statuses={statuses}
        priorities={priorities}
        members={members}
        labels={labels}
        hiddenCardFields={hiddenCardFields}
        issueTypes={issueTypes}
        hiddenGroups={groups.hiddenGroups}
        hideEmptyGroups={groups.hideEmptyGroups}
        onDisplayChange={onDisplayChange}
        onGroupsChange={onGroupsChange}
      />
    </Suspense>
  );
}
