import { Icon } from "@iconify/react";
import styles from "./label.module.scss";

interface LabelProps {
  color?: string;
  size?: "xs" | "sm" | "md";
  filled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  hasIcon?: boolean;
  /** Explains what the label stands for on hover. */
  title?: string;
  /**
   * Attaches a remove cross. Without the callback the label stays purely
   * for display — most places only show it, they don't let it be edited there.
   */
  onRemove?: () => void;
  /** Accessible name of the cross — pass it in localized. */
  removeLabel?: string;
}

export function Label({
  color,
  size = "md",
  className,
  style,
  children,
  hasIcon,
  filled,
  title,
  onRemove,
  removeLabel = "Remove",
}: LabelProps) {
  return (
    // `role`/`tabIndex`/`onKeyDown` are only ever set together, all
    // conditioned on `onRemove` — a non-removable chip gets none of them
    // and stays a plain, non-interactive span. Biome can't see through the
    // shared condition to confirm that from here.
    // biome-ignore lint/a11y/noStaticElementInteractions: interactive only when `role="button"` is also set, both gated on `onRemove`
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: `aria-label` is likewise only set alongside `role="button"`
    <span
      title={title}
      className={[
        styles.label,
        // "md" is the base style and deliberately has no modifier class.
        styles[size],
        filled && styles.filled,
        onRemove && styles.removable,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--label-color": color, ...style } as React.CSSProperties}
      // The whole chip is the keyboard target once it's removable — not
      // just its small cross, which stays mouse-only (`tabIndex={-1}`
      // below) so a chip is one Tab/roving stop, not two. `removeLabel`
      // (not `children`) as the accessible name: a screen reader announces
      // what activating it does ("Remove label Bug"), same string the
      // cross used to carry alone.
      tabIndex={onRemove ? 0 : undefined}
      role={onRemove ? "button" : undefined}
      aria-label={onRemove ? removeLabel : undefined}
      // Lets a surrounding chip-roving handler (e.g. the issue panel's
      // labels) find every removable chip's focus target in one query.
      data-label-chip={onRemove ? true : undefined}
      onKeyDown={
        onRemove
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              // Backspace/Delete only — deliberately not Enter/Space too
              // (no generic `role="button"` activation here): removal is
              // easy to trigger by accident once the whole chip is a roving
              // stop, and Backspace/Delete is the one pair of keys that
              // reads as "remove" and nothing else.
              if (event.key !== "Backspace" && event.key !== "Delete") return;
              event.preventDefault();
              onRemove();
            }
          : undefined
      }
    >
      {color && !hasIcon && (
        <span className={styles.dot} style={{ background: color }} />
      )}
      {children}

      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={removeLabel}
          title={removeLabel}
          // Not its own Tab/roving stop — the chip itself is (see above);
          // still reachable and clickable by mouse.
          tabIndex={-1}
          // The label itself can be clickable (filter, selection) — the
          // cross only means itself.
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <Icon icon="lucide:x" width={11} />
        </button>
      )}
    </span>
  );
}
