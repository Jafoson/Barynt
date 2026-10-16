import { getTranslations } from "next-intl/server";
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
import type { ViewTab } from "@/features/views/components/ViewTabs/ViewTabs";
import { getProjectViews, getWorkspaceViews } from "@/features/views/queries";
import type { SavedView } from "@/features/views/schema";
import { ensureSystemViews } from "@/features/views/system";
import { type SlugLookups, viewParams, viewPath } from "@/features/views/url";
import {
  getCurrentWorkspace,
  getWorkspaceIssueTypes,
  getWorkspaceLabels,
  getWorkspaceMembers,
  getWorkspacePriorities,
  getWorkspaceProjects,
  getWorkspaceStatuses,
} from "@/features/workspaces/queries";
import { currentUserId, hasPermission } from "@/lib/permissions";
import { fullName } from "@/lib/utils/string";
import type { User } from "@/types";
import { TopbarClient, type TopbarViews } from "./TopbarClient";

interface TopbarProps {
  /** Issues in the current view — already narrowed by the active filters. */
  count: number;
  /** Which board/list is showing — decides whose display preference to load. */
  view: "board" | "list";
  /** Left out across projects — the workspace's board, list and views. */
  projectId?: string;
  /** The saved view this page shows (BARY-164) — absent on the plain
   *  board/list. */
  activeView?: SavedView;
  /** `dashboard`: only the tab row, above the project dashboard (BARY-177). */
  mode?: "issues" | "dashboard";
}

/** Title, issue count, search, filter/sort/view bar above the board and list. */
export async function Topbar({
  count,
  view,
  projectId,
  activeView,
  mode = "issues",
}: TopbarProps) {
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

  const project = projectId ? projects.find((p) => p.id === projectId) : null;
  // A project's views — or, outside a project, the workspace's (V8).
  const views =
    projectId && !project
      ? undefined
      : await loadTopbarViews({
          workspaceId: workspace.id,
          projectId: project?.id ?? null,
          projectSlug: project?.slug ?? null,
          lookups: { priorities, members: withHandles(members), labels },
          members,
          activeView,
        });

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
        showSubIssues={groups.showSubIssues}
        groupOrder={groups.groupOrder}
        onDisplayChange={onDisplayChange}
        onGroupsChange={onGroupsChange}
        views={views}
        mode={mode}
      />
    </Suspense>
  );
}

/** Members that have a handle — the only ones a URL filter can name. */
function withHandles(members: User[]): SlugLookups["members"] {
  return members.flatMap((m) =>
    m.handle ? [{ id: m.id, handle: m.handle }] : [],
  );
}

/**
 * The project's saved views for the views row (BARY-164): each with the
 * address of its stored state, and the open one with what "unsaved" is
 * measured against.
 */
async function loadTopbarViews({
  workspaceId,
  projectId,
  projectSlug,
  lookups,
  members,
  activeView,
}: {
  workspaceId: string;
  /** `null`: the workspace's cross-project views (V8). */
  projectId: string | null;
  projectSlug: string | null;
  lookups: SlugLookups;
  members: User[];
  activeView?: SavedView;
}): Promise<TopbarViews> {
  if (!projectId) await ensureSystemViews(workspaceId);
  const [views, canShare, me] = await Promise.all([
    projectId
      ? getProjectViews(workspaceId, projectId)
      : getWorkspaceViews(workspaceId),
    hasPermission("view.share", projectId ? { projectId } : { workspaceId }),
    currentUserId(),
  ]);

  // Across projects (V8) the system views come first and say what sets
  // them apart ("Assigned", "Created by me"); the workspace's own follow.
  const t = projectId ? null : await getTranslations();
  const shown = [
    ...views.filter((v) => v.systemKey),
    ...views.filter((v) => !v.systemKey),
  ];

  const hrefOf = (v: SavedView) =>
    `${viewPath(workspaceId, projectSlug, v.slug)}?${viewParams(v, lookups).toString()}`;
  // Only for someone else's shared view — your own needs no attribution.
  const sharedByOf = (v: SavedView) => {
    if (v.visibility === "PRIVATE" || v.ownerId === me) return null;
    const owner = members.find((m) => m.id === v.ownerId);
    return owner ? fullName(owner) : null;
  };

  const tabs: ViewTab[] = shown.map((v) => ({
    id: v.id,
    // In "My issues" the tabs say what sets them apart ("Assigned").
    name: t && v.systemKey ? t(`views.systemTab.${v.systemKey}`) : v.name,
    slug: v.slug,
    icon: v.icon,
    color: v.color,
    layout: v.layout,
    visibility: v.visibility,
    canEdit: v.canEdit,
    href: hrefOf(v),
    sharedBy: sharedByOf(v),
    system: Boolean(v.systemKey),
    pinned: v.pinned,
    favorite: v.favorite,
    startView: v.startView,
  }));

  return {
    projectId,
    projectSlug,
    canShare,
    tabs,
    active: activeView
      ? {
          id: activeView.id,
          canEdit: activeView.canEdit,
          href: hrefOf(activeView),
          sharedBy: sharedByOf(activeView),
          name: activeView.name,
          icon: activeView.icon,
          color: activeView.color,
          layout: activeView.layout,
          canonical: viewParams(activeView, lookups).toString(),
          systemKey: activeView.systemKey,
        }
      : null,
  };
}
