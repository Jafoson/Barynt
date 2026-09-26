import type {
  CustomFieldConfig,
  CustomFieldType,
  FieldValue,
  SelectConfig,
} from "@/lib/custom-fields/types";
import { fullName } from "@/lib/utils/string";

// One answer as a single line of plain text, for the places that cannot draw a component: the label
// of a chip in the composer. Pure: the reader's formats come in, so it is tested without a locale.

/** How the reader sees a number and a day. */
export interface ValueFormat {
  number: (value: number) => string;
  /** Gets the day at noon UTC and is expected to read it in UTC, so it never slips. */
  day: (value: Date) => string;
}

/** The text of an answer, or `null` for none. A choice by its label, a person by their name. */
export function valueText(
  field: { type: CustomFieldType; config: CustomFieldConfig },
  value: FieldValue | null,
  people: { id: string; firstName: string; lastName: string }[],
  format: ValueFormat,
): string | null {
  if (value === null) return null;
  switch (field.type) {
    case "number":
      return format.number(Number(value));
    case "date":
      return format.day(new Date(`${value}T12:00:00Z`));
    case "select":
      return (
        (field.config as SelectConfig).options.find(
          (option) => option.id === value,
        )?.label ?? String(value)
      );
    case "user": {
      const person = people.find((candidate) => candidate.id === value);
      return person ? fullName(person) : String(value);
    }
    default:
      return String(value);
  }
}
