"use client";

import { useRef } from "react";
import styles from "./segmentedControl.module.scss";

interface SegmentedItem {
  value: string;
  label?: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps {
  items: SegmentedItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: "primary" | "surface";
  /**
   * Marks the active segment `data-field-nav`, for a caller with its own
   * Up/Down field-roving (e.g. the create-project window). Opt-in and off
   * by default — every other place this renders has no such roving to
   * plug into.
   */
  fieldNav?: boolean;
  /**
   * Fires on Enter/Space on a segment, in addition to the `onChange` that
   * click and Left/Right already trigger — for a caller that wants to
   * treat an explicit keyboard confirm as "done here, move on" (e.g. the
   * create-project window advancing to its next field).
   */
  onConfirm?: () => void;
}

/**
 * A radio group, not a row of independent toggle buttons: exactly one
 * segment is ever "on". Roving tabindex — only the active segment sits in
 * the tab order — so Tab enters and leaves the whole control as a single
 * stop, the same as any native radio group; Left/Right move *and* select
 * within it, wrapping at the ends.
 */
export function SegmentedControl({
  items,
  value,
  onChange,
  variant = "primary",
  fieldNav,
  onConfirm,
}: SegmentedControlProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hasActive = items.some((item) => item.value === value);

  return (
    <div className={styles.root} role="radiogroup">
      {items.map((item, index) => {
        const isActive = value === item.value;
        const iconOnly = !!item.icon && !item.label;
        const tabbable = isActive || (!hasActive && index === 0);
        return (
          // biome-ignore lint/a11y/useSemanticElements: a labeled/iconed segment, not a native radio's appearance — restyling around a real <input type="radio"> would lose the icon-only variant's layout for free
          <button
            key={item.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={tabbable ? 0 : -1}
            className={[
              styles.item,
              iconOnly && styles.iconOnly,
              isActive && styles.active,
              isActive && variant === "surface" && styles.activeSurface,
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const dir = e.key === "ArrowRight" ? 1 : -1;
                const next = (index + dir + items.length) % items.length;
                onChange(items[next].value);
                buttonRefs.current[next]?.focus();
              } else if (e.key === "Enter" || e.key === " ") {
                onConfirm?.();
              }
            }}
            title={item.label}
            data-field-nav={(fieldNav && isActive) || undefined}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
