"use client";

import { useRef, useState } from "react";
import styles from "./resizer.module.scss";

interface ResizerProps {
  /** Current width in px of the element the handle measures. */
  width: number;
  onChange: (width: number) => void;
  min: number;
  max: number;
  /** Reset to this value on double-click. Nothing happens without one. */
  reset?: number;
  /** Step size for the arrow keys. Default: 16. */
  step?: number;
  /** For screen readers — what gets wider and narrower here. */
  label: string;
  /** Positioning; the handle itself brings its own look. */
  className?: string;
  /**
   * Which edge of the measured element the handle sits on. `"left"` (the
   * default): dragging left makes it wider. `"right"`: dragging right does.
   */
  edge?: "left" | "right";
  /**
   * Collapsing: dragging narrower than `below` (px) reports `collapsed`
   * instead of a width; dragging wider again reports it un-collapsed. While
   * collapsed, `width` is the width of the collapsed state.
   */
  collapse?: {
    below: number;
    collapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
  };
}

/**
 * A handle for dragging a width.
 *
 * By default it sits **to the left** of what it measures — dragging left
 * makes things wider. That fits everything anchored to the right edge: the
 * side panel at the screen edge, the attribute column at the panel's edge.
 * For something anchored to the left (the sidebar), `edge="right"` flips
 * that, and `collapse` adds a threshold below which it collapses.
 *
 * It's operable without a mouse too: focusable, with a value range, arrow
 * keys step through it, Home and End jump to the limits — the WAI-ARIA
 * "Window Splitter" pattern.
 *
 * Where it sits is decided by the surrounding context via `className`. The
 * handle only brings hit area, line, and behavior, because those are the
 * same at every edge.
 */
export function Resizer({
  width,
  onChange,
  min,
  max,
  reset,
  step = 16,
  label,
  className,
  edge = "left",
  collapse,
}: ResizerProps) {
  const [isDragging, setIsDragging] = useState(false);
  /** Start point of the current drag — not state, it doesn't trigger a re-render. */
  const drag = useRef<{ x: number; width: number } | null>(null);

  const clamp = (value: number) => Math.min(max, Math.max(min, value));

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    // The pointer belongs to the handle from now on. Without this, movement
    // would break off as soon as it strays over the content next to it.
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
    setIsDragging(true);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const raw =
      edge === "right" ? drag.current.width + dx : drag.current.width - dx;
    if (collapse) {
      if (raw < collapse.below) {
        collapse.onCollapsedChange(true);
        return;
      }
      if (collapse.collapsed) collapse.onCollapsedChange(false);
    }
    onChange(clamp(raw));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setIsDragging(false);
  };

  const nudge = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Which arrow makes it wider depends on the edge.
    const wider = edge === "right" ? "ArrowRight" : "ArrowLeft";
    const narrower = edge === "right" ? "ArrowLeft" : "ArrowRight";
    if (event.key === wider) {
      if (collapse?.collapsed) {
        collapse.onCollapsedChange(false);
        onChange(min);
      } else onChange(clamp(width + step));
    } else if (event.key === narrower) {
      // At the minimum, one more step narrower collapses.
      if (collapse && !collapse.collapsed && width <= min) {
        collapse.onCollapsedChange(true);
      } else if (!collapse?.collapsed) onChange(clamp(width - step));
    } else if (event.key === "Home") onChange(min);
    else if (event.key === "End") onChange(max);
    else return;
    event.preventDefault();
  };

  return (
    // `data-resizing` is read by a global rule: while dragging, the document
    // doesn't select anything and keeps the handle's cursor.
    // biome-ignore lint/a11y/useSemanticElements: `<hr>`, as the rule suggests, is a thematic break in text — this is the operable divider of the WAI-ARIA "Window Splitter" pattern, focusable and with a value range.
    <div
      className={[styles.resizer, className].filter(Boolean).join(" ")}
      data-resizing={isDragging || undefined}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={Math.min(min, Math.round(width))}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={
        reset === undefined
          ? undefined
          : () => {
              if (collapse?.collapsed) collapse.onCollapsedChange(false);
              onChange(reset);
            }
      }
      onKeyDown={nudge}
    />
  );
}
