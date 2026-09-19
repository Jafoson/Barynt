import { CloseNavButton } from "./components/CloseNavButton";
import NavGroup from "./components/NavGroups";
import NavGroupWorkspace from "./components/NavGroups/Workspace";
import NavGroupWorkspaceDashboard from "./components/NavGroups/WorkspaceDashboard";
import { QuickActions } from "./components/QuickActions";
import SidebarMenu from "./components/SidebarMenu";
import { UserMenu } from "./components/UserMenu";
import styles from "./sidebar.module.scss";

interface SidebarProps {
  isAdminRoute?: boolean;
}

export function Sidebar({ isAdminRoute = false }: SidebarProps) {
  return (
    <aside className={styles.aside}>
      <div className={styles.top}>
        <SidebarMenu isAdminRoute={isAdminRoute} />
        <CloseNavButton />
      </div>
      {/* Pinned like the top row: "New task" and search stay in reach while
          the navigation below scrolls. */}
      {!isAdminRoute && <QuickActions />}
      <div
        className={[styles.scroll, !isAdminRoute && styles.scrollProjects]
          .filter(Boolean)
          .join(" ")}
      >
        <NavGroup isAdminRoute={isAdminRoute} />
      </div>
      {/* Workspace-level entries (members, teams, settings): pinned above
          the footer like it, not part of what scrolls. */}
      {!isAdminRoute && (
        <div className={styles.pinned} data-nav-pinned>
          {/* Phone only: "Overview" and "Dashboard" lead the bottom bar. */}
          <div className={styles.pinnedPhoneOnly}>
            <NavGroupWorkspaceDashboard bare />
          </div>
          <div>
            <NavGroupWorkspace />
          </div>
        </div>
      )}
      <UserMenu />
    </aside>
  );
}
