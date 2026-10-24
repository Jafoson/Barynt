"use client";

import { useSyncExternalStore } from "react";

/**
 * "New view" for the phone's floating plus (BARY-164).
 *
 * The plus lives in the app shell and knows nothing about the project, the
 * person's permissions or the filters on screen — the topbar does. So the
 * topbar's button registers its action here while it's mounted, and the
 * plus offers it as one more choice. Nothing registered (no project board
 * or list on screen): no choice.
 */
export interface NewViewAction {
  /** "New view", or "Save as new view" with filters set. */
  label: string;
  run: () => void;
}

let current: NewViewAction | null = null;
const listeners = new Set<() => void>();

export function setNewViewAction(action: NewViewAction | null) {
  current = action;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNewViewAction(): NewViewAction | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
