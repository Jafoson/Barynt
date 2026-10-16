import { notFound } from "next/navigation";
import { ACTIVITY_OVERVIEW_LIMIT } from "@/features/audit/constants";
import { getWorkspaceActivity } from "@/features/audit/queries";
import { WorkspaceDashboard } from "@/features/dashboard/components/WorkspaceDashboard/WorkspaceDashboard";
import {
  getMyWorkspaceDashboardLayout,
  getWorkspaceDashboard,
} from "@/features/dashboard/queries";
import { toDashboardScope } from "@/features/dashboard/scope";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { toRange } from "@/lib/buckets";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { workspacePath, workspaceSettingsPath } from "@/lib/nav";

export const dynamic = "force-dynamic";

/**
 * The workspace dashboard — the numbers across all of its projects. Its
 * counterpart is the workspace root (`/<workspaceId>`, no `/overview`);
 * unlike with a project, these are two separate routes here, each with its
 * own nav link in the sidebar — see `WorkspaceDashboard` for the reasoning.
 */
export default async function WorkspaceDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ range?: string; scope?: string }>;
}) {
  const { workspace } = await params;
  const { range: rangeParam, scope: scopeParam } = await searchParams;
  setCurrentWorkspaceId(workspace);

  const stored = await getMyWorkspaceDashboardLayout(workspace);
  const range = toRange(rangeParam ?? stored.range ?? undefined);
  const scope = toDashboardScope(scopeParam, stored.scope);

  const data = await getWorkspaceDashboard(workspace, range, scope);
  if (!data) notFound();

  const activity = await getWorkspaceActivity(
    workspace,
    ACTIVITY_OVERVIEW_LIMIT,
  );

  return (
    <>
      {/* The workspace's tabs (V8): Board · List · Dashboard and its views
          — the way across from here. */}
      <Topbar count={0} view="board" mode="dashboard" />
      <WorkspaceDashboard
        {...data}
        view="dashboard"
        issueBase={`/${workspace}/issue`}
        links={{
          dashboard: workspacePath(workspace, "dashboard"),
          overview: workspacePath(workspace, ""),
          projects: workspacePath(workspace, "projects"),
          members: workspacePath(workspace, "members"),
          teams: workspacePath(workspace, "teams"),
          settings: workspaceSettingsPath(workspace, ""),
          activity: workspaceSettingsPath(workspace, "activity"),
        }}
        activity={activity}
      />
    </>
  );
}
