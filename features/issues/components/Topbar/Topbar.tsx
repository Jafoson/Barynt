import { Suspense } from "react";
import { getWorkspaceCustomFields } from "@/features/custom-fields/queries";
import {
  setIssueViewFieldVisibility,
  setIssueViewGroups,
  setMyIssuesViewFieldVisibility,
  setMyIssuesViewGroups,
} from "@/features/issues/actions";
import { isGroupableField } from "@/features/issues/group";
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
import { isFilterableField } from "@/lib/custom-fields/filter";
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
    allCustomFields,
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
    getWorkspaceCustomFields(),
  ]);

  if (!workspace) return null;

  // Only the fields that can be grouped by, and — inside one project — only
  // the ones that apply there: the workspace's and that project's own.
  const inScope = allCustomFields.filter((f) =>
    projectId ? f.projectId === null || f.projectId === projectId : true,
  );
  const customFields = inScope.filter(isGroupableField);
  // The ones that get a filter chip: a wider set than the groupable ones.
  const filterFields = inScope.filter(isFilterableField);

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
        customFields={customFields}
        filterFields={filterFields}
        displayFields={inScope}
        hiddenGroups={groups.hiddenGroups}
        hideEmptyGroups={groups.hideEmptyGroups}
        showSubIssues={groups.showSubIssues}
        onDisplayChange={onDisplayChange}
        onGroupsChange={onGroupsChange}
      />
    </Suspense>
  );
}
