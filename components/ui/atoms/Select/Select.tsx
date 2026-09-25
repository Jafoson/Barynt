import { Icon } from "@iconify/react";
import { describedBy, Field } from "@/components/ui/atoms/Field/Field";
import styles from "./select.module.scss";

interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  /** The control's id, which the label points at. */
  id: string;
  label: string;
  hint?: string;
  error?: string;
  ref?: React.Ref<HTMLSelectElement>;
  /** The choices, as `<option>`s. */
  children: React.ReactNode;
}

/**
 * One choice of a short, fixed list, as the browser's own select: on a phone that is the
 * system's picker, which is what a short list should be there. A list to search or with
 * more than a label per item is a `SelectMenu`.
 */
export function Select({
  id,
  label,
  hint,
  error,
  className,
  ref,
  children,
  ...rest
}: SelectProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <span className={styles.wrap}>
        <select
          ref={ref}
          id={id}
          className={[styles.select, error && styles.hasError, className]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { hint, error })}
          {...rest}
        >
          {children}
        </select>
        <span className={styles.chevron} aria-hidden="true">
          <Icon icon="lucide:chevron-down" width={15} />
        </span>
      </span>
    </Field>
  );
}
