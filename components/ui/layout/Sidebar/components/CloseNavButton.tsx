"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { useNav } from "@/components/ui/layout/AppShell/ShellFrame";
import styles from "../sidebar.module.scss";

/**
 * Inside the sidebar: closes the menu (≤ 1024px) or collapses the sidebar to
 * its icon rail (desktop). Hidden in the rail itself — getting the sidebar
 * back is the menu button in the tab bar (`NavToggle`), so this one is only
 * ever shown while the sidebar is expanded and `aria-expanded` is always
 * true.
 */
export function CloseNavButton() {
  const t = useTranslations("nav");
  const { closeNav } = useNav();

  return (
    <Button
      variant="ghost"
      size="md"
      className={styles.collapseBtn}
      aria-label={t("closeMenu")}
      aria-controls="app-sidebar"
      aria-expanded="true"
      onClick={closeNav}
      icon={
        <>
          <Icon
            icon="lucide:panel-left-close"
            width={18}
            className={styles.iconDesktop}
          />
          <Icon icon="lucide:x" width={22} className={styles.iconPhone} />
        </>
      }
    />
  );
}
