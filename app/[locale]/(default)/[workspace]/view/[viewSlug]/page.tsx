import { notFound, redirect } from "next/navigation";
import { DashboardLoader } from "@/features/dashboard/components/DashboardLoader/DashboardLoader";
import { Board } from "@/features/issues/components/Board/Board";
import { IssuePeek } from "@/features/issues/components/IssuePeek/IssuePeek";
import { ListView } from "@/features/issues/components/ListView/ListView";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { getIssueComposerData } from "@/features/issues/editor-data";
import { groupKeyFromParam } from "@/features/issues/group";
import { getWorkspaceIssues } from "@/features/issues/queries";
import { sortKeyFromParam } from "@/features/issues/sort";
import { BoardOrPhoneList } from "@/features/views/components/BoardOrPhoneList/BoardOrPhoneList";
import { getViewBySlug } from "@/features/views/queries";
import { ensureSystemViews } from "@/features/views/system";
import {
  displayFromParams,
  layoutFromParam,
  VIEW_DEFAULT_GROUP,
  VIEW_DEFAULT_SORT,
  viewParams,
} from "@/features/views/url";
import {
  getWorkspaceLabels,
  getWorkspaceMembers,
  getWorkspacePriorities,
  getWorkspaceStatuses,
} from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { canEnterWorkspace, currentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * A cross-project view of the workspace (V8): the board or the list over
 * every project the person sees, with the view's filters, grouping and
 * order — its system views ("My issues") included. Like a project view, the
 * state lives in the address; opened bare, it redirects to the stored one.
 */
export default async function WorkspaceViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspace: string; viewSlug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { locale, workspace, viewSlug } = await params;
  const filters = await searchParams;
  setCurrentWorkspaceId(workspace);

  const userId = await currentUserId();
  if (!userId) redirect(`/${locale}/login`);
  if (!(await canEnterWorkspace(userId, workspace))) notFound();
  // A first visit to a system view's address finds it there.
  await ensureSystemViews(workspace);

  // Someone else's private view, a project's view and a missing one look
  // the same: 404.
  const view = await getViewBySlug(workspace, viewSlug);
  if (!view || view.projectId !== null) notFound();

  // A dashboard view (BARY-169): its widgets over the view's filter.
  if (view.layout === "dashboard") {
    return (
      <>
        <Topbar count={0} view="board" activeView={view} mode="dashboard" />
        <DashboardLoader
          target={{ kind: "view", id: view.id }}
          workspace={workspace}
          params={{ range: filters.range, scope: filters.scope }}
          area="my"
          place={{ projectId: null, projectSlug: null }}
          savedView={view}
        />
      </>
    );
  }

  if (!filters.layout) {
    const [priorities, members, labels] = await Promise.all([
      getWorkspacePriorities(),
      getWorkspaceMembers(),
      getWorkspaceLabels(),
    ]);
    const canonical = viewParams(view, {
      priorities,
      members: members.flatMap((m) =>
        m.handle ? [{ id: m.id, handle: m.handle }] : [],
      ),
      labels,
    });
    // What isn't view state (an open issue panel, a search) comes along.
    for (const [key, value] of Object.entries(filters))
      if (!canonical.has(key)) canonical.set(key, value);
    redirect(
      `/${locale}/${workspace}/view/${viewSlug}?${canonical.toString()}`,
    );
  }

  const layout = layoutFromParam(filters.layout);
  // A missing `?group=`/`?sort=` means the view's defaults — never the
  // person's own, the address is the view's whole state.
  const groupKey = groupKeyFromParam(filters.group ?? VIEW_DEFAULT_GROUP);
  const sortKey = sortKeyFromParam(filters.sort ?? VIEW_DEFAULT_SORT);

  // Display settings belong to the view and live in its address like the
  // filters (BARY-165): hidden and reordered columns, hidden card fields,
  // empty groups, sub-issues.
  const display = displayFromParams(filters);
  const [issues, statuses, composer] = await Promise.all([
    getWorkspaceIssues(userId, workspace, filters, {
      subIssues: layout === "list" || display.showSubIssues,
      // A system view's own condition, behind the filters (V8).
      ...(view.systemKey === "my-issues" && { assignedTo: userId }),
      ...(view.systemKey === "created-by-me" && { reportedBy: userId }),
    }),
    getWorkspaceStatuses(),
    getIssueComposerData(),
  ]);
  if (!composer) notFound();

  const list = (
    <ListView
      issues={issues}
      composer={composer}
      hiddenCardFields={display.hiddenFields}
      hiddenGroups={display.hiddenGroups}
      hideEmptyGroups={display.hideEmptyGroups}
      groupOrder={display.groupOrder}
      sortKey={sortKey}
      groupKey={groupKey}
    />
  );

  return (
    <>
      <Topbar count={issues.length} view={layout} activeView={view} />
      {layout === "board" ? (
        <BoardOrPhoneList
          board={
            <Board
              issues={issues}
              statuses={statuses}
              composer={composer}
              hiddenCardFields={display.hiddenFields}
              hiddenGroups={display.hiddenGroups}
              hideEmptyGroups={display.hideEmptyGroups}
              groupOrder={display.groupOrder}
              displayInUrl
              sortKey={sortKey}
              groupKey={groupKey}
            />
          }
          list={list}
        />
      ) : (
        list
      )}
      {/* Opens the clicked issue as a side panel (`?issue=` in the URL). */}
      <IssuePeek data={composer} />
    </>
  );
}
