import { DashboardLoader } from "@/features/dashboard/components/DashboardLoader/DashboardLoader";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/**
 * The workspace dashboard (BARY-169) — widgets across every project the
 * person sees. It is also the workspace's overview: the "about" widget
 * carries what the separate overview page used to show.
 */
export default async function WorkspaceDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ range?: string; scope?: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  return (
    <>
      {/* The workspace's tabs (V8): Board · List · Dashboard and its views. */}
      <Topbar count={0} view="board" mode="dashboard" />
      <DashboardLoader
        target={{ kind: "workspace", id: workspace }}
        workspace={workspace}
        params={await searchParams}
        area="my"
        place={{ projectId: null, projectSlug: null }}
      />
    </>
  );
}
