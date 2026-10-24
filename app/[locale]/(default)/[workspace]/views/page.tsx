import { notFound } from "next/navigation";
import { ViewsDirectory } from "@/features/views/components/ViewsDirectory/ViewsDirectory";
import { getVisibleViews } from "@/features/views/queries";
import { ensureSystemViews } from "@/features/views/system";
import {
  getWorkspaceIssueTypes,
  getWorkspaceLabels,
  getWorkspaceMembers,
  getWorkspacePriorities,
  getWorkspaceProjects,
  getWorkspaceStatuses,
} from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import {
  canEnterWorkspace,
  currentUserId,
  hasPermission,
} from "@/lib/permissions";
import { fullName } from "@/lib/utils/string";

export const dynamic = "force-dynamic";

/**
 * Every view the person can see, in one place (BARY-178) — the sidebar
 * only holds the starred and pinned ones. Views are made here too, in the
 * workspace or in any project.
 */
export default async function ViewsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  const userId = await currentUserId();
  if (!userId || !(await canEnterWorkspace(userId, workspace))) notFound();
  await ensureSystemViews(workspace);

  const [views, members, projects, statuses, priorities, issueTypes, labels] =
    await Promise.all([
      getVisibleViews(workspace),
      getWorkspaceMembers(),
      getWorkspaceProjects(),
      getWorkspaceStatuses(),
      getWorkspacePriorities(),
      getWorkspaceIssueTypes(),
      getWorkspaceLabels(),
    ]);
  // Who may share a new view where — the workspace (`""`) and each project.
  const shareFlags = await Promise.all([
    hasPermission("view.share", { workspaceId: workspace }),
    ...projects.map((p) => hasPermission("view.share", { projectId: p.id })),
  ]);
  const canShareIn: Record<string, boolean> = { "": shareFlags[0] };
  projects.forEach((p, i) => {
    canShareIn[p.id] = shareFlags[i + 1];
  });
  const names = new Map(members.map((m) => [m.id, fullName(m)]));

  return (
    <ViewsDirectory
      workspaceId={workspace}
      me={userId}
      canShareIn={canShareIn}
      projects={projects}
      lookups={{ statuses, priorities, issueTypes, members, labels, projects }}
      views={views.map((v) => ({
        ...v,
        ownerName: v.ownerId ? (names.get(v.ownerId) ?? null) : null,
      }))}
    />
  );
}
