"use client";

import { Icon } from "@iconify/react";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import {
  type ISelectItem,
  SelectMenu,
} from "@/components/ui/atoms/SelectMenu/SelectMenu";
import styles from "./splitButton.module.scss";

interface SplitButtonProps {
  /** The main action — what a plain click does. */
  label: string;
  onClick: () => void;
  /** The other ways to do it, behind the arrow. */
  items: ISelectItem[];
  onPick: (value: string | number | null) => void;
  /** Accessible name of the arrow, e.g. "More ways to save". */
  menuLabel: string;
  disabled?: boolean;
  variant?: "primary" | "elevated";
}

/**
 * A button with a second half that opens its alternatives — "Save", and
 * behind the arrow "Save for everyone", "Save as new view". Same height and
 * radius as `Button`; the two halves read as one control.
 */
export function SplitButton({
  label,
  onClick,
  items,
  onPick,
  menuLabel,
  disabled = false,
  variant = "primary",
}: SplitButtonProps) {
  return (
    <span className={styles.split} data-variant={variant}>
      <button
        type="button"
        className={styles.main}
        onClick={onClick}
        disabled={disabled}
      >
        {label}
      </button>
      <InlinePicker
        width={240}
        align="end"
        title={menuLabel}
        trigger={
          <button
            type="button"
            className={styles.more}
            aria-label={menuLabel}
            title={menuLabel}
            disabled={disabled}
          >
            <Icon icon="lucide:chevron-down" width={16} />
          </button>
        }
      >
        {(close) => (
          <SelectMenu
            items={items}
            value={null}
            onPick={(value) => {
              close();
              onPick(value);
            }}
            onClose={close}
          />
        )}
      </InlinePicker>
    </span>
  );
}
