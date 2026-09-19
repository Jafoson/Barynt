"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import styles from "./appShell.module.scss";
import { useNav } from "./ShellFrame";

/**
 * Brings the sidebar back — one button, three places (CSS decides which
 * shows):
 * - phone: in the top bar (`AppShell`), hamburger
 * - tablet: at the start of the tab bar (`TabBarClient`), hamburger
 * - desktop: at the start of the tab bar, but only while the sidebar is
 *   collapsed to its icon rail — the counterpart of the collapse button in
 *   the sidebar (`CloseNavButton`), with the matching "panel" icon
 */
export function NavToggle({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const { open, toggleNav } = useNav();

  return (
    <Button
      variant="ghost"
      size="md"
      className={className}
      data-nav-toggle
      aria-label={t("openMenu")}
      aria-controls="app-sidebar"
      aria-expanded={open}
      onClick={toggleNav}
      icon={
        <>
          <Icon icon="lucide:menu" width={18} className={styles.navIconMenu} />
          <Icon
            icon="lucide:panel-left-open"
            width={18}
            className={styles.navIconPanel}
          />
        </>
      }
    />
  );
}
