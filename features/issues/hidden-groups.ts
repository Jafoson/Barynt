// ─── Hidden board columns / list groups (BARY-47) ──────────────────────────
//
// Dependency-free like `card-fields.ts`: the server validates what it stores,
// the UI decides what to draw. An entry is `"<groupKey>:<groupId>"`, so
// switching the grouping (status → priority) neither hides the wrong groups
// nor loses the choice made under the other grouping.

import type { GroupDef, GroupKey } from "@/features/issues/group";

/** Generous upper bounds — a stored list is user input, not a trusted one. */
const MAX_ENTRIES = 200;
const MAX_ENTRY_LENGTH = 120;

export function hiddenGroupEntry(key: GroupKey, groupId: string): string {
  return `${key}:${groupId}`;
}

/** Drops anything that isn't a plausible entry, and duplicates. */
export function sanitizeHiddenGroups(hidden: unknown): string[] {
  if (!Array.isArray(hidden)) return [];
  const entries = hidden.filter(
    (entry): entry is string =>
      typeof entry === "string" &&
      entry.length > 0 &&
      entry.length <= MAX_ENTRY_LENGTH,
  );
  return [...new Set(entries)].slice(0, MAX_ENTRIES);
}

/** Which view a list of hidden groups belongs to. */
export type GroupView = "board" | "list";

/**
 * Off by default on the board: a status that isn't a workflow column
 * (Canceled) would only be a column of its own that nobody asked for. The
 * list shows it whenever issues are in it, as it always has. Turning such a
 * group on is stored as `"+<entry>"`, the opposite of a hidden one.
 */
function hiddenByDefault(group: GroupDef, view: GroupView): boolean {
  return view === "board" && group.key === "status" && !group.alwaysShow;
}

/** Whether this person doesn't see `group` in `view` — their choice, or the default. */
export function isGroupHidden(
  list: string[],
  group: GroupDef,
  view: GroupView,
): boolean {
  const entry = hiddenGroupEntry(group.key, group.id);
  if (list.includes(entry)) return true;
  return hiddenByDefault(group, view) && !list.includes(`+${entry}`);
}

/** The list after flipping `group`'s visibility — only ever stores a deviation from the default. */
export function toggleGroupHidden(
  list: string[],
  group: GroupDef,
  view: GroupView,
): string[] {
  const entry = hiddenGroupEntry(group.key, group.id);
  const hiddenNow = isGroupHidden(list, group, view);
  const rest = list.filter((e) => e !== entry && e !== `+${entry}`);
  const byDefault = hiddenByDefault(group, view);
  if (hiddenNow) return byDefault ? [...rest, `+${entry}`] : rest;
  return byDefault ? rest : [...rest, entry];
}
