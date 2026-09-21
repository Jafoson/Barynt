"use client";

import { createPortal } from "react-dom";
import styles from "./fullscreenEdit.module.scss";

/**
 * A field that takes over the whole screen — right down to the on-screen
 * keyboard (`--kb-inset`) — while it's being written in (phone and tablet).
 * Its child is stretched to the full height: a column with the editor
 * growing and buttons below.
 *
 * Portaled to `body`: a `position: fixed` inside a transformed or clipped
 * ancestor (modal, side panel) would not cover the screen. React events
 * still bubble through the portal, so blur/focus handling in the caller
 * is unaffected.
 */
export function FullscreenEdit({ children }: { children: React.ReactNode }) {
  return createPortal(
    <div className={styles.root}>{children}</div>,
    document.body,
  );
}
