"use client";

import { cloneElement, useEffect, useId, useRef, useState } from "react";
import { Shortcut } from "@/components/ui/atoms/Shortcut/Shortcut";
import styles from "./tooltip.module.scss";

/** Native tooltips wait about this long too — long enough that passing
 *  over the trigger on the way somewhere else doesn't flash it. */
const SHOW_DELAY_MS = 500;

interface TooltipProps {
  /** What the trigger does — shown first, always. */
  label: string;
  /** Its keyboard shortcut, if it has one — shown after the label. */
  shortcut?: string | string[];
  /** The trigger itself — cloned to receive `aria-describedby`. */
  children: React.ReactElement;
  /**
   * On the wrapper, not the trigger — the wrapper defaults to
   * `inline-block`, which shrinks a `full`-width trigger back down to its
   * content. Pass e.g. `display: block; width: 100%` for one of those.
   */
  className?: string;
}

/**
 * Hover/focus tooltip: `label` describes the action, `shortcut` (if given)
 * renders as the same `<kbd>` badge `Shortcut` draws everywhere else — just
 * moved here instead of sitting permanently on the trigger.
 *
 * CSS-only positioning (no portal, no measurement): the trigger stays in
 * flow, the bubble is `position: absolute` against a `position: relative`
 * wrapper. Good enough for a short hint that never needs to escape a
 * scrolling ancestor or dodge the viewport edge — unlike `Popover`, which
 * exists for exactly that heavier job.
 */
export function Tooltip({
  label,
  shortcut,
  children,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Cleared on unmount too — hovering, then navigating away before the
  // delay elapses, must not set state on an unmounted component.
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const scheduleShow = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  const trigger = cloneElement(
    children as React.ReactElement<{ "aria-describedby"?: string }>,
    { "aria-describedby": visible ? id : undefined },
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: purely a hover/focus watcher around the real trigger, which keeps its own semantics
    <span
      className={[styles.wrap, className].filter(Boolean).join(" ")}
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
      onFocus={scheduleShow}
      onBlur={hide}
    >
      {trigger}
      {visible && (
        <span id={id} role="tooltip" className={styles.bubble}>
          {label}
          {shortcut && <Shortcut keys={shortcut} />}
        </span>
      )}
    </span>
  );
}
