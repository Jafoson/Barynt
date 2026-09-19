"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, live. `false` on the server and during
 * hydration's first render, so the markup matches the server's — layout
 * that only depends on width belongs in CSS; this is for behavior that has
 * to differ (e.g. a dropdown on a tablet, a sheet on a phone).
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Same value as `bp.$phone` in `styles/breakpoints.scss`. */
export const PHONE_QUERY = "(max-width: 640px)";

/** Same value as `bp.$tablet` in `styles/breakpoints.scss`: phone and tablet. */
export const COMPACT_QUERY = "(max-width: 1024px)";
