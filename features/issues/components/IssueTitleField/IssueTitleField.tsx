"use client";

import { useTranslations } from "next-intl";
import { EditableText } from "@/components/ui/layout/EditableText/EditableText";
import styles from "./issueTitleField.module.scss";

interface IssueTitleFieldProps {
  value: string;
  /** Runs on leaving the field — and only if something actually changed. */
  onSave: (title: string) => void;
  /** Editing is over; the caller goes back to showing its own view. */
  onDone: () => void;
  /** Typography of the surroundings — the field should look like the title before it. */
  className?: string;
}

/**
 * An issue's title, edited right in place — on the board card as well as
 * in the list. Both show the same text in the same spot, so it should be
 * just as easy to enter and leave editing from either one.
 *
 * The wrapper isn't a control itself, but a guard doing two things: it
 * intercepts clicks that would otherwise reach the caller (the card would
 * otherwise open the issue), and it notices from the bubbling `focusout`
 * that editing is over — `EditableText` takes over at exactly that moment.
 */
export function IssueTitleField({
  value,
  onSave,
  onDone,
  className,
}: IssueTitleFieldProps) {
  const t = useTranslations();

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: not a control itself, the field inside brings its own keyboard handling
    // biome-ignore lint/a11y/noStaticElementInteractions: just a click guard and focus watcher around the field
    <div
      className={[styles.field, className].filter(Boolean).join(" ")}
      onClick={(event) => event.stopPropagation()}
      onBlur={onDone}
    >
      <EditableText
        autoFocus
        singleLine
        inline
        value={value}
        label={t("fields.title")}
        placeholder={t("placeholders.issueTitle")}
        saveLabel={t("actions.save")}
        cancelLabel={t("actions.cancel")}
        onCommit={onSave}
      />
    </div>
  );
}
