import type { FieldValue } from "@/lib/custom-fields/types";
import type { CustomFieldRow } from "./types";

// The custom fields a board card or a list row shows (BARY-81). Pure: no database, no React.
// A person chooses them per board or list (`shownCustomFields` on the view preference), the other way
// round from the built-in card fields (`card-fields.ts`, everything on by default): a card shows no
// custom field until someone asks for it, or every card of a workspace with fields would be a wall.

/** What a board or list shows of them: the shown fields, in their order, and the answers of its issues. */
export interface CardCustomFields {
  fields: CustomFieldRow[];
  /** `values[issueId][fieldId]`; an issue that has not answered a field has no entry. */
  values: Record<string, Record<string, FieldValue>>;
}

export const NO_CARD_FIELDS: CardCustomFields = { fields: [], values: {} };

/** At most this many shown at once: a card with more is no card. */
export const MAX_SHOWN_CUSTOM_FIELDS = 6;

/**
 * What a client says it wants shown, as a list of field ids: text only, each once, no longer than an
 * id can be, and no more than `MAX_SHOWN_CUSTOM_FIELDS`. Whether a field exists is decided when the
 * list is read (an id that is gone is ignored there), not here.
 */
export function sanitizeShownFields(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && id.length > 0 && id.length <= 64)
      seen.add(id);
    if (seen.size === MAX_SHOWN_CUSTOM_FIELDS) break;
  }
  return [...seen];
}

/** The chosen ids that are among these fields, in the order they were chosen: an id whose field is gone is not shown. */
export function shownAmong(
  shown: readonly string[],
  fields: readonly CustomFieldRow[],
): string[] {
  const known = new Set(fields.map((field) => field.id));
  return shown.filter((id) => known.has(id));
}

/** What one card or row shows: the shown fields the issue has an answer to, in the fields' order. */
export function cardEntries(
  custom: CardCustomFields,
  issueId: string,
): { field: CustomFieldRow; value: FieldValue }[] {
  const answers = custom.values[issueId];
  if (!answers) return [];
  const entries: { field: CustomFieldRow; value: FieldValue }[] = [];
  for (const field of custom.fields) {
    const value = Object.hasOwn(answers, field.id)
      ? answers[field.id]
      : undefined;
    if (value !== undefined) entries.push({ field, value });
  }
  return entries;
}
