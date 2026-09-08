"use client";

import { useShortcut } from "@/lib/shortcuts/useShortcut";

/**
 * Fires `onSubmit` on ⌘/Ctrl + Enter — the submit gesture used by every
 * composer modal. Thin wrapper around `useShortcut`: `allowInEditable` is
 * what makes this specific combo fire while the title/description field
 * has focus, which is the whole point of a submit shortcut.
 */
export function useSubmitShortcut(onSubmit: () => void, enabled = true) {
  useShortcut("mod+enter", onSubmit, { enabled, allowInEditable: true });
}
