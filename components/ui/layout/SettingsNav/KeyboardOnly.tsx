"use client";

import { useHasKeyboard } from "@/lib/shortcuts/useHasKeyboard";

/** Renders its children only where there's likely a keyboard (`useHasKeyboard`). */
export function KeyboardOnly({ children }: { children: React.ReactNode }) {
  return useHasKeyboard() ? children : null;
}
