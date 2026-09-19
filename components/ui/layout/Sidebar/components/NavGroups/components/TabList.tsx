"use client";

import { Icon } from "@iconify/react";
import { useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import {
  NavLink,
  type NavLinkProps,
} from "@/components/ui/layout/NavLink/NavLink";
import { usePathname } from "@/i18n/navigation";
import { isNavActive } from "@/lib/nav";
import styles from "./tabList.module.scss";

export interface TabGroup extends NavLinkProps {
  group?: TabGroup[];
}

interface TabListProps {
  tabs: TabGroup[];
}

function containsActive(tabs: TabGroup[], pathname: string): boolean {
  return tabs.some((tab) => {
    if (isNavActive(pathname, tab.href, tab.activeHref)) return true;
    return tab.group ? containsActive(tab.group, pathname) : false;
  });
}

function TabItem({ item }: { item: TabGroup }) {
  const pathname = usePathname();
  const hasGroup = Boolean(item.group && item.group.length > 0);
  const [expanded, setExpanded] = useState(() =>
    hasGroup ? containsActive(item.group ?? [], pathname) : false,
  );

  return (
    <div className={styles.item}>
      <div className={styles.row}>
        <NavLink
          href={item.href}
          icon={item.icon}
          label={item.label}
          activeHref={item.activeHref}
          badge={item.badge}
          onClick={item.onClick}
          color={item.color}
          image={item.image}
          shape={item.shape}
          hideOnPhone={item.hideOnPhone}
        />
        {hasGroup && (
          <span className={styles.toggle}>
            <Button
              type="button"
              icon={
                <Icon
                  icon="lucide:chevron-right"
                  width={15}
                  className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
                />
              }
              variant="text"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse" : "Expand"}
            />
          </span>
        )}
      </div>
      {hasGroup && expanded && (
        <div className={styles.nested}>
          <TabList tabs={item.group ?? []} />
        </div>
      )}
    </div>
  );
}

function TabList({ tabs }: TabListProps) {
  return (
    <div className={styles.tabList}>
      {tabs.map((item) => (
        <TabItem key={item.href} item={item} />
      ))}
    </div>
  );
}

export default TabList;
