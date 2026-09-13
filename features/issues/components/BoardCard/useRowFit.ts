"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** The natural widths of a row: the children's and the counter's. */
interface Widths {
  items: number[];
  more: number;
}

/**
 * How many children of the row can stand side by side, while still leaving
 * room at the end for the counter for the rest.
 */
function fitCount(row: HTMLElement, widths: Widths) {
  const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
  // Half a pixel of tolerance: widths come back fractional, and a label
  // shouldn't fail to fit because of a rounding error.
  const room = row.getBoundingClientRect().width + 0.5;
  const upTo = (k: number) =>
    k > 0
      ? widths.items.slice(0, k).reduce((sum, w) => sum + w, 0) + gap * (k - 1)
      : 0;

  let n = widths.items.length;
  while (n > 0 && upTo(n) > room) n--;
  // If something is left over, the counter needs room too — if necessary,
  // one more label gives way for it.
  if (n < widths.items.length) {
    while (n > 0 && upTo(n) + gap + widths.more > room) n--;
  }
  return n;
}

/**
 * Truncates a row to a single line and reports how many children still fit —
 * the caller sums up the rest as "+n".
 *
 * CSS can clip a row (`overflow`), but it can't count what it clipped: there
 * is no selector for "sticks out". So this measures instead — the same
 * exception as in `useTextEnd`, and with the same scope: only a number comes
 * out of it, styling still happens in the stylesheet.
 *
 * Measurement happens exactly once per set of labels, in the pass before
 * anything is truncated — after that, half of them aren't even in the DOM
 * anymore. The widths are therefore cached: if the column gets narrower, the
 * observer keeps recalculating from that cache alone, without having to
 * rebuild the full row first.
 *
 * ```tsx
 * const { ref, fit } = useRowFit(labels.length, labels.map((l) => l.name).join())
 * const shown = fit === null ? labels : labels.slice(0, fit)
 * ```
 *
 * As long as `fit` is `null`, the measuring pass is running: then *all*
 * children belong in the row, plus the counter at the end, taken out of
 * flow. This state is also the one before hydration and the one without
 * JavaScript — so the row doesn't wrap even when untruncated, it just gets
 * clipped.
 */
export function useRowFit(
  /** Number of children before the counter. */
  count: number,
  /** If this changes, the cached widths no longer apply. */
  key: string,
) {
  // The element as state, not as a ref: only this way does the effect
  // notice a new row was rendered, and measures that one instead of the
  // discarded one.
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<{ key: string; fit: number | null }>({
    key,
    fit: null,
  });
  const widths = useRef<Widths | null>(null);

  // New labels means: show everything again first, then measure. This is
  // deliberately placed here and not in an effect — an effect would run one
  // cycle too late and find the row already truncated.
  const fit = state.key === key ? state.fit : null;

  useLayoutEffect(() => {
    if (!element) return;

    const children = Array.from(element.children);
    const all = children.map((child) => child.getBoundingClientRect().width);
    // The counter sits after the children and is taken out of flow.
    widths.current = { items: all.slice(0, count), more: all[count] ?? 0 };
    setState({ key, fit: fitCount(element, widths.current) });
  }, [element, key, count]);

  useLayoutEffect(() => {
    if (!element) return;

    // If the column gets narrower, fewer labels fit side by side.
    const observer = new ResizeObserver(() => {
      if (!widths.current) return;
      const next = fitCount(element, widths.current);
      // Skip the update when nothing actually changed — the board's own
      // re-render after a drag (new column widths, cards remounting)
      // resizes this row without changing how many labels fit. Setting
      // state anyway there still schedules a render; if that render's own
      // layout pass reports the row as "resized" again to the observer
      // (a card's cross-column remount briefly does), it looped without
      // ever converging — the exact shape of React error #185, "Maximum
      // update depth exceeded" (BARY-25).
      setState((prev) =>
        prev.key === key && prev.fit === next ? prev : { key, fit: next },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, key]);

  return { ref: setElement, fit };
}
