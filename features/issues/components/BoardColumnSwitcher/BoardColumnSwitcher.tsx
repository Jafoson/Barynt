"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { GroupIcon } from "@/features/issues/components/GroupIcon/GroupIcon";
import type { GroupDef } from "@/features/issues/group";
import styles from "./boardColumnSwitcher.module.scss";

interface BoardColumnSwitcherProps {
  columns: { group: GroupDef; count: number }[];
  /** The column at the left edge of the board right now. */
  activeId: string | null;
  onSelect: (groupId: string) => void;
  /** For screen readers — what this strip is. */
  label: string;
}

/**
 * The board's column switcher for narrow screens: one tab per column, with
 * its icon, name and count, above the board. The active one follows the
 * board's own scrolling — swiping is a way to change columns, this strip is
 * the one that's always visible. Works for every grouping, since it only
 * knows `GroupDef`s.
 *
 * Whether it's shown at all is decided by `Board` (nothing to switch between
 * when every column fits) and by CSS (never on a desktop).
 */
export function BoardColumnSwitcher({
  columns,
  activeId,
  onSelect,
  label,
}: BoardColumnSwitcherProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Keeps the active tab in view: the strip scrolls on its own when there
  // are more columns than fit next to each other. Scrolls the strip only —
  // `scrollIntoView` would drag the page along with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the active column changes
  useEffect(() => {
    const strip = stripRef.current;
    const tab = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!strip || !tab) return;
    const target = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [activeId]);

  return (
    <div
      ref={stripRef}
      className={styles.strip}
      role="tablist"
      aria-label={label}
    >
      {columns.map(({ group, count }) => (
        <button
          key={group.id}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={group.id === activeId}
          onClick={() => onSelect(group.id)}
        >
          <GroupIcon group={group} size={15} />
          <span className={styles.name}>{group.label}</span>
          <Badge mono size="sm">
            {count}
          </Badge>
        </button>
      ))}
    </div>
  );
}
