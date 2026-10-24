import BackToWorkspaceClient from "./BackToWorkspace";
import WorkspaceMenu from "./WorkSpaceMenu";

async function SidebarMenu({ isAdminRoute }: { isAdminRoute: boolean }) {
  if (isAdminRoute) {
    return <BackToWorkspaceClient />;
  }
  return <WorkspaceMenu />;
}

export default SidebarMenu;
