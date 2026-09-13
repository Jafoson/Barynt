import {
  getCurrentWorkspace,
  getMyWorkspaces,
} from "@/features/workspaces/queries";
import { canCreateWorkspace, getSystemSettings } from "@/lib/system-settings";
import { WorkspaceMenuClient } from "./WorkSpaceMenuClient";

async function WorkspaceMenu() {
  const [workspace, userWorkspaces, settings] = await Promise.all([
    getCurrentWorkspace(),
    getMyWorkspaces(),
    getSystemSettings(),
  ]);

  // `!workspace` can't actually happen here: the `[workspace]` layout above
  // this already calls `notFound()` when it doesn't resolve. `userWorkspaces`
  // (workspace memberships) is a separate story though — a project guest
  // (`canEnterWorkspace`'s path 3 in `lib/permissions.ts`) can view this very
  // workspace without a membership row, so the list below can legitimately be
  // empty. That case is handled inside `WorkspaceMenuClient`.
  if (!workspace) return null;
  return (
    <WorkspaceMenuClient
      workspace={workspace}
      userWorkspaces={userWorkspaces}
      canCreateWorkspace={canCreateWorkspace(settings)}
    />
  );
}

export default WorkspaceMenu;
