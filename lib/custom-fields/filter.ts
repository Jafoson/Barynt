import type { FieldDefinition, FieldValue } from "./index";

// Filtering issues by a custom field. The topbar offers a chip for every
// field with a fixed set of answers; the address carries the picked answers
// as `cf.<fieldKey>=a,b`. Several answers of one field are OR'd, different
// fields are AND'd — the same rule the built-in filters follow.

/** "Not set" — every filterable field offers it. */
export const FILTER_NONE = "none";

/** What a date field can be asked, relative to today. */
export const DATE_BUCKETS = ["overdue", "today", "week", "none"] as const;
export type DateBucket = (typeof DATE_BUCKETS)[number];

export const CHECKBOX_ANSWERS = ["yes", "no"] as const;

/** The address parameter of a field. */
export const filterParam = (fieldKey: string): string => `cf.${fieldKey}`;

/** The field key behind an address parameter, or `null`. */
export function fieldKeyOfParam(param: string): string | null {
  return param.startsWith("cf.") && param.length > 3 ? param.slice(3) : null;
}

/**
 * Which fields get a filter: the ones whose answer is a choice, a person, a
 * yes/no or a day. Free text, links and numbers have no short list of
 * answers to pick from, and a time of day has nothing to be "overdue" by.
 */
export function isFilterableField(
  field: Pick<FieldDefinition, "type"> & { dateMode?: string },
): boolean {
  switch (field.type) {
    case "SELECT":
    case "MULTI_SELECT":
    case "USER":
    case "CHECKBOX":
      return true;
    case "DATE":
      return field.dateMode !== "TIME";
    default:
      return false;
  }
}

/** The answers a field accepts that are not one of its own values. */
export function fixedAnswers(
  field: Pick<FieldDefinition, "type">,
): readonly string[] {
  if (field.type === "CHECKBOX") return CHECKBOX_ANSWERS;
  if (field.type === "DATE") return DATE_BUCKETS;
  return [FILTER_NONE];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` of a date in the server's own zone — like the due date's buckets. */
export function dayString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Whether a stored value (or none) satisfies one of the picked answers.
 * `today` is `YYYY-MM-DD`; for a date-time the day part of the stored
 * instant is compared.
 */
export function matchesFieldFilter(
  field: Pick<FieldDefinition, "type">,
  value: FieldValue | null,
  answers: readonly string[],
  today: string,
  weekEnd: string,
): boolean {
  if (answers.length === 0) return true;
  const unset = value === null || value === undefined;

  return answers.some((answer) => {
    switch (field.type) {
      case "CHECKBOX":
        return answer === "yes" ? value === true : value !== true;
      case "DATE": {
        if (answer === "none") return unset;
        if (typeof value !== "string") return false;
        const day = value.slice(0, 10);
        if (answer === "overdue") return day < today;
        if (answer === "today") return day === today;
        if (answer === "week") return day >= today && day < weekEnd;
        return false;
      }
      case "MULTI_SELECT":
        if (answer === FILTER_NONE) return unset;
        return Array.isArray(value) && value.includes(answer);
      default:
        // SELECT and USER
        if (answer === FILTER_NONE) return unset;
        return value === answer;
    }
  });
}
