import { Toast } from "@/components/ui/atoms/Toast/Toast";
import { Sidebar } from "@/components/ui/layout/Sidebar/Sidebar";
import { ShortcutsHelpTrigger } from "@/features/account/components/AccountShortcuts/ShortcutsHelpTrigger";
import { CommandPaletteTrigger } from "@/features/issues/components/CommandPalette/CommandPaletteTrigger";
import { GoToShortcuts } from "@/features/workspaces/components/GoToShortcuts/GoToShortcuts";
import { DockOutlet, ModalOutlet } from "@/lib/context";
import { TabBar } from "../TabBar/TabBar";
import styles from "./appShell.module.scss";

interface AppShellProps {
  children: React.ReactNode;
  isAdminRoute?: boolean;
}

function Shell({ children, isAdminRoute }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <Sidebar isAdminRoute={isAdminRoute} />
      <div className={styles.main}>
        <TabBar isAdminRoute={isAdminRoute} />
        <div className={styles.content}>{children}</div>
      </div>
      {/* Space for a docked panel (the issue detail view). As a sibling of
          the content, not on top of it: when a panel is present, the area
          to its left shrinks accordingly. */}
      <DockOutlet />
      {/* Renders the modal stack. Workspace data passes the openers in as
          props — modals only need the providers from the root layout
          (Intl, Modal) here. */}
      <ModalOutlet />
      {/* Global "?" → shortcuts help. Renders nothing itself. */}
      <ShortcutsHelpTrigger />
      {/* Global "g" + letter → jump to a main view. Renders nothing itself. */}
      <GoToShortcuts isAdminRoute={isAdminRoute} />
      {/* Global "mod+k" → search/jump palette (issues, projects, nav). */}
      <CommandPaletteTrigger isAdminRoute={isAdminRoute} />
      <Toast />
    </div>
  );
}

export function AppShell({ children, isAdminRoute = false }: AppShellProps) {
  return <Shell isAdminRoute={isAdminRoute}>{children}</Shell>;
}
