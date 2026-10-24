"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Popover } from "@/components/ui/atoms/Popover/Popover";
import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
} from "@/features/issues/list-columns";
import styles from "../listView.module.scss";

interface ColumnToolsProps {
  /** The column's name, for the menu's and the handle's labels. */
  label: string;
  /** `null`: the column doesn't order. */
  sort: { active: boolean; reversed: boolean } | null;
  onSort: (state: "natural" | "reversed" | "off") => void;
  /** Identifier and title can't go. */
  onHide?: () => void;
  /** Without it the column takes what's left (the title). */
  resize?: {
    /** The width set by this person, px — none: as wide as its content. */
    width?: number;
    custom: boolean;
    onChange: (width: number) => void;
    onCommit: (width: number) => void;
    onReset: () => void;
  };
}

/**
 * The tools beside a list column's title (BARY-175): a menu (order, hide,
 * reset the width) and the edge to drag the width by. The sort button
 * itself is the table's own; these sit next to it, never inside.
 */
export function ColumnTools({
  label,
  sort,
  onSort,
  onHide,
  resize,
}: ColumnToolsProps) {
  const t = useTranslations("issues.table");
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const hasMenu = sort !== null || onHide || resize?.custom;

  const pick = (run: () => void) => () => {
    setOpen(false);
    run();
  };

  /** Pointer drag on the edge: the width follows, stored on release. */
  const startResize = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!resize) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const cell = handle.closest("th");
    if (!cell) return;
    const startX = e.clientX;
    const startWidth = cell.getBoundingClientRect().width;
    const widthAt = (x: number) =>
      Math.round(
        Math.min(
          MAX_COLUMN_WIDTH,
          Math.max(MIN_COLUMN_WIDTH, startWidth + x - startX),
        ),
      );
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => resize.onChange(widthAt(ev.clientX));
    const up = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      resize.onCommit(widthAt(ev.clientX));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  /** The keyboard's way to the same: ←/→ on the focused edge. */
  const keyResize = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (!resize || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const cell = e.currentTarget.closest("th");
    if (!cell) return;
    const now = cell.getBoundingClientRect().width;
    const next = Math.round(
      Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, now + (e.key === "ArrowLeft" ? -16 : 16)),
      ),
    );
    resize.onChange(next);
    resize.onCommit(next);
  };

  return (
    <>
      {hasMenu && (
        <>
          <button
            ref={anchor}
            type="button"
            className={styles.columnMenu}
            aria-label={t("columnMenu", { column: label })}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon icon="lucide:chevron-down" width={13} />
          </button>
          <Popover
            anchorRef={anchor}
            open={open}
            onClose={() => setOpen(false)}
            align="end"
            width={220}
            title={label}
          >
            <div className={styles.menu} role="menu">
              {sort && (
                <>
                  <MenuItem
                    icon="lucide:arrow-down-wide-narrow"
                    label={t("sortNatural")}
                    checked={sort.active && !sort.reversed}
                    onClick={pick(() => onSort("natural"))}
                  />
                  <MenuItem
                    icon="lucide:arrow-up-narrow-wide"
                    label={t("sortReversed")}
                    checked={sort.active && sort.reversed}
                    onClick={pick(() => onSort("reversed"))}
                  />
                  {sort.active && (
                    <MenuItem
                      icon="lucide:x"
                      label={t("sortOff")}
                      onClick={pick(() => onSort("off"))}
                    />
                  )}
                </>
              )}
              {sort && (onHide || resize?.custom) && (
                <span className={styles.menuDivider} />
              )}
              {onHide && (
                <MenuItem
                  icon="lucide:eye-off"
                  label={t("hideColumn")}
                  onClick={pick(onHide)}
                />
              )}
              {resize?.custom && (
                <MenuItem
                  icon="lucide:move-horizontal"
                  label={t("resetWidth")}
                  onClick={pick(resize.onReset)}
                />
              )}
            </div>
          </Popover>
        </>
      )}
      {resize && (
        // A separator a person drags — or moves with ←/→ once focused.
        // biome-ignore lint/a11y/useSemanticElements: an <hr> can't be dragged or focused like this
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={t("resize", { column: label })}
          aria-valuenow={resize.width ?? MIN_COLUMN_WIDTH}
          aria-valuemin={MIN_COLUMN_WIDTH}
          aria-valuemax={MAX_COLUMN_WIDTH}
          tabIndex={0}
          className={styles.resizeHandle}
          onPointerDown={startResize}
          onKeyDown={keyResize}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  checked,
  onClick,
}: {
  icon: string;
  label: string;
  checked?: boolean;
  onClick: () => void;
}) {
  const content = (
    <>
      <Icon icon={icon} width={15} />
      <span>{label}</span>
      {checked && (
        <Icon icon="lucide:check" width={14} className={styles.menuCheck} />
      )}
    </>
  );
  return checked === undefined ? (
    <button
      type="button"
      role="menuitem"
      className={styles.menuItem}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className={styles.menuItem}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
