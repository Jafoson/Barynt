"use client";

import styles from "./nativeSelect.module.scss";

interface NativeSelectProps {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /** What the control is for — it has no visible label of its own. */
  label: string;
  disabled?: boolean;
  className?: string;
}

/**
 * The browser's own dropdown, dressed like the other controls.
 *
 * For lists too long for a `SegmentedControl` and with nothing to search
 * through that a type-ahead on the native element doesn't already do (time
 * zones). Keyboard, touch pickers and screen readers all come with it.
 */
export function NativeSelect({
  items,
  value,
  onChange,
  label,
  disabled,
  className,
}: NativeSelectProps) {
  return (
    <select
      className={[styles.select, className].filter(Boolean).join(" ")}
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}
