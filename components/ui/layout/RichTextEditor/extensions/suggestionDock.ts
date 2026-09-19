/**
 * Where the suggestion list goes on a phone, with the keyboard up.
 *
 * A floating list under the caret is wrong there: the space below it is the
 * keyboard. So it uses only what's actually visible — the visual viewport —
 * and goes **below** the caret line when there's comfortable room, otherwise
 * **above** it (like mention lists in chat apps), never over the line being
 * typed. Its height is capped to the room it has, so it scrolls instead of
 * running under the keyboard or off the top.
 *
 * Pure numbers in, numbers out — `suggestion.ts` applies them.
 */

/** Space (px) the list keeps from the caret line. */
const GAP = 6;
/** Below this much room underneath, it goes above the caret instead. */
const COMFORTABLE = 224;
/** A list never gets smaller than about two rows plus its padding. */
const MIN_HEIGHT = 112;
/** …and never taller than this share of the visible height. */
const MAX_SHARE = 0.5;

export interface DockInput {
  /** The caret's rectangle, in layout-viewport coordinates. */
  caret: { top: number; bottom: number };
  /** The visible area: `visualViewport.offsetTop` and `.height`. */
  visible: { top: number; height: number };
  /** `window.innerHeight` — what `bottom: …` is measured against. */
  layoutHeight: number;
}

export interface DockPlacement {
  side: "below" | "above";
  /** Height the list may use, in px. */
  maxHeight: number;
  /** For `side: "below"`: distance from the top of the layout viewport. */
  top?: number;
  /** For `side: "above"`: distance from the bottom of the layout viewport. */
  bottom?: number;
}

export function dockPlacement({
  caret,
  visible,
  layoutHeight,
}: DockInput): DockPlacement {
  const visibleBottom = visible.top + visible.height;
  const below = visibleBottom - caret.bottom - GAP;
  const above = caret.top - visible.top - GAP;
  const cap = Math.max(MIN_HEIGHT, visible.height * MAX_SHARE);

  if (below >= COMFORTABLE || below >= above) {
    return {
      side: "below",
      maxHeight: Math.max(MIN_HEIGHT, Math.min(below, cap)),
      top: caret.bottom + GAP,
    };
  }
  return {
    side: "above",
    maxHeight: Math.max(MIN_HEIGHT, Math.min(above, cap)),
    bottom: layoutHeight - caret.top + GAP,
  };
}
