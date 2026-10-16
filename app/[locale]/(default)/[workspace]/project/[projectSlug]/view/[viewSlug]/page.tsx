import { notFound, redirect } from "next/navigation";
import { DashboardLoader } from "@/features/dashboard/components/DashboardLoader/DashboardLoader";
import { Board } from "@/features/issues/components/Board/Board";
import { IssuePeek } from "@/features/issues/components/IssuePeek/IssuePeek";
import { ListView } from "@/features/issues/components/ListView/ListView";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { getIssueComposerData } from "@/features/issues/editor-data";
import { groupKeyFromParam } from "@/features/issues/group";
import { getIssuesByProject } from "@/features/issues/queries";
import { sortKeyFromParam } from "@/features/issues/sort";
import { BoardOrPhoneList } from "@/features/views/components/BoardOrPhoneList/BoardOrPhoneList";
import { getViewBySlug } from "@/features/views/queries";
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
  getWorkspaceProjects,
  getWorkspaceStatuses,
} from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/**
 * A saved view of a project (BARY-164): the board or the list, with the
 * view's filters, grouping and order.
 *
 * The view's state lives in the address like everywhere else on the board
 * and list. Opened bare (no `?layout=`, e.g. from a freshly created view or a
 * typed link), the page redirects to the view's stored state; from then on
 * every control works on the URL and the topbar compares it with that state
 * to show "unsaved".
 */
export default async function SavedViewPage({
  params,
  searchParams,
}: {
  params: Promise<{
    locale: string;
    workspace: string;
    projectSlug: string;
    viewSlug: string;
  }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { locale, workspace, projectSlug, viewSlug } = await params;
  const filters = await searchParams;
  setCurrentWorkspaceId(workspace);

  const projects = await getWorkspaceProjects();
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) notFound();

  // Someone else's private view and a missing one look the same: 404.
  const view = await getViewBySlug(workspace, viewSlug);
  if (!view || view.projectId !== project.id) notFound();

  // A dashboard view (BARY-169): its widgets over the view's filter.
  if (view.layout === "dashboard") {
    return (
      <>
        <Topbar
          count={0}
          view="board"
          projectId={project.id}
          activeView={view}
          mode="dashboard"
        />
        <DashboardLoader
          target={{ kind: "view", id: view.id }}
          workspace={workspace}
          params={{ range: filters.range, scope: filters.scope }}
          area="project"
          place={{ projectId: project.id, projectSlug: project.slug }}
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
      `/${locale}/${workspace}/project/${projectSlug}/view/${viewSlug}?${canonical.toString()}`,
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
    getIssuesByProject(project.id, filters, {
      subIssues: layout === "list" || display.showSubIssues,
    }),
    getWorkspaceStatuses(),
    getIssueComposerData(),
  ]);
  if (!composer) notFound();

  const list = (
    <ListView
      issues={issues}
      projectId={project.id}
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
      <Topbar
        count={issues.length}
        view={layout}
        projectId={project.id}
        activeView={view}
      />
      {layout === "board" ? (
        <BoardOrPhoneList
          board={
            <Board
              issues={issues}
              projectId={project.id}
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
