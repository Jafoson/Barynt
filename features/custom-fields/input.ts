import {
  checkLink,
  type FieldDefinition,
  type FieldValue,
} from "@/lib/custom-fields";
import { utcToZonedLocal, zonedLocalToUtc } from "@/lib/custom-fields/datetime";

// What a single-line editor of a custom field shows and sends back. The
// input element speaks strings in the person's own zone; the stored value
// is UTC for an instant. These two functions are the whole translation.

export type InputVariant =
  | "text"
  | "number"
  | "date"
  | "time"
  | "datetime-local";

export function inputVariant(field: FieldDefinition): InputVariant {
  if (field.type === "NUMBER") return "number";
  if (field.type === "DATE") {
    return field.dateMode === "TIME"
      ? "time"
      : field.dateMode === "DATETIME"
        ? "datetime-local"
        : "date";
  }
  return "text";
}

/** The stored value as the input element wants it. */
export function toInputString(
  field: FieldDefinition,
  value: FieldValue | null,
  timeZone: string,
): string {
  if (value === null || value === undefined) return "";
  if (field.type === "DATE" && field.dateMode === "DATETIME") {
    return typeof value === "string"
      ? (utcToZonedLocal(value, timeZone) ?? "")
      : "";
  }
  return String(value);
}

/**
 * What the input holds → what the server takes. `null` clears the value; an
 * unreadable date-time also becomes `null` instead of a half value.
 */
export function fromInputString(
  field: FieldDefinition,
  text: string,
  timeZone: string,
): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (field.type === "DATE" && field.dateMode === "DATETIME") {
    return zonedLocalToUtc(trimmed, timeZone);
  }
  return trimmed;
}

/** The `step` of a number input: whole numbers, fixed places, or anything. */
export function inputStep(field: FieldDefinition): string | undefined {
  if (field.type !== "NUMBER") return undefined;
  if (field.numberMode === "INTEGER") return "1";
  if (field.numberMode === "DECIMAL") {
    return String(10 ** -(field.numberDecimals ?? 2));
  }
  return "any";
}

/**
 * Why a link would not be accepted, as a key of `customFields.link*` — or
 * `null` when it is fine (or empty). The server checks again; this is so
 * the person sees it before pressing "Save".
 */
export function linkProblem(
  field: FieldDefinition,
  text: string,
): "linkInvalid" | "linkNotHttps" | "linkNotAllowedHost" | null {
  const trimmed = text.trim();
  if (field.type !== "URL" || trimmed === "") return null;
  const result = checkLink(trimmed, {
    httpsOnly: field.linkHttpsOnly,
    hosts: field.linkHosts,
  });
  if (result.ok) return null;
  return result.reason === "scheme"
    ? "linkNotHttps"
    : result.reason === "host"
      ? "linkNotAllowedHost"
      : "linkInvalid";
}
