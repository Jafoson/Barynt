"use client";

import { type RefObject, useRef, useState } from "react";

/** Distance (px) past which letting go closes. */
const CLOSE_DISTANCE = 100;
/** Speed (px/ms) past which a flick closes, however short. */
const CLOSE_VELOCITY = 0.6;

/** Whether letting go at `offset` px, moving at `velocity` px/ms, closes. */
export function shouldCloseSheet(offset: number, velocity: number) {
  return offset > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY;
}

/**
 * Swipe down to close a bottom sheet. Spread `handlers` onto the sheet and
 * apply `style`: the sheet follows the finger, then either closes (dragged
 * far enough, or flicked) or springs back.
 *
 * Only a drag that starts where it can't be a scroll counts: on the header,
 * or in the scrolling list while it's at the top (`scrollRef`). Scrolling
 * the list is left to the browser. Touch only — a mouse has the close
 * button and the backdrop.
 *
 * Give the scroller `overscroll-behavior: contain`, or a pull at its top
 * edge turns into the browser's own pull-to-refresh / rubber band.
 */
export function useSwipeToClose(
  onClose: () => void,
  scrollRef?: RefObject<HTMLElement | null>,
) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; canDrag: boolean } | null>(null);
  const last = useRef({ y: 0, t: 0, velocity: 0 });

  const finish = () => {
    start.current = null;
    setDragging(false);
    setOffset(0);
  };

  return {
    handlers: {
      onTouchStart: (event: React.TouchEvent) => {
        const touch = event.touches[0];
        const scroller = scrollRef?.current;
        const inScroller = scroller?.contains(event.target as Node) ?? false;
        start.current = {
          y: touch.clientY,
          canDrag: !inScroller || (scroller?.scrollTop ?? 0) <= 0,
        };
        last.current = { y: touch.clientY, t: event.timeStamp, velocity: 0 };
      },
      onTouchMove: (event: React.TouchEvent) => {
        const origin = start.current;
        if (!origin?.canDrag) return;
        const y = event.touches[0].clientY;
        const delta = y - origin.y;
        if (delta <= 0) {
          // Back up past the start: it's a scroll (or nothing) again.
          if (dragging) setOffset(0);
          return;
        }
        const elapsed = event.timeStamp - last.current.t;
        if (elapsed > 0) {
          last.current = {
            y,
            t: event.timeStamp,
            velocity: (y - last.current.y) / elapsed,
          };
        }
        setDragging(true);
        setOffset(delta);
      },
      onTouchEnd: () => {
        if (!dragging) {
          start.current = null;
          return;
        }
        if (shouldCloseSheet(offset, last.current.velocity)) onClose();
        else finish();
      },
      onTouchCancel: finish,
    },
    style: {
      transform: offset > 0 ? `translateY(${offset}px)` : undefined,
      // Follows the finger without lag; the way back is animated.
      transition: dragging ? "none" : "transform 0.2s ease",
    } as React.CSSProperties,
  };
}
