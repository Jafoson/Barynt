"use client";

import { useSyncExternalStore } from "react";

/**
 * A page's own job for the floating plus (phone and tablet).
 *
 * The plus lives in the app shell and normally creates issues, views and
 * projects. While a page registers an action here — the dashboard in edit
 * mode: "Add widget" — the plus does exactly that instead, wherever it is.
 * Same pattern as `features/views/newViewAction.ts`.
 */
export interface FabAction {
  label: string;
  icon: string;
  run: () => void;
}

let current: FabAction | null = null;
const listeners = new Set<() => void>();

export function setFabAction(action: FabAction | null) {
  current = action;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFabAction(): FabAction | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
