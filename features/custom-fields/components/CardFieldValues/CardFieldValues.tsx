import { Icon } from "@iconify/react";
import { FieldValueView } from "@/features/custom-fields/components/FieldValueView/FieldValueView";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import { fieldIcon } from "@/lib/custom-fields/icons";
import type { FieldValue } from "@/lib/custom-fields/types";
import type { User } from "@/types";
import styles from "./cardFieldValues.module.scss";

interface Props {
  entries: { field: CustomFieldRow; value: FieldValue }[];
  members: User[];
  /** `card` wraps below the labels of a board card; `row` stays on the line of a list row. */
  layout: "card" | "row";
}

/**
 * The custom fields a board card or a list row shows: each answer with the field's name before it,
 * small and quiet, one after the other. Draws nothing for an issue with no answer to a shown field.
 * No click of its own: the card and the row open the issue, and the answer is changed there.
 */
export function CardFieldValues({ entries, members, layout }: Props) {
  if (entries.length === 0) return null;

  return (
    <ul className={[styles.list, styles[layout]].join(" ")}>
      {entries.map(({ field, value }) => (
        <li key={field.id} className={styles.item} title={field.name}>
          {field.icon ? (
            <Icon
              icon={fieldIcon(field)}
              width={12}
              className={styles.icon}
              aria-label={field.name}
            />
          ) : (
            <span className={styles.name}>{field.name}</span>
          )}
          <FieldValueView field={field} value={value} members={members} />
        </li>
      ))}
    </ul>
  );
}
