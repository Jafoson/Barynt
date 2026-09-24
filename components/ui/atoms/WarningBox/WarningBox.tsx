"use client";

import { Icon } from "@iconify/react";
import type { ReactNode } from "react";
import styles from "./warningBox.module.scss";

interface Props {
  title: string;
  /** What the warning says, as paragraphs. */
  children: ReactNode;
  /** The sentence next to the box that says it was understood. */
  checkLabel: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * A warning with a checkbox that answers it. Paired with `AcknowledgeModal`, whose
 * button stays off until the box is ticked. The box is the question, not the
 * protection: whatever it guards asks the server for the same yes.
 */
export function WarningBox({
  title,
  children,
  checkLabel,
  checked,
  onChange,
  disabled,
}: Props) {
  return (
    <div className={styles.box}>
      <p className={styles.title}>
        <Icon icon="lucide:triangle-alert" width={16} />
        {title}
      </p>
      <div className={styles.text}>{children}</div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{checkLabel}</span>
      </label>
    </div>
  );
}
