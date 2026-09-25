"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import type { FieldValue, SelectConfig } from "@/lib/custom-fields/types";
import { fullName } from "@/lib/utils/string";
import type { User } from "@/types";
import styles from "./fieldValueView.module.scss";

interface Props {
  field: CustomFieldRow;
  value: FieldValue | null;
  /** To turn a person's id into a name and a face. */
  members: User[];
  /**
   * Draw an address as a link. Off where the value sits inside a button (a link cannot be inside
   * one); the caller puts the link beside it.
   */
  link?: boolean;
}

/**
 * One answer to a custom field, as text: a number in the reader's format, a day as a date, a choice
 * with its color, a person with their face. No answer says so, quietly. Draws no box or button of
 * its own, so the issue's detail view, a card and a list row can all put it where they need.
 */
export function FieldValueView({ field, value, members, link = false }: Props) {
  const t = useTranslations();
  const format = useFormatter();

  if (value === null) {
    return <span className={styles.unset}>{t("customFields.notSet")}</span>;
  }

  switch (field.type) {
    case "number":
      return (
        <span className={styles.text}>{format.number(Number(value))}</span>
      );
    case "date":
      return (
        <span className={styles.text}>
          {format.dateTime(new Date(`${value}T12:00:00Z`), {
            dateStyle: "medium",
            timeZone: "UTC",
          })}
        </span>
      );
    case "url":
      return link ? (
        <a
          className={[styles.text, styles.link].join(" ")}
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {String(value)}
        </a>
      ) : (
        <span className={styles.text}>{String(value)}</span>
      );
    case "select": {
      const option = (field.config as SelectConfig).options.find(
        (candidate) => candidate.id === value,
      );
      return (
        <span className={styles.option}>
          {option?.color && (
            <span
              className={styles.dot}
              style={{ "--option-color": option.color } as React.CSSProperties}
              aria-hidden="true"
            />
          )}
          <span className={styles.text}>{option?.label ?? String(value)}</span>
        </span>
      );
    }
    case "user": {
      const person = members.find((member) => member.id === value);
      return person ? (
        <span className={styles.person}>
          <Avatar avatar={person} size={18} />
          <span className={styles.text}>{fullName(person)}</span>
        </span>
      ) : (
        <span className={styles.unset}>{t("customFields.unknownPerson")}</span>
      );
    }
    default:
      return <span className={styles.text}>{String(value)}</span>;
  }
}
