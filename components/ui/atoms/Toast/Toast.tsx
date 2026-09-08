"use client";

import { useUI } from "@/lib/ui-store";
import styles from "./toast.module.scss";

/**
 * Renders the current toast, if any — `useUI().toast(msg)` is the trigger,
 * this is the only place that displays it. Mount once, high in the tree
 * (`AppShell`), the same way `ModalOutlet`/`DockOutlet` work.
 *
 * For actions with no visible control to give feedback on — a keyboard
 * shortcut that copies something to the clipboard, say — rather than
 * something every button could show on its own.
 */
export function Toast() {
  const { ui } = useUI();
  if (!ui.toast) return null;

  // Keyed by id: the reducer stamps a fresh one on every call, even for the
  // same message twice in a row — without the key, React would just patch
  // the text node in place and the animation (which relies on mounting)
  // wouldn't restart.
  return (
    <output key={ui.toast.id} className={styles.toast} aria-live="polite">
      {ui.toast.msg}
    </output>
  );
}
