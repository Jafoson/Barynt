import { notFound } from "next/navigation";
import { ACTIVITY_OVERVIEW_LIMIT } from "@/features/audit/constants";
import { getProjectActivity } from "@/features/audit/queries";
import { ProjectDashboard } from "@/features/dashboard/components/ProjectDashboard/ProjectDashboard";
import {
  getMyDashboardLayout,
  getProjectDashboard,
} from "@/features/dashboard/queries";
import { toDashboardScope } from "@/features/dashboard/scope";
import { toProjectView } from "@/features/dashboard/view";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { toRange } from "@/lib/buckets";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import {
  projectPath,
  projectSettingsPath,
  workspaceSettingsPath,
} from "@/lib/nav";

export const dynamic = "force-dynamic";

/**
 * A project's landing page, in two views: "Overview" with its profile and
 * "Dashboard" with the numbers. Both come from a single call, switching
 * happens client-side — `?view=` in the URL keeps track of the current state.
 *
 * ── Where the time range and view come from ──
 *
 * Both follow the same precedence: URL first, then the account, then the
 * default. That's the right order — a shared link should show what the
 * sender saw, not whatever the recipient once configured for themselves.
 * Without a URL, whatever the person last had open applies: the project row
 * in the sidebar leads exactly here, and whoever last looked at the numbers
 * there doesn't want to set them up again on the next click.
 */
export default async function ProjectDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; projectSlug: string }>;
  searchParams: Promise<{ range?: string; view?: string; scope?: string }>;
}) {
  const { workspace, projectSlug } = await params;
  const {
    range: rangeParam,
    view: viewParam,
    scope: scopeParam,
  } = await searchParams;
  setCurrentWorkspaceId(workspace);

  const projects = await getWorkspaceProjects();
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) notFound();

  // One call for both — `getMyDashboardLayout` is deduplicated per request
  // via `cache()` and is about to be needed again by `getProjectDashboard`.
  const stored = await getMyDashboardLayout(project.id);

  const range = toRange(rangeParam ?? stored.range ?? undefined);
  const view = toProjectView(viewParam, stored.view);
  const scope = toDashboardScope(scopeParam, stored.scope);

  const data = await getProjectDashboard(project.id, range, scope);
  if (!data) notFound();

  // Just an excerpt for the card in the overview — the full list lives
  // under settings (`.../settings/activity`).
  const activity = await getProjectActivity(
    project.id,
    ACTIVITY_OVERVIEW_LIMIT,
  );

  return (
    <>
      {/* The same tabs as the board and list (BARY-177): Board · List ·
          Dashboard and the saved views — the way back from here. */}
      <Topbar count={0} view="board" projectId={project.id} mode="dashboard" />
      <ProjectDashboard
        {...data}
        view={view}
        issueBase={`/${workspace}/issue`}
        workspaceId={workspace}
        links={{
          board: projectPath(workspace, projectSlug, ""),
          list: projectPath(workspace, projectSlug, "list"),
          members: projectPath(workspace, projectSlug, "members"),
          settings: projectSettingsPath(workspace, projectSlug, ""),
          teams: workspaceSettingsPath(workspace, "teams"),
          activity: projectSettingsPath(workspace, projectSlug, "activity"),
        }}
        activity={activity}
      />
    </>
  );
}
