import { notFound } from "next/navigation";
import { ViewsDirectory } from "@/features/views/components/ViewsDirectory/ViewsDirectory";
import { getVisibleViews } from "@/features/views/queries";
import { ensureSystemViews } from "@/features/views/system";
import { getWorkspaceMembers } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import {
  canEnterWorkspace,
  currentUserId,
  hasPermission,
} from "@/lib/permissions";
import { fullName } from "@/lib/utils/string";

export const dynamic = "force-dynamic";

/**
 * Every view the person can see, in one list (BARY-178) — the sidebar only
 * holds the pinned and starred ones, this is where the rest are found.
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

  const [views, members, canShare] = await Promise.all([
    getVisibleViews(workspace),
    getWorkspaceMembers(),
    hasPermission("view.share", { workspaceId: workspace }),
  ]);
  const names = new Map(members.map((m) => [m.id, fullName(m)]));

  return (
    <ViewsDirectory
      workspaceId={workspace}
      me={userId}
      canShare={canShare}
      views={views.map((v) => ({
        ...v,
        ownerName: v.ownerId ? (names.get(v.ownerId) ?? null) : null,
      }))}
    />
  );
}
