import { cookies } from "next/headers";
import { Logo } from "@/components/ui/atoms/Logo/Logo";
import { Toast } from "@/components/ui/atoms/Toast/Toast";
import { Sidebar } from "@/components/ui/layout/Sidebar/Sidebar";
import { ShortcutsHelpTrigger } from "@/features/account/components/AccountShortcuts/ShortcutsHelpTrigger";
import { CommandPaletteTrigger } from "@/features/issues/components/CommandPalette/CommandPaletteTrigger";
import { NewIssueFab } from "@/features/issues/components/NewIssueButton/NewIssueFab";
import { GoToShortcuts } from "@/features/workspaces/components/GoToShortcuts/GoToShortcuts";
import { DockOutlet, ModalOutlet } from "@/lib/context";
import { TabBar } from "../TabBar/TabBar";
import styles from "./appShell.module.scss";
import { NavToggle } from "./NavToggle";
import {
  NAV_COLLAPSED_COOKIE,
  NAV_WIDTH_COOKIE,
  parseNavWidth,
} from "./navState";
import { ShellFrame } from "./ShellFrame";

interface AppShellProps {
  children: React.ReactNode;
  isAdminRoute?: boolean;
}

export async function AppShell({
  children,
  isAdminRoute = false,
}: AppShellProps) {
  // Read here so a collapsed sidebar is already collapsed in the first
  // byte of HTML — no flash of the sidebar sliding away after hydration.
  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get(NAV_COLLAPSED_COOKIE)?.value === "1";
  const initialWidthRem = parseNavWidth(
    cookieStore.get(NAV_WIDTH_COOKIE)?.value,
  );

  return (
    <ShellFrame
      initialCollapsed={initialCollapsed}
      initialWidthRem={initialWidthRem}
      sidebar={<Sidebar isAdminRoute={isAdminRoute} />}
      main={
        <>
          {/* Phone only (≤ 640px): menu button and logo. On a tablet the menu
              button is in the tab bar; hidden by CSS above the phone. */}
          <div className={styles.topBar}>
            <NavToggle />
            {/* Mono lockup, swapped by `data-theme` — same pattern as the
                tab bar's brand mark (CSS, not JS). */}
            <div className={styles.brand}>
              <Logo
                variant="horizontal"
                color="white"
                height={28}
                className={styles.brandDark}
              />
              <Logo
                variant="horizontal"
                color="black"
                height={28}
                className={styles.brandLight}
              />
            </div>
          </div>
          {/* `display: contents` on desktop, hidden on phones (the drawer
              and the page's own navigation replace it). */}
          <div className={styles.tabs}>
            <TabBar isAdminRoute={isAdminRoute} />
          </div>
          <div className={styles.content}>{children}</div>
        </>
      }
    >
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
      {/* Phone only (CSS): the floating "new issue" plus. */}
      {!isAdminRoute && <NewIssueFab />}
      <Toast />
    </ShellFrame>
  );
}
