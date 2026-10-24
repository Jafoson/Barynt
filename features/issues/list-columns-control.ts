"use client";

import { useSyncExternalStore } from "react";
import type { ListStyle } from "@/features/account/preferences";
import type { ListColumn } from "./list-columns";

/**
 * The open list's columns, for the display panel (BARY-175).
 *
 * The list decides which columns it shows — its own choice, the board's
 * hidden fields, the project's fields — and the topbar's display panel
 * offers the same switches. Rather than working that out twice, the list
 * registers what it shows here and the panel reads it. Same pattern as
 * `lib/fab-action.ts`.
 */
export interface ListColumnsControl {
  shown: ListColumn[];
  /** What can be switched on here at all. */
  offered: ListColumn[];
  onChange: (next: ListColumn[]) => void;
  /** Modern, or classic with lines between the columns — the person's own. */
  style: ListStyle;
  onStyleChange: (next: ListStyle) => void;
}

let current: ListColumnsControl | null = null;
const listeners = new Set<() => void>();

export function setListColumnsControl(control: ListColumnsControl | null) {
  current = control;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useListColumnsControl(): ListColumnsControl | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
