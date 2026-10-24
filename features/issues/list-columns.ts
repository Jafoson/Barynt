// ─── The list as a table: its columns (BARY-175) ────────────────────────────

import type { CardFieldKey } from "@/features/issues/card-fields";
import type { SortKey } from "@/features/issues/sort";

/** Every column the list can show, in no particular order. */
export const LIST_COLUMNS = [
  "priority",
  "identifier",
  "project",
  "status",
  "type",
  "title",
  "labels",
  "assignee",
  "storyPoints",
  "estimate",
  "dueDate",
  "created",
  "updated",
  "reporter",
  "comments",
] as const;

export type ListColumn = (typeof LIST_COLUMNS)[number];

/** Always there — what a row is. */
export const FIXED_LIST_COLUMNS: readonly ListColumn[] = [
  "identifier",
  "title",
];

/** What the list showed before columns could be chosen — still the start. */
export const DEFAULT_LIST_COLUMNS: readonly ListColumn[] = [
  "priority",
  "identifier",
  "project",
  "status",
  "type",
  "title",
  "labels",
  "assignee",
  "storyPoints",
  "dueDate",
  "updated",
];

export function isListColumn(value: string): value is ListColumn {
  return (LIST_COLUMNS as readonly string[]).includes(value);
}

/** A stored list, reduced to known columns, each once. */
export function sanitizeListColumns(list: readonly string[]): ListColumn[] {
  return [...new Set(list.filter(isListColumn))];
}

/**
 * The columns a list shows, in order. A list of its own wins; without one
 * the default, minus the card fields hidden before columns existed
 * (BARY-33) — so nobody's list changes by itself. Identifier and title are
 * always there, put back at their default place when a stored list lost
 * them.
 */
export function listColumns(
  stored: readonly string[] | undefined,
  hiddenCardFields: readonly string[] = [],
): ListColumn[] {
  const own = sanitizeListColumns(stored ?? []);
  const base =
    own.length > 0
      ? own
      : DEFAULT_LIST_COLUMNS.filter(
          (c) => !hiddenCardFields.includes(c as CardFieldKey),
        );
  const result = [...base];
  for (const fixed of FIXED_LIST_COLUMNS) {
    if (result.includes(fixed)) continue;
    const at = DEFAULT_LIST_COLUMNS.indexOf(fixed);
    result.splice(Math.min(at, result.length), 0, fixed);
  }
  return result;
}

/** What a column's header sorts by — none for those that don't order. */
export const COLUMN_SORT: Partial<Record<ListColumn, SortKey>> = {
  priority: "priority",
  status: "status",
  type: "type",
  title: "title",
  assignee: "assignee",
  storyPoints: "storyPoints",
  estimate: "estimate",
  dueDate: "dueDate",
  created: "created",
  updated: "updated",
};

/** The column a sort key belongs to. */
export function columnOfSort(key: SortKey): ListColumn | null {
  const hit = Object.entries(COLUMN_SORT).find(([, k]) => k === key);
  return hit ? (hit[0] as ListColumn) : null;
}

/** Columns with a sum below each group and the whole list. */
export const SUMMED_LIST_COLUMNS: readonly ListColumn[] = [
  "storyPoints",
  "estimate",
];

/** Columns a person can't make wider or narrower — the title takes the rest. */
export const UNSIZED_LIST_COLUMNS: readonly ListColumn[] = ["title"];

export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 640;

/** Stored widths, reduced to known columns and sane numbers. */
export function sanitizeColumnWidths(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, width] of Object.entries(value)) {
    if (!isListColumn(key) || UNSIZED_LIST_COLUMNS.includes(key)) continue;
    if (typeof width !== "number" || !Number.isFinite(width)) continue;
    out[key] = Math.round(
      Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)),
    );
  }
  return out;
}
