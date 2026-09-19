"use client";

import { useEffect, useRef } from "react";

/**
 * A long press with a finger or pen — the touch counterpart of a right
 * click. Spread the returned handlers onto the element.
 *
 * - Not for a mouse: `pointerType === "mouse"` is ignored, a mouse has a
 *   real context menu and drags.
 * - A finger that moves more than `tolerance` px, lifts, or is taken over by
 *   the browser (scrolling starts → `pointercancel`) cancels it.
 * - The click that follows a fired long press is swallowed, so pressing a
 *   card doesn't also open it; the browser's own context menu is
 *   suppressed for touch for the same reason.
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = 500, tolerance = 10 }: { delay?: number; tolerance?: number } = {},
) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const touch = useRef(false);
  // Always the latest callback, without restarting a running press.
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      touch.current = event.pointerType !== "mouse";
      if (!touch.current || !event.isPrimary) return;
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        start.current = null;
        navigator.vibrate?.(10);
        callback.current();
      }, delay);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const origin = start.current;
      if (!origin) return;
      if (
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >
        tolerance
      ) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      if (touch.current) event.preventDefault();
    },
    onClickCapture: (event: React.MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
