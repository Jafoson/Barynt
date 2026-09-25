import type { FieldValue } from "@/lib/custom-fields/types";
import { toColumns } from "@/lib/custom-fields/value";
import type { CustomFieldRow } from "./types";

// What a box beside a field holds while someone types, and what it says as an answer. Pure: no React,
// so the conversions are tested on their own. A box holds text, a number included (a half-typed
// number is not one yet); an empty box means "no answer", never zero.

/** The text a box starts with for this answer. */
export function draftOf(value: FieldValue | null): string {
  return value === null ? "" : String(value);
}

/**
 * What a box's text says as an answer: an empty box (or only spaces) clears the field, a number's
 * text is that number (or `NaN` for text that is not one, which the checks refuse), anything else is
 * the text as typed (the checks trim it).
 */
export function valueOfDraft(
  field: Pick<CustomFieldRow, "type">,
  text: string,
): FieldValue | null {
  if (text.trim() === "") return null;
  return field.type === "number" ? Number(text) : text;
}

/**
 * Why a box's text cannot be saved, as a sentence, or `null` when it can. An empty box can: it
 * clears the field. The same checks the server makes (`toColumns`), so a problem shows before the
 * request instead of after it.
 */
export function problemOfDraft(
  field: Pick<CustomFieldRow, "type" | "config">,
  text: string,
): string | null {
  const checked = toColumns(field, valueOfDraft(field, text));
  if (checked.ok) return null;
  return checked.message.charAt(0).toUpperCase() + checked.message.slice(1);
}
