"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Popover } from "@/components/ui/atoms/Popover/Popover";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import {
  FIXED_LIST_COLUMNS,
  LIST_COLUMNS,
  type ListColumn,
} from "@/features/issues/list-columns";
import styles from "../listView.module.scss";

/**
 * The "+" at the end of the list's header row (BARY-175): every column to
 * switch on or off. One switched on joins at the end; where it goes from
 * there is a drag of its header.
 */
export function ColumnPicker({
  shown,
  available,
  onChange,
}: {
  shown: ListColumn[];
  /** Whether a column exists here at all — a project column only across
   *  projects, none for a field the project turned off. */
  available: (column: ListColumn) => boolean;
  onChange: (next: ListColumn[]) => void;
}) {
  const t = useTranslations("issues.table");
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const offered = LIST_COLUMNS.filter(
    (c) => !FIXED_LIST_COLUMNS.includes(c) && available(c),
  );

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={styles.columnMenu}
        data-always
        aria-label={t("columnsTitle")}
        title={t("columnsTitle")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon="lucide:plus" width={14} />
      </button>
      <Popover
        anchorRef={anchor}
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        width={240}
        title={t("columnsTitle")}
      >
        <div className={styles.menu}>
          <span className={styles.menuHead}>{t("columnsTitle")}</span>
          {offered.map((column) => {
            const on = shown.includes(column);
            return (
              <div key={column} className={styles.pickRow}>
                <span>{t(`col_${column}`)}</span>
                <Switch
                  checked={on}
                  onChange={() =>
                    onChange(
                      on
                        ? shown.filter((c) => c !== column)
                        : [...shown, column],
                    )
                  }
                  label={t(`col_${column}`)}
                  labelHidden
                />
              </div>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
