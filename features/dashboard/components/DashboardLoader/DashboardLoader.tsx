import { notFound } from "next/navigation";
import { getDashboard } from "@/features/dashboard/queries";
import type { DashboardTarget } from "@/features/dashboard/types";
import {
  getWorkspaceIssueTypes,
  getWorkspaceLabels,
  getWorkspaceMembers,
  getWorkspacePriorities,
  getWorkspaceProjects,
  getWorkspaceStatuses,
} from "@/features/workspaces/queries";
import { Dashboard } from "../Dashboard/Dashboard";

interface Props {
  target: DashboardTarget;
  /** The workspace id from the address — issue links and the feed use it. */
  workspace: string;
  /** `?range=` / `?scope=` from the address. */
  params: { range?: string; scope?: string };
  /** "my": across projects, so project is a filter field too. */
  area: "project" | "my";
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
}: Props) {
  const [view, statuses, priorities, issueTypes, members, labels, projects] =
    await Promise.all([
      getDashboard(target, params),
      getWorkspaceStatuses(),
      getWorkspacePriorities(),
      getWorkspaceIssueTypes(),
      getWorkspaceMembers(),
      getWorkspaceLabels(),
      getWorkspaceProjects(),
    ]);
  if (!view) notFound();

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
    />
  );
}
