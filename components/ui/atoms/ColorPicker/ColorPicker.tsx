"use client";

import { useRef } from "react";
import { PALETTE } from "@/lib/utils";
import styles from "./colorPicker.module.scss";

interface ColorPickerProps {
  /** Currently selected color. Omitted when the selection directly triggers an action. */
  value?: string;
  onChange: (color: string) => void;
  /** Alternate palette. Default: the shared palette from `lib/utils/color`. */
  colors?: readonly string[];
  /** `sm` for popovers/menus, `md` (default) for forms and modals. */
  size?: "sm" | "md";
  /** Accessible label per swatch — pass it in localized. */
  swatchLabel?: (color: string) => string;
  /**
   * Marks the active swatch `data-field-nav`, for a caller with its own
   * Up/Down field-roving (e.g. the create-project window). Opt-in and off
   * by default: every other place this renders has no such roving to plug
   * into, and the attribute is meaningless without it.
   */
  fieldNav?: boolean;
  /**
   * Fires on Enter/Space on a swatch, in addition to the `onChange` that
   * click and Left/Right already trigger — for a caller that wants to
   * treat an explicit keyboard confirm as "done here, move on" (e.g. the
   * create-project window advancing to its next field).
   */
  onConfirm?: () => void;
}

/**
 * Color grid for picking an accent color (workspace, project, label, ...).
 *
 * A radio group, not a row of independent toggle buttons: exactly one
 * swatch is ever "on". Roving tabindex — only the active swatch (or the
 * first one, before anything is picked) sits in the tab order — so Tab
 * enters and leaves the whole grid as a single stop, the same as any
 * native radio group; Left/Right move *and* select within it, wrapping at
 * the ends.
 */
export function ColorPicker({
  value,
  onChange,
  colors = PALETTE,
  size = "md",
  swatchLabel,
  fieldNav,
  onConfirm,
}: ColorPickerProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hasActive = value !== undefined && colors.includes(value);

  return (
    <div className={`${styles.swatches} ${styles[size]}`} role="radiogroup">
      {colors.map((color, index) => {
        const active = color === value;
        const tabbable = active || (!hasActive && index === 0);
        return (
          // biome-ignore lint/a11y/useSemanticElements: a colored swatch, not a native radio's appearance — the accent color is `style.background`, which a real `<input type="radio">` has no styling hook for
          <button
            key={color}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={tabbable ? 0 : -1}
            className={[styles.swatch, active && styles.active]
              .filter(Boolean)
              .join(" ")}
            style={{ background: color }}
            aria-label={swatchLabel?.(color) ?? color}
            onClick={() => onChange(color)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const dir = e.key === "ArrowRight" ? 1 : -1;
                const next = (index + dir + colors.length) % colors.length;
                onChange(colors[next]);
                buttonRefs.current[next]?.focus();
              } else if (e.key === "Enter" || e.key === " ") {
                onConfirm?.();
              }
            }}
            data-field-nav={(fieldNav && active) || undefined}
          />
        );
      })}
    </div>
  );
}
