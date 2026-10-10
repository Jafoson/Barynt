"use client";

import { Icon } from "@iconify/react";
import type { ISelectItem } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import styles from "../SelectMenu.module.scss";

interface SelectItemProps {
  it: ISelectItem;
  isSel: (v: string | number | null) => boolean;
  onPick: (value: string | number | null) => void;
  onClose?: () => void;
  multi?: boolean;
  checkMark?: boolean;
}

function SelectItem({
  it,
  isSel,
  onPick,
  onClose,
  multi,
  checkMark,
}: SelectItemProps) {
  return (
    <button
      type="button"
      key={String(it.value)}
      // With a check mark the selection is already marked at the end of the
      // row; the filled background would say it twice.
      className={`${styles.menuItem} ${
        isSel(it.value)
          ? checkMark
            ? styles.activeChecked
            : styles.active
          : ""
      }`}
      // Lets `SelectMenu`'s Up/Down/Tab roving find every item in one query.
      data-select-item
      onClick={() => {
        onPick(it.value);
        if (!multi) onClose?.();
      }}
    >
      {it.icon}
      <span className={styles.label}>{it.label}</span>
      {it.hint && <span className="faint">{it.hint}</span>}
      {checkMark && isSel(it.value) && (
        <Icon
          icon="lucide:check"
          width={15}
          className={styles.check}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export default SelectItem;
