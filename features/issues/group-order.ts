// ─── Own order of board columns / list groups (BARY-165) ───────────────────
//
// Dependency-free like `hidden-groups.ts`, and with the same entries:
// `"<groupKey>:<groupId>"`, so an order made under one grouping (status)
// doesn't scramble another (priority).

import type { GroupDef } from "@/features/issues/group";
import { hiddenGroupEntry, sanitizeHiddenGroups } from "./hidden-groups";

/** Drops anything that isn't a plausible entry, and duplicates. */
export function sanitizeGroupOrder(order: unknown): string[] {
  return sanitizeHiddenGroups(order).filter((entry) => !entry.startsWith("+"));
}

/**
 * `defs` in the stored order. Groups the order doesn't mention — a status
 * added after it was saved, an assignee who wasn't on the board yet — keep
 * their place from the default order: each one goes right after the group
 * that precedes it there (or first, if nothing does). So a new group never
 * vanishes, and never lands at an arbitrary end.
 */
export function orderGroups<G extends GroupDef>(
  defs: G[],
  order: string[],
): G[] {
  if (order.length === 0) return defs;
  const entryOf = (g: G) => hiddenGroupEntry(g.key, g.id);
  const byEntry = new Map(defs.map((g) => [entryOf(g), g]));

  const result: G[] = [];
  for (const entry of order) {
    const group = byEntry.get(entry);
    if (group && !result.includes(group)) result.push(group);
  }
  if (result.length === 0) return defs;

  defs.forEach((group, index) => {
    if (result.includes(group)) return;
    const previous = defs
      .slice(0, index)
      .reverse()
      .find((g) => result.includes(g));
    const at = previous ? result.indexOf(previous) + 1 : 0;
    result.splice(at, 0, group);
  });
  return result;
}

/** The stored form of an order: every group's entry, in that order. */
export function groupOrderEntries(groups: GroupDef[]): string[] {
  return groups.map((g) => hiddenGroupEntry(g.key, g.id));
}

/**
 * The order after moving `moved` next to `target` — before it, or after it.
 * `groups` is the current order, including hidden groups, so they keep
 * their slots too.
 */
export function moveGroup<G extends GroupDef>(
  groups: G[],
  moved: G,
  target: G,
  place: "before" | "after",
): G[] {
  if (moved === target) return groups;
  const rest = groups.filter((g) => g !== moved);
  const at = rest.indexOf(target) + (place === "after" ? 1 : 0);
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}
