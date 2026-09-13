"use client";

// Module-scoped, not component state: a browser tab loads its own instance
// of this module, so this watermark is naturally per-tab without needing a
// generated id or sessionStorage — exactly the granularity BARY-26 needs
// (suppress the echo in *this* tab, not in every tab of the same user).
let localBaselineAt = Date.now();

/**
 * Call right when this tab kicks off an issue/board mutation of its own —
 * advances this tab's "don't tell me about changes before this" watermark
 * immediately, client-side, before the Server Action's round trip even
 * completes.
 *
 * This used to be a short time window instead ("was there a local mutation
 * in the last 1.2s"), sized for SSE's near-instant delivery. Polling
 * broke that: `useProjectUpdates` can end up evaluating this tab's own
 * change several seconds (or, via the `visibilitychange` poll, arbitrarily
 * long) after it happened — well outside any fixed window — which made a
 * tab flag its own action as a change made "elsewhere" once the window had
 * expired. Comparing plain timestamps instead of racing a clock against
 * network/poll timing has no such window to outrun.
 */
export function markLocalMutation() {
  localBaselineAt = Date.now();
}

/** This tab's watermark — a change at or before this is either this tab's
 *  own recent action or something already accounted for, never something
 *  worth a banner. */
export function localMutationBaseline(): number {
  return localBaselineAt;
}
