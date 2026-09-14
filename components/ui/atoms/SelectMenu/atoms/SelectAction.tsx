"use client";

import styles from "../SelectMenu.module.scss";

interface SelectActionProps {
  icon?: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}

/**
 * A row that performs an action rather than selecting a value — used for things
 * like "create this label" that sit alongside the regular items.
 */
export function SelectAction({ icon, onClick, children }: SelectActionProps) {
  return (
    <button
      type="button"
      className={styles.menuItem}
      onClick={onClick}
      // Lets `SelectMenu`'s own Up/Down roving (which queries this
      // attribute, see `SelectMenu.tsx`) find this row the same as a real
      // `SelectItem` — without it, an action row is reachable by mouse but
      // invisible to the keyboard.
      data-select-item
    >
      {icon}
      <span className={styles.label}>{children}</span>
    </button>
  );
}

/** Non-interactive row for "nothing here" states. */
export function SelectEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${styles.menuItem} ${styles.cursorNormal} faint`}>
      {children}
    </div>
  );
}
