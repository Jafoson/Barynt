// ─── Configurable fields of the board card / list row (BARY-33) ────────────
//
// Dependency-free, same reasoning as `features/projects/detail-fields.ts`:
// no DB, no `server-only`, no React. The server side needs the list to
// validate what gets written; the UI needs it to render the "Display"
// dropdown and to decide what to show on an actual card/row.
//
// Deliberately the same keys as `DetailFieldKey` (a subset of them) rather
// than a parallel catalog: `BoardCard`/`ListView` already gate exactly these
// four behind `visibleDetailFields` for BARY-31 — this is the same set,
// just toggled per person instead of per project. The rest of what a card
// or row shows (title, identifier, status, type, assignee) is structural
// and always on, same as `DETAIL_FIELDS`' permanent fields.

import type { DetailFieldKey } from "@/features/projects/detail-fields";

export const CARD_FIELD_KEYS = [
  "priority",
  "labels",
  "storyPoints",
  "dueDate",
] as const satisfies readonly DetailFieldKey[];

export type CardFieldKey = (typeof CARD_FIELD_KEYS)[number];

export function isCardFieldKey(value: string): value is CardFieldKey {
  return (CARD_FIELD_KEYS as readonly string[]).includes(value);
}

/**
 * Turns a stored `hiddenFields` list into the set of card/row fields this
 * person still wants to see — unknown keys (an older version of this list)
 * are dropped rather than trusted.
 */
export function visibleCardFields(hidden: string[]): Set<CardFieldKey> {
  const hiddenSet = new Set(hidden.filter(isCardFieldKey));
  return new Set(CARD_FIELD_KEYS.filter((key) => !hiddenSet.has(key)));
}
