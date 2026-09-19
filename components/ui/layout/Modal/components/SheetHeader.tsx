import { Icon } from "@iconify/react";
import styles from "./sheetHeader.module.scss";

interface SheetHeaderProps {
  title: React.ReactNode;
  /** Small line above the title — an issue's key, say. */
  caption?: React.ReactNode;
  /** Back button on the left — for a sheet with a second view. */
  onBack?: () => void;
  backLabel?: string;
  /** Text button before the close button — "Reset", say. */
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    /** Longer wording for screen readers, when `label` is short. */
    ariaLabel?: string;
  };
  onClose: () => void;
  /** Accessible label for the close button — please pass this localized. */
  closeLabel: string;
}

/**
 * The bar at the top of a bottom sheet (`Modal variant="sheet"`): an optional
 * back button on the left, what the sheet is about in the middle, an
 * optional text action and the close button on the far right. Buttons are touch-sized, and the bar is where a
 * downward drag starts the swipe-to-close (`touch-action: none`,
 * `useSwipeToClose`).
 */
export function SheetHeader({
  title,
  caption,
  onBack,
  backLabel,
  action,
  onClose,
  closeLabel,
}: SheetHeaderProps) {
  return (
    <div className={styles.head}>
      {onBack && (
        <button
          type="button"
          className={styles.iconButton}
          aria-label={backLabel}
          onClick={onBack}
        >
          <Icon icon="lucide:chevron-left" width={22} />
        </button>
      )}
      <div className={styles.text}>
        {caption && <span className={styles.caption}>{caption}</span>}
        <p className={styles.title}>{title}</p>
      </div>
      {action && (
        <button
          type="button"
          className={styles.action}
          aria-label={action.ariaLabel}
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        className={styles.iconButton}
        aria-label={closeLabel}
        onClick={onClose}
      >
        <Icon icon="lucide:x" width={22} />
      </button>
    </div>
  );
}
