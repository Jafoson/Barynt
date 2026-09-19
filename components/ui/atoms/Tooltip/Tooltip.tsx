"use client";

import {
  type CSSProperties,
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
  /**
   * Show the tooltip only while the sidebar is an icon rail — for a
   * trigger that carries its own visible label when the sidebar is open.
   */
  railOnly?: boolean;
}

/** Same value as `bp.$tablet` in `styles/breakpoints.scss`. */
const DESKTOP_QUERY = "(min-width: 1025px)";
const RAIL_GAP_PX = 10;

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
 *
 * One exception: inside the sidebar's icon rail (`data-nav-collapsed`, see
 * `ShellFrame`) the bubble goes to the *right* of the trigger, and there it
 * is `position: fixed` at measured coordinates — the sidebar scrolls and
 * clips, so an absolutely positioned bubble beside a 44px icon would be cut
 * off at the rail's edge.
 */
export function Tooltip({
  label,
  shortcut,
  children,
  className,
  railOnly = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [railPos, setRailPos] = useState<CSSProperties | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Cleared on unmount too — hovering, then navigating away before the
  // delay elapses, must not set state on an unmounted component.
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const scheduleShow = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const wrap = wrapRef.current;
      const inRail =
        !!wrap?.closest("[data-nav-collapsed]") &&
        window.matchMedia(DESKTOP_QUERY).matches;
      if (railOnly && !inRail) return;
      if (wrap && inRail) {
        const r = wrap.getBoundingClientRect();
        setRailPos({
          position: "fixed",
          left: r.right + RAIL_GAP_PX,
          top: r.top + r.height / 2,
        });
      } else {
        setRailPos(null);
      }
      setVisible(true);
    }, SHOW_DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  const trigger = cloneElement(
    children as React.ReactElement<{ "aria-describedby"?: string }>,
    { "aria-describedby": visible ? id : undefined },
  );

  const bubble = (
    <span
      id={id}
      role="tooltip"
      className={[styles.bubble, railPos && styles.bubbleRight]
        .filter(Boolean)
        .join(" ")}
      style={railPos ?? undefined}
    >
      {label}
      {shortcut && <Shortcut keys={shortcut} />}
    </span>
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: purely a hover/focus watcher around the real trigger, which keeps its own semantics
    <span
      ref={wrapRef}
      className={[styles.wrap, className].filter(Boolean).join(" ")}
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
      onFocus={scheduleShow}
      onBlur={hide}
    >
      {trigger}
      {visible &&
        (railPos
          ? // Portal to <body>: the sidebar is its own stacking context and
            // clips its overflow, so nothing rendered inside it can reliably
            // reach beyond the rail's edge.
            createPortal(bubble, document.body)
          : bubble)}
    </span>
  );
}
