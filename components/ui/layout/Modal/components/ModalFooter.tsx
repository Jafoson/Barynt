import { Shortcut } from "@/components/ui/atoms/Shortcut/Shortcut";
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
  return (
    <span className={styles.shortcut}>
      <Shortcut keys={keys} />
      {children}
    </span>
  );
}
