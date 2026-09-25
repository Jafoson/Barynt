import { describedBy, Field } from "@/components/ui/atoms/Field/Field";
import styles from "./textarea.module.scss";

interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  /** The control's id, which the label points at. */
  id: string;
  label: string;
  hint?: string;
  error?: string;
  ref?: React.Ref<HTMLTextAreaElement>;
}

/** Several lines of text, bordered like an `Input`: it grows in height only, by hand. */
export function Textarea({
  id,
  label,
  hint,
  error,
  className,
  ref,
  ...rest
}: TextareaProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={id}
        className={[styles.textarea, error && styles.hasError, className]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { hint, error })}
        {...rest}
      />
    </Field>
  );
}
