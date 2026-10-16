"use client";

import { Icon } from "@iconify/react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import {
  NavLink,
  type NavLinkProps,
} from "@/components/ui/layout/NavLink/NavLink";
import { setProjectFavorite, setViewUserState } from "@/features/views/actions";
import { usePathname, useRouter } from "@/i18n/navigation";
import { isNavActive } from "@/lib/nav";
import styles from "./tabList.module.scss";

export interface TabGroup extends NavLinkProps {
  group?: TabGroup[];
  /** A small heading inside a group instead of a link (`href` is just its
   *  key). */
  heading?: boolean;
  /** A button shown on hover — what it does is named, not passed, since
   *  the list comes from the server. */
  action?: { kind: NavAction; id: string; label: string };
}

/** What a row's hover button can do (V7). */
export type NavAction =
  | "unpinView"
  | "unfavoriteView"
  | "favoriteProject"
  | "unfavoriteProject";

/** Runs a row's hover action, then refreshes the server-drawn sidebar. */
export function useNavAction() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (action: { kind: NavAction; id: string }) =>
    startTransition(async () => {
      const result =
        action.kind === "unpinView"
          ? await setViewUserState(action.id, { pinned: false })
          : action.kind === "unfavoriteView"
            ? await setViewUserState(action.id, { favorite: false })
            : await setProjectFavorite(
                action.id,
                action.kind === "favoriteProject",
              );
      if (result.ok) router.refresh();
    });
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
  const runAction = useNavAction();
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
        {item.action && (
          <span
            className={styles.action}
            data-beside-toggle={hasGroup || undefined}
          >
            <Button
              type="button"
              variant="text"
              icon={<Icon icon={ACTION_ICON[item.action.kind]} width={14} />}
              aria-label={item.action.label}
              title={item.action.label}
              onClick={() => item.action && runAction(item.action)}
            />
          </span>
        )}
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

const ACTION_ICON: Record<NavAction, string> = {
  unpinView: "lucide:pin-off",
  unfavoriteView: "lucide:star-off",
  favoriteProject: "lucide:star",
  unfavoriteProject: "lucide:star-off",
};

function TabList({ tabs }: TabListProps) {
  return (
    <div className={styles.tabList}>
      {tabs.map((item) =>
        item.heading ? (
          <span key={item.href} className={styles.heading}>
            {item.label}
          </span>
        ) : (
          <TabItem key={item.href} item={item} />
        ),
      )}
    </div>
  );
}

export default TabList;
