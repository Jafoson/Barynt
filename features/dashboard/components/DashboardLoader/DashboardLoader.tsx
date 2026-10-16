import { notFound } from "next/navigation";
import { getDashboard } from "@/features/dashboard/queries";
import type { DashboardTarget } from "@/features/dashboard/types";
import type { SavedView } from "@/features/views/schema";
import { viewParams } from "@/features/views/url";
import {
  getWorkspaceIssueTypes,
  getWorkspaceLabels,
  getWorkspaceMembers,
  getWorkspacePriorities,
  getWorkspaceProjects,
  getWorkspaceStatuses,
} from "@/features/workspaces/queries";
import { hasPermission } from "@/lib/permissions";
import { Dashboard } from "../Dashboard/Dashboard";

interface Props {
  target: DashboardTarget;
  /** The workspace id from the address — issue links and the feed use it. */
  workspace: string;
  /** `?range=` / `?scope=` from the address. */
  params: { range?: string; scope?: string };
  /** "my": across projects, so project is a filter field too. */
  area: "project" | "my";
  /** Where a view saved from here would live — the project, or `null`
   *  for the workspace. */
  place: { projectId: string | null; projectSlug: string | null };
  /** For a dashboard view: the view, whose filter a copy takes along. */
  savedView?: SavedView;
}

/**
 * Loads a dashboard and what its widget filters offer, and hands both to
 * the interactive `Dashboard`. The project dashboard, the workspace
 * dashboard and dashboard views all render through here. Needs the current
 * workspace set (`setCurrentWorkspaceId`) by the page.
 */
export async function DashboardLoader({
  target,
  workspace,
  params,
  area,
  place,
  savedView,
}: Props) {
  const [
    view,
    statuses,
    priorities,
    issueTypes,
    members,
    labels,
    projects,
    canShare,
  ] = await Promise.all([
    getDashboard(target, params),
    getWorkspaceStatuses(),
    getWorkspacePriorities(),
    getWorkspaceIssueTypes(),
    getWorkspaceMembers(),
    getWorkspaceLabels(),
    getWorkspaceProjects(),
    hasPermission(
      "view.share",
      place.projectId
        ? { projectId: place.projectId }
        : { workspaceId: workspace },
    ),
  ]);
  if (!view) notFound();

  // "Save as new view" from a dashboard view keeps its filter.
  const currentParams = savedView
    ? Object.fromEntries(
        viewParams(savedView, {
          priorities,
          members: members.flatMap((m) =>
            m.handle ? [{ id: m.id, handle: m.handle }] : [],
          ),
          labels,
          projects,
        }),
      )
    : {};

  return (
    <Dashboard
      // A fresh state for every new server answer (saved layout, other
      // range or scope) — the edit mode's draft and the fetched data reset.
      key={JSON.stringify([view.range, view.scope, view.layout.widgets])}
      view={view}
      issueBase={`/${workspace}/issue`}
      workspaceSlug={workspace}
      lookups={{ statuses, priorities, issueTypes, members, labels, projects }}
      area={area}
      newView={{
        workspaceId: workspace,
        projectId: place.projectId,
        projectSlug: place.projectSlug,
        canShare,
        currentParams,
      }}
    />
  );
}
