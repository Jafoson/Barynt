"use client";

import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./issueDetail.module.scss";

/**
 * A fixed spot below the detail view's scrolling content, for the comment
 * composer on a phone: there it stays put while the issue scrolls, and above
 * the keyboard. The view provides the element (`IssueDetailView`), the
 * comments render their composer into it (`IssueComments`). Without one —
 * everywhere but a phone — the composer just sits at the end of the comments.
 */
export const ComposerSlotContext = createContext<HTMLElement | null>(null);

export function useComposerSlot() {
  return useContext(ComposerSlotContext);
}

/** Renders `children` in the composer slot if there is one, else in place. */
export function InComposerSlot({ children }: { children: React.ReactNode }) {
  const slot = useComposerSlot();
  return slot ? createPortal(children, slot) : children;
}

/**
 * Provides the slot: renders `children`, then — when `enabled` — the fixed
 * element below them that the composer is portaled into. The parent must be a
 * flex column whose scrolling part takes the remaining height.
 */
export function ComposerSlotProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <ComposerSlotContext.Provider value={enabled ? slot : null}>
      {children}
      {enabled && <div ref={setSlot} className={styles.composerSlot} />}
    </ComposerSlotContext.Provider>
  );
}
