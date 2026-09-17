// ─── Configurable fields of the issue detail view (BARY-31) ────────────────
//
// Dependency-free: no DB, no `server-only`, no React — same reasoning as
// `features/dashboard/widgets.ts`. The server side needs the list to
// validate what gets written; the UI needs it to render the settings page
// and to decide what to show on an actual issue. Three readers, one source
// of truth.

/** Every field of the issue detail view a project can turn on or off. */
export const DETAIL_FIELD_KEYS = [
  "type",
  "status",
  "priority",
  "assignee",
  "description",
  "attachments",
  "labels",
  "relations",
  "dueDate",
  "storyPoints",
  "estimateHours",
] as const;

export type DetailFieldKey = (typeof DETAIL_FIELD_KEYS)[number];

export interface DetailFieldDef {
  key: DetailFieldKey;
  /** Icon in the settings list. */
  icon: string;
  /**
   * Fields that can't be turned off — and don't even appear as a toggle in
   * the settings list, permanently on rather than shown as a locked switch.
   *
   * Type, status, and assignee are the everyday attributes every workflow
   * relies on regardless of what this project happens to track; description
   * is what an issue fundamentally *is* — title and description, without
   * either it's not really an issue. Priority stays optional: unlike the
   * other three it's genuinely skippable for teams that don't triage by it.
   */
  permanent?: boolean;
}

export const DETAIL_FIELDS: DetailFieldDef[] = [
  { key: "type", icon: "lucide:shapes", permanent: true },
  { key: "status", icon: "lucide:circle-dot", permanent: true },
  { key: "priority", icon: "lucide:signal-high" },
  { key: "assignee", icon: "lucide:user-round", permanent: true },
  { key: "description", icon: "lucide:file-text", permanent: true },
  { key: "attachments", icon: "lucide:paperclip" },
  { key: "labels", icon: "lucide:tag" },
  { key: "relations", icon: "lucide:link" },
  { key: "dueDate", icon: "lucide:calendar" },
  { key: "storyPoints", icon: "lucide:hash" },
  { key: "estimateHours", icon: "lucide:hourglass" },
];

/** Fields the settings page actually offers a toggle for — permanent ones
 *  are left off the list entirely rather than shown as a locked switch. */
export const CONFIGURABLE_DETAIL_FIELDS: DetailFieldDef[] =
  DETAIL_FIELDS.filter((field) => !field.permanent);

const BY_KEY = new Map(DETAIL_FIELDS.map((field) => [field.key, field]));

export function detailFieldDef(key: DetailFieldKey): DetailFieldDef {
  const found = BY_KEY.get(key);
  // Can't happen as long as `DetailFieldKey` derives from `DETAIL_FIELDS` —
  // and if it did, it would be a missing entry, not a minor issue.
  if (!found) throw new Error(`Unknown detail field: ${key}`);
  return found;
}

/** Is this a field that actually exists? Filters what comes from the database. */
export function isDetailFieldKey(value: string): value is DetailFieldKey {
  return (DETAIL_FIELD_KEYS as readonly string[]).includes(value);
}

/**
 * The three planning fields (BARY-4) start hidden, everything else starts
 * visible — applied once, at project creation
 * (`createProject`/`createProjectForUser`) and by this feature's own
 * migration for projects that already existed. `visibleDetailFields` below
 * doesn't re-derive this default; a project's `hiddenDetailFields` column is
 * the one source of truth for it from that point on, same as
 * `DashboardPreference.hidden` is for widgets once a row exists.
 */
export const DEFAULT_HIDDEN_DETAIL_FIELDS: DetailFieldKey[] = [
  "dueDate",
  "storyPoints",
  "estimateHours",
];

/**
 * Turns a project's stored `hiddenDetailFields` into the set of fields
 * actually visible.
 *
 * The stored list is a wish, not truth: it can contain keys from an older
 * version of this list, or (from before a field became permanent, or a bug)
 * one of today's non-deselectable fields. Both are filtered out here rather
 * than trusted — an unknown key is ignored, not treated as "hide
 * something", and a permanent field is always visible regardless of what's
 * stored.
 */
export function visibleDetailFields(hidden: string[]): Set<DetailFieldKey> {
  const hiddenSet = new Set(hidden.filter(isDetailFieldKey));
  return new Set(
    DETAIL_FIELD_KEYS.filter(
      (key) => !hiddenSet.has(key) || detailFieldDef(key).permanent,
    ),
  );
}
