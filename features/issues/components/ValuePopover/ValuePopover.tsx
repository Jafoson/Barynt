"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import styles from "./valuePopover.module.scss";

interface ValuePopoverProps<T> {
  initialValue: T;
  /** Whether a "clear" link is offered alongside "Save" — only when the
   *  field currently holds a value there'd be anything to clear. */
  clearable: boolean;
  onConfirm: (value: T) => void;
  onClear: () => void;
  /**
   * Why the pending value cannot be saved, or `null` when it can: shown under the field, and Save
   * stays off meanwhile. Without it every value can be confirmed.
   */
  problem?: (value: T) => string | null;
  /** From `InlinePicker`'s render prop — closes the popover after either
   *  button. */
  close: () => void;
  /** The field's own input, free to shape `value` however it needs
   *  (a date string, a number) — `ValuePopover` only owns the pending
   *  state and the Save/Clear buttons around it. */
  children: (value: T, setValue: (value: T) => void) => React.ReactNode;
}

/**
 * A popover body for editing one field that shouldn't write on every
 * keystroke (a free-form number or date) — unlike a `SelectMenu` pick,
 * which commits immediately because choosing *is* the confirmation. Holds
 * the edit locally until "Save" is pressed, so a still-typing value never
 * reaches the server, and pressing the button gives the same "it went
 * through" feedback a form submit does.
 */
export function ValuePopover<T>({
  initialValue,
  clearable,
  onConfirm,
  onClear,
  problem,
  close,
  children,
}: ValuePopoverProps<T>) {
  const t = useTranslations();
  const [value, setValue] = useState(initialValue);
  const why = problem?.(value) ?? null;

  return (
    <div className={styles.popover}>
      {children(value, setValue)}
      {why && (
        <p className={styles.problem} role="alert">
          {why}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={why !== null}
          onClick={() => {
            onConfirm(value);
            close();
          }}
        >
          {t("actions.save")}
        </Button>
        {clearable && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              onClear();
              close();
            }}
          >
            {t("actions.clear")}
          </button>
        )}
      </div>
    </div>
  );
}
