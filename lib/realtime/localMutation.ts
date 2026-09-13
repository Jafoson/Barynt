"use client";

// Module-scoped, not component state: a browser tab loads its own instance
// of this module, so this timestamp is naturally per-tab without needing a
// generated id or sessionStorage — exactly the granularity BARY-26 needs
// (suppress the echo in *this* tab, not in every tab of the same user).
let lastLocalMutationAt = 0;

/** Call right when this tab kicks off an issue/board mutation of its own. */
export function markLocalMutation() {
  lastLocalMutationAt = Date.now();
}

/**
 * Whether this tab caused a mutation recently enough that an incoming
 * `ProjectChangeEvent` from the same user is almost certainly the echo of
 * that very action, not a change made from one of the user's other tabs.
 * 1.2s comfortably covers the Server Action round trip plus SSE delivery.
 */
export function recentLocalMutation(withinMs = 1200): boolean {
  return Date.now() - lastLocalMutationAt < withinMs;
}
