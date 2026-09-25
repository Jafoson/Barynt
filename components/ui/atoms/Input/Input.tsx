"use client";

import { Icon } from "@iconify/react";
import { useId, useState } from "react";
import styles from "./input.module.scss";

type InputVariant =
  | "text"
  | "password"
  | "search"
  | "date"
  | "number"
  | "email"
  | "url";
type InputSize = "sm" | "md";

/**
 * How the field looks — independent of *what* it captures (`variant`).
 *
 * `boxed` is the default: bordered, fixed height, a recognizable form field.
 *
 * `title` sits at the top of a creation dialog and looks like the heading of
 * the record being created, not like a field: no border, sized like a
 * heading, with a background that only appears on hover. Same surface as
 * the title and description in the detail view, so both paths feel the same.
 */
type InputAppearance = "boxed" | "title";

interface InputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    // `prefix` already exists on `<input>` — as an RDFa attribute that
    // nobody here means. The prefix below takes over the name.
    "type" | "size" | "prefix"
  > {
  variant?: InputVariant;
  appearance?: InputAppearance;
  label?: string;
  hint?: string;
  error?: string;
  size?: InputSize;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  /**
   * A fixed prefix that belongs to the value but isn't part of the input —
   * the `@` of a username, the `/` of a path.
   *
   * Unlike `iconLeft`: an icon sits *next to* the value and needs spacing, a
   * prefix sits directly *in front of* it and forms one word with what's
   * typed. That's why it isn't positioned as an absolutely placed marker
   * inside the field, but as the first child within the border — the border
   * moves from the `<input>` to its wrapper for this.
   */
  prefix?: React.ReactNode;
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({
  variant = "text",
  appearance = "boxed",
  label,
  hint,
  error,
  size = "md",
  id,
  className,
  iconLeft,
  iconRight,
  prefix,
  ref,
  ...rest
}: InputProps) {
  const [showPw, setShowPw] = useState(false);
  // Only for the prefix: its `htmlFor` needs a target even when the field
  // has no visible label.
  const fallbackId = useId();

  const inputId =
    id ??
    (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined) ??
    (prefix ? fallbackId : undefined);

  // Search gets default search icon unless caller overrides with iconLeft
  const leftNode =
    iconLeft ??
    (variant === "search" ? <Icon icon="lucide:search" width={15} /> : null);
  const hasLeft = !!leftNode;
  const hasRight = variant === "password" || !!iconRight;

  // With a prefix, the wrapper carries the border and the `<input>` sits
  // bare inside it. Only this way do prefix and value end up on the same
  // line, without the gap an absolutely positioned marker would leave.
  const framed = !!prefix && appearance === "boxed";

  const inputType =
    variant === "password"
      ? showPw
        ? "text"
        : "password"
      : variant === "search"
        ? "text"
        : variant;

  return (
    <div
      className={[styles.wrap, size === "sm" && styles.sm]
        .filter(Boolean)
        .join(" ")}
    >
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}

      <div
        className={[styles.inputWrap, framed && styles.framed]
          .filter(Boolean)
          .join(" ")}
      >
        {hasLeft && <span className={styles.iconLeft}>{leftNode}</span>}
        {/* As a `<label>` rather than a `<span>`: the prefix looks like part
            of the field, so a click on it must also focus the input — the
            element does that on its own, no handler needed. `aria-hidden`
            because it isn't the label: `@` is decoration on the value, and
            reading it aloud would misrepresent the field's name. */}
        {framed && (
          <label aria-hidden="true" className={styles.prefix} htmlFor={inputId}>
            {prefix}
          </label>
        )}

        <input
          ref={ref}
          id={inputId}
          type={inputType}
          className={[
            styles.input,
            framed ? styles.bare : styles[appearance],
            error && styles.hasError,
            !framed && hasLeft && styles.hasIconLeft,
            !framed && hasRight && styles.hasIconRight,
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />

        {variant === "password" && (
          <span className={styles.iconRight}>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Passwort verbergen" : "Passwort anzeigen"}
            >
              <Icon
                icon={showPw ? "lucide:eye-off" : "lucide:eye"}
                width={15}
              />
            </button>
          </span>
        )}

        {variant !== "password" && iconRight && (
          <span className={styles.iconRight}>{iconRight}</span>
        )}
      </div>

      {error && (
        <span className={`${styles.feedback} ${styles.errorText}`}>
          <Icon icon="lucide:circle-alert" width={12} />
          {error}
        </span>
      )}
      {!error && hint && (
        <span className={`${styles.feedback} ${styles.hintText}`}>{hint}</span>
      )}
    </div>
  );
}
