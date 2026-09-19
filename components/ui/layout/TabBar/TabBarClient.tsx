"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import type { Project } from "@/types";
import { Button } from "../../atoms/Button/Button";
import { Logo } from "../../atoms/Logo/Logo";
import { NavToggle } from "../AppShell/NavToggle";
import { Tab } from "./Tab";
import styles from "./tabBar.module.scss";
import { useTabBar } from "./useTabBar";

interface TabBarClientProps {
  // Href of the first tab / newly opened tabs — depends on the current area
  // (e.g. `/<workspaceId>/my` or `/admin`).
  defaultHref: string;
  // Projects of the current workspace, preloaded server-side.
  projects: Project[];
  // ID of the currently active workspace, or `null` in the admin area.
  currentWorkspaceId: string | null;
}

// Pure rendering: the entire tab state (persistence, navigation,
// title/color/icon per tab) lives in useTabBar — analogous to how the
// sidebar lets its NavGroups render finished tab lists instead of holding
// logic itself.
export function TabBarClient({
  defaultHref,
  projects,
  currentWorkspaceId,
}: TabBarClientProps) {
  const t = useTranslations();
  const { tabs, activeId, ready, switchTab, openTab, closeTab } = useTabBar({
    defaultHref,
    projects,
    currentWorkspaceId,
  });

  if (!ready) {
    return (
      <div className={styles.bar}>
        <NavToggle className={styles.menuToggle} />
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      {/* Tablet only (CSS): the way to the sidebar menu. */}
      <NavToggle className={styles.menuToggle} />

      {/* Own scroll container: with many tabs, the strip scrolls instead
          of squeezing every tab down to illegibility — the plus button
          stays visible throughout. */}
      <div className={styles.strip} role="tablist">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            meta={tab.meta}
            isActive={tab.id === activeId}
            onSelect={() => switchTab(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
      </div>

      <Button
        variant="text"
        size="sm"
        className={styles.add}
        aria-label={t("actions.newTab")}
        icon={<Icon icon="lucide:plus" width={14} />}
        onClick={() => openTab()}
      />

      {/* Brand mark, pinned to the far end of the row. Two mono lockups
          swapped by `data-theme` on `<html>` (see styles/colors.scss for the
          same three-state selector) — CSS, not JS, per the appearance rule. */}
      <div className={styles.brand}>
        <Logo
          variant="horizontal"
          color="white"
          height={22}
          className={styles.brandDark}
        />
        <Logo
          variant="horizontal"
          color="black"
          height={22}
          className={styles.brandLight}
        />
      </div>
    </div>
  );
}
