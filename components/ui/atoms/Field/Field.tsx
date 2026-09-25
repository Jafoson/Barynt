import { Icon } from "@iconify/react";
import type { ReactNode } from "react";
import styles from "./field.module.scss";

interface FieldProps {
  /** The id of the control inside, which the label points at. */
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** The ids of the hint and the error under a control, for its `aria-describedby`. */
export function describedBy(
  id: string,
  { hint, error }: { hint?: string; error?: string },
): string | undefined {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

/**
 * The label, the hint and the error around a control that `Input` does not cover
 * (`Textarea`, `Select`): the same spacing and type as `Input`, so a form that mixes them
 * reads as one. The control sets `aria-describedby` from `describedBy`.
 */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {error && (
        <span
          id={`${id}-error`}
          className={`${styles.feedback} ${styles.error}`}
        >
          <Icon icon="lucide:circle-alert" width={12} />
          {error}
        </span>
      )}
      {!error && hint && (
        <span id={`${id}-hint`} className={`${styles.feedback} ${styles.hint}`}>
          {hint}
        </span>
      )}
    </div>
  );
}
