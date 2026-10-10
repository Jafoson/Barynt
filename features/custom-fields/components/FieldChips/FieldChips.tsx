"use client";

import { fieldsFor, useFieldText } from "@/features/custom-fields/format";
import type { IssueLookups } from "@/features/issues/types";
import type { FieldDefinition } from "@/lib/custom-fields";
import type { Issue } from "@/types";
import styles from "./fieldChips.module.scss";

interface Props {
  issue: Pick<Issue, "project" | "fieldValues">;
  fields: FieldDefinition[];
  members: IssueLookups["members"];
  /** How many chips before the rest folds into "+N". */
  max?: number;
}

/**
 * The custom fields of an issue that have a value, as small `name value`
 * chips — for a board card or a list row. Fields without a value take no
 * room, so a workspace with many fields doesn't make every card tall.
 *
 * Read-only: changing a value happens in the issue itself, a click on the
 * card opens it.
 */
export function FieldChips({ issue, fields, members, max = 3 }: Props) {
  const text = useFieldText();

  const filled = fieldsFor(fields, issue.project).flatMap((field) => {
    const value = issue.fieldValues?.[field.id];
    if (value === undefined) return [];
    // A checkbox that is off says nothing worth a chip.
    if (field.type === "CHECKBOX" && value === false) return [];
    const shown = text(field, value, members);
    return shown === "" ? [] : [{ field, shown }];
  });

  if (filled.length === 0) return null;
  const visible = filled.slice(0, max);
  const rest = filled.length - visible.length;

  return (
    <div className={styles.chips}>
      {visible.map(({ field, shown }) => (
        <span
          key={field.id}
          className={styles.chip}
          title={`${field.name}: ${shown}`}
        >
          <span className={styles.name}>{field.name}</span>
          <span className={styles.value}>{shown}</span>
        </span>
      ))}
      {rest > 0 && (
        <span className={`${styles.chip} ${styles.more}`}>+{rest}</span>
      )}
    </div>
  );
}
