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

  //TODO: add logic to handle if user is not part of any workspace

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
