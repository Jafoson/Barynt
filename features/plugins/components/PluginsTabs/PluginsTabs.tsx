"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { adminPath } from "@/lib/nav";
import styles from "./pluginsTabs.module.scss";

interface Props {
  active: "installed" | "store";
}

/**
 * The two pages of the platform's plugins: what is installed, and the store to find and
 * add more. Links, not state, so each page has its own address and works without a script.
 */
export function PluginsTabs({ active }: Props) {
  const t = useTranslations();
  return (
    <nav className={styles.tabs} aria-label={t("pluginsAdmin.title")}>
      <Link
        className={styles.tab}
        href={adminPath("plugins")}
        aria-current={active === "installed" ? "page" : undefined}
      >
        {t("pluginStore.tabInstalled")}
      </Link>
      <Link
        className={styles.tab}
        href={`${adminPath("plugins")}/store`}
        aria-current={active === "store" ? "page" : undefined}
      >
        {t("pluginStore.tabStore")}
      </Link>
    </nav>
  );
}
