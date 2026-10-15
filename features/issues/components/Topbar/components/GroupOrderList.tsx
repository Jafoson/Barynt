"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { GroupIcon } from "@/features/issues/components/GroupIcon/GroupIcon";
import type { GroupDef } from "@/features/issues/group";
import { moveGroup } from "@/features/issues/group-order";
import styles from "./viewSettings.module.scss";

interface GroupOrderListProps {
  /** Every group of the grouping, in the current order — hidden ones too. */
  groups: GroupDef[];
  isHidden: (group: GroupDef) => boolean;
  onToggle: (group: GroupDef) => void;
  /** The whole list in its new order. */
  onReorder: (groups: GroupDef[]) => void;
  /** Shown while an own order is set. */
  onResetOrder?: () => void;
}

/**
 * The display panel's "Columns" (BARY-165): one row per group with a check
 * for shown/hidden and a handle to drag it elsewhere — the board's columns
 * and the list's groups follow this order. Alt+↑/↓ on a row moves it too.
 * Hidden groups stay in the list, greyed, so they can be placed and turned
 * back on.
 */
export function GroupOrderList({
  groups,
  isHidden,
  onToggle,
  onReorder,
  onResetOrder,
}: GroupOrderListProps) {
  const t = useTranslations();
  const listRef = useRef<HTMLUListElement>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [target, setTarget] = useState<{
    id: string;
    place: "before" | "after";
  } | null>(null);

  const move = (group: GroupDef, by: -1 | 1) => {
    const index = groups.indexOf(group);
    const neighbour = groups[index + by];
    if (!neighbour) return;
    onReorder(moveGroup(groups, group, neighbour, by < 0 ? "before" : "after"));
    // The row moved in the DOM — keep the keyboard on it.
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector<HTMLElement>(
          `[data-group-row="${CSS.escape(group.id)}"]`,
        )
        ?.focus(),
    );
  };

  const end = () => {
    setDragged(null);
    setTarget(null);
  };

  return (
    <>
      <ul ref={listRef} className={styles.orderList}>
        {groups.map((group) => {
          const hidden = isHidden(group);
          return (
            <li
              key={group.id}
              className={styles.orderRow}
              // Like the issue list: the whole row is draggable, the handle
              // shows on hover, the row stays put and fades while a line
              // marks where it lands.
              draggable
              data-hidden={hidden || undefined}
              data-dragging={dragged === group.id || undefined}
              data-drop={
                target?.id === group.id && dragged !== group.id
                  ? target.place === "before"
                    ? "above"
                    : "below"
                  : undefined
              }
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("application/x-barynt-group", group.id);
                setDragged(group.id);
              }}
              onDragEnd={end}
              onDragOver={(e) => {
                if (!dragged) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const place =
                  e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                setTarget((cur) =>
                  cur?.id === group.id && cur.place === place
                    ? cur
                    : { id: group.id, place },
                );
              }}
              onDrop={(e) => {
                e.preventDefault();
                const moved = groups.find((g) => g.id === dragged);
                const place = target?.place ?? "before";
                end();
                if (moved && moved !== group)
                  onReorder(moveGroup(groups, moved, group, place));
              }}
            >
              <span
                className={styles.orderHandle}
                title={t("display.moveGroup", { group: group.label })}
                aria-hidden="true"
              >
                <Icon icon="lucide:grip-vertical" width={14} />
              </span>
              <label
                className={styles.orderToggle}
                title={t("display.moveGroup", { group: group.label })}
              >
                <input
                  type="checkbox"
                  className={styles.orderInput}
                  checked={!hidden}
                  data-group-row={group.id}
                  onChange={() => onToggle(group)}
                  onKeyDown={(e) => {
                    if (!e.altKey) return;
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      move(group, -1);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      move(group, 1);
                    }
                  }}
                />
                <Icon
                  icon={hidden ? "lucide:square" : "lucide:square-check"}
                  width={16}
                  className={styles.orderCheck}
                  aria-hidden="true"
                />
                <GroupIcon group={group} size={15} />
                <span className={styles.orderLabel}>{group.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {onResetOrder && (
        <button
          type="button"
          className={styles.orderReset}
          onClick={onResetOrder}
        >
          <Icon icon="lucide:rotate-ccw" width={14} />
          {t("display.resetOrder")}
        </button>
      )}
    </>
  );
}
