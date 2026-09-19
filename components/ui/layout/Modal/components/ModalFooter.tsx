"use client";

import { Shortcut } from "@/components/ui/atoms/Shortcut/Shortcut";
import { useHasKeyboard } from "@/lib/shortcuts/useHasKeyboard";
import styles from "../modal.module.scss";

interface ModalFooterProps {
  /** Left slot, usually a `ModalShortcut`. */
  hint?: React.ReactNode;
  /** Actions — always right-aligned. */
  children?: React.ReactNode;
  /** Divider above. Default: true. */
  divider?: boolean;
}

/** Modal footer: hint on the left, actions on the right. */
export function ModalFooter({
  hint,
  children,
  divider = true,
}: ModalFooterProps) {
  return (
    <div
      className={[styles.footer, divider && styles.dividerAbove]
        .filter(Boolean)
        .join(" ")}
    >
      {hint}
      <div className={styles.footerActions}>{children}</div>
    </div>
  );
}

interface ModalShortcutProps {
  /** Spec as passed to `useShortcut`, e.g. "mod+enter", "enter". */
  keys: string;
  /** Description after the keys, e.g. "to create". */
  children?: React.ReactNode;
}

/** Keyboard shortcut hint for the `ModalFooter`'s `hint` slot. */
export function ModalShortcut({ keys, children }: ModalShortcutProps) {
  // The hint is "keys + what they do" — without the keys it means nothing.
  if (!useHasKeyboard()) return null;

  return (
    <span className={styles.shortcut}>
      <Shortcut keys={keys} />
      {children}
    </span>
  );
}
