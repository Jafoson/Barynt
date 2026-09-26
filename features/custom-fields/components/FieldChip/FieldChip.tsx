import { Icon } from "@iconify/react";
import type { OverflowChip } from "@/components/ui/layout/ChipOverflow/ChipOverflow";
import { FieldEditor } from "@/features/custom-fields/components/FieldEditor/FieldEditor";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import {
  type ValueFormat,
  valueText,
} from "@/features/custom-fields/valueText";
import { fieldIcon } from "@/lib/custom-fields/icons";
import type { FieldValue } from "@/lib/custom-fields/types";
import type { User } from "@/types";

/**
 * A custom field as a chip of the composer's row, like assignee and labels: the field's name until it
 * has an answer, then the answer, highlighted, with a button to clear it; the field's own icon, or its
 * type's. What opens is the same editor the issue's detail view uses, in a popover under the chip or, if
 * the chip did not fit the row, in the "more" menu. Not a component: the row (`ChipOverflow`) decides
 * where it is drawn, so this only says what the chip is.
 */
export function fieldChipItem(
  field: CustomFieldRow,
  value: FieldValue | null,
  members: User[],
  format: ValueFormat,
  onChange: (value: FieldValue | null) => void,
): OverflowChip {
  return {
    id: `custom:${field.id}`,
    name: field.name,
    label: valueText(field, value, members, format) ?? field.name,
    icon: <Icon icon={fieldIcon(field)} width={14} />,
    active: value !== null,
    onClear: () => onChange(null),
    width: field.type === "user" ? 220 : 240,
    maxWidth: 320,
    children: (close) => (
      <FieldEditor
        field={field}
        value={value}
        members={members}
        onSave={onChange}
        close={close}
      />
    ),
  };
}
