import styles from "../../sidebar.module.scss";
import NavGroupAdmin from "./Admin";
import NavGroupFavorites from "./Favorites";
import NavGroupGlobal from "./Global";
import NavGroupProjects from "./Projects";
import NavGroupViews from "./Views";
import NavGroupWorkspaceDashboard from "./WorkspaceDashboard";

interface NavGroupProps {
  isAdminRoute: boolean;
}

function NavGroup({ isAdminRoute = true }: NavGroupProps) {
  return (
    <div className={styles.navGroup}>
      {!isAdminRoute && (
        <>
          <NavGroupWorkspaceDashboard />
          {/* Phone: an outlined pair of buttons instead of the list (the
              overview/dashboard pair above moves to the bottom bar). */}
          <div className={styles.globalGroup} data-nav-outline>
            <NavGroupGlobal />
          </div>
          <NavGroupFavorites />
          <NavGroupProjects />
          <NavGroupViews />
        </>
      )}
      {isAdminRoute && <NavGroupAdmin />}
    </div>
  );
}

export default NavGroup;
