"use client";

import { useLayoutEffect, useState } from "react";

/** End of the last visible line, in pixels from the text's bounding box. */
export interface TextEnd {
  x: number;
  y: number;
}

/**
 * Measures where a wrapping text ends — the spot where something that
 * belongs to it can attach (here: the pencil icon next to the title).
 *
 * CSS doesn't know this point. A sibling positioned relative to the text's
 * *box* would sit far behind a short final line; positioning it inline in
 * the text flow instead means the line clamp (`-webkit-line-clamp`) would
 * cut it off along with long titles. That leaves measuring — the one
 * exception to "appearance belongs in the stylesheet": the result is just
 * two numbers, positioning still happens in CSS.
 *
 * Lines cut off by the clamp don't count: they lie below the box. So what's
 * measured is the end of the last line that's actually visible — for a
 * truncated title, that's the line with the "…".
 *
 * ```tsx
 * const { ref, end } = useTextEnd(title)
 * <p ref={ref}>{title}</p>
 * ```
 */
export function useTextEnd(
  /** If the text changes, the old measurement no longer applies. */
  text: string,
) {
  // The element as state, not as a ref: only this way does the effect
  // notice when a new paragraph was rendered (after editing) and attaches
  // its observer to the new one instead of the discarded one.
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [end, setEnd] = useState<TextEnd | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `text` isn't read inside the effect, but it determines the wrapping — if it changes, remeasuring is needed
  useLayoutEffect(() => {
    if (!element) return;

    const measure = () => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const box = element.getBoundingClientRect();
      // One rectangle per line — the last one still inside the box is the
      // last visible line.
      const lines = Array.from(range.getClientRects()).filter(
        (line) => line.bottom <= box.bottom + 1,
      );
      const last = lines[lines.length - 1];
      // Without text (or without a line) there is no end — the stylesheet's
      // default then applies.
      const next = last
        ? { x: last.right - box.left, y: last.bottom - box.top }
        : null;
      // Skip the update when the position is unchanged — see the same
      // guard in `useRowFit` (BARY-25): setting state on every observed
      // resize regardless of whether anything moved risks a render loop
      // once some other effect (e.g. the board's post-drag re-render)
      // keeps nudging this element's box without ever settling.
      setEnd((prev) =>
        prev?.x === next?.x && prev?.y === next?.y ? prev : next,
      );
    };

    measure();
    // If the column gets narrower, the title wraps differently.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, text]);

  return { ref: setElement, end };
}
