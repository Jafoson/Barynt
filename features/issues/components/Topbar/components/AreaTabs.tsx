"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Tab, Tabs } from "@/components/ui/layout/Tabs/Tabs";
import styles from "../topbar.module.scss";

export type AreaTab = "board" | "list" | "dashboard";

interface AreaTabsProps {
  workspaceId: string;
  /** `null`: the workspace's own board, list and dashboard (V8). */
  projectSlug: string | null;
  /** The open one — `null` while a saved view is open. */
  active: AreaTab | null;
  /** Issues on screen, shown on the active tab (not on the dashboard). */
  count: number;
  /** Query to carry between board and list (filters, order) — empty when
   *  leaving a saved view or the dashboard. */
  carry: string;
}

/**
 * A project's — or across projects the workspace's (V8) — built-in layouts
 * as the first tabs of the topbar (BARY-177):
 * Board · List · Dashboard. They replace the page title and the board/list
 * switch; the active one carries the issue count.
 */
export function AreaTabs({
  workspaceId,
  projectSlug,
  active,
  count,
  carry,
}: AreaTabsProps) {
  const t = useTranslations();
  const base = projectSlug
    ? `/${workspaceId}/project/${projectSlug}`
    : `/${workspaceId}/issues`;
  const dashboard = projectSlug
    ? `${base}/overview`
    : `/${workspaceId}/dashboard`;
  const query = carry ? `?${carry}` : "";

  const tabs: { key: AreaTab; href: string; icon: string; label: string }[] = [
    {
      key: "board",
      href: `${base}${query}`,
      icon: "lucide:layout-dashboard",
      label: t("nav.board"),
    },
    {
      key: "list",
      href: `${base}/list${query}`,
      icon: "lucide:list",
      label: t("views.layoutList"),
    },
    {
      key: "dashboard",
      href: dashboard,
      icon: "lucide:gauge",
      label: t("nav.dashboard"),
    },
  ];

  return (
    <Tabs indicator="top" label={t("views.layoutsLabel")}>
      {tabs.map((tab) => (
        <Tab
          key={tab.key}
          href={tab.href}
          active={tab.key === active}
          // A phone only has the list — the board falls back to it anyway.
          className={tab.key === "board" ? styles.notOnPhone : undefined}
          icon={<Icon icon={tab.icon} width={15} />}
        >
          {tab.label}
          {tab.key === active && tab.key !== "dashboard" && (
            <Badge className={styles.count}>{count}</Badge>
          )}
        </Tab>
      ))}
    </Tabs>
  );
}
