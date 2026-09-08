"use client";

import type { ISelectItem } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import styles from "../SelectMenu.module.scss";

interface SelectItemProps {
  it: ISelectItem;
  isSel: (v: string | number | null) => boolean;
  onPick: (value: string | number | null) => void;
  onClose?: () => void;
  multi?: boolean;
}

function SelectItem({ it, isSel, onPick, onClose, multi }: SelectItemProps) {
  return (
    <button
      type="button"
      key={String(it.value)}
      className={`${styles.menuItem} ${isSel(it.value) ? styles.active : ""}`}
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
    </button>
  );
}

export default SelectItem;
