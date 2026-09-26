"use client";

import { Icon } from "@iconify/react";
import { useFormatter } from "next-intl";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { FieldEditor } from "@/features/custom-fields/components/FieldEditor/FieldEditor";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import { valueText } from "@/features/custom-fields/valueText";
import {
  CUSTOM_FIELD_TYPE_ICONS,
  type FieldValue,
} from "@/lib/custom-fields/types";
import type { User } from "@/types";

interface Props {
  field: CustomFieldRow;
  value: FieldValue | null;
  members: User[];
  /** Sets the answer, or clears it with `null`. */
  onChange: (value: FieldValue | null) => void;
}

/**
 * A custom field as a chip in the composer's toolbar, like assignee and labels: the field's name
 * until it has an answer, then the answer, highlighted, with a button to clear it. What opens is the
 * same editor the issue's detail view uses.
 */
export function FieldChip({ field, value, members, onChange }: Props) {
  const format = useFormatter();
  const text = valueText(field, value, members, {
    number: (n) => format.number(n),
    day: (d) => format.dateTime(d, { dateStyle: "medium", timeZone: "UTC" }),
  });

  return (
    <FilterChip
      name={field.name}
      label={text ?? field.name}
      icon={<Icon icon={CUSTOM_FIELD_TYPE_ICONS[field.type]} width={14} />}
      active={value !== null}
      onClear={() => onChange(null)}
      width={field.type === "user" ? 220 : 240}
      maxWidth={320}
      data-field-nav
    >
      {(close) => (
        <FieldEditor
          field={field}
          value={value}
          members={members}
          onSave={onChange}
          close={close}
        />
      )}
    </FilterChip>
  );
}
