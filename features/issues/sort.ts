// ─── Ordering within a board column / list group (BARY-34) ─────────────────

import { effectiveRank } from "@/features/issues/rank";
import type { Issue, IssueType, Status, User } from "@/types";

/**
 * "manual" is drag-and-drop — `rank.ts`'s `sortByRank`, unrelated to this
 * module. Every other key sorts every group the same way, board and list
 * alike.
 */
export const SORT_KEYS = [
  "manual",
  "priority",
  "type",
  "status",
  "storyPoints",
  "dueDate",
  "assignee",
  "estimate",
  "title",
  "created",
  "updated",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

/** Reads `?sort=` — "manual" (drag-and-drop) for anything missing or stale. */
export function sortKeyFromParam(value: string | undefined): SortKey {
  return value && isSortKey(value) ? value : "manual";
}

export interface SortLookups {
  statuses: Status[];
  issueTypes: IssueType[];
  members: User[];
}

function memberName(members: User[], id: string | null): string | null {
  if (!id) return null;
  const m = members.find((x) => x.id === id);
  return m ? `${m.firstName} ${m.lastName}` : null;
}

/** `null`/missing values always sort last, regardless of direction — an
 *  issue without a due date isn't "furthest away", it has none. */
function compareNullableNumber(
  a: number | null,
  b: number | null,
  descending: boolean,
): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return descending ? b - a : a - b;
}

/**
 * A comparator for `key`, or `null` for "manual" — drag-and-drop keeps
 * ownership of that case (`sortByRank`), this module never touches `rank`
 * as a primary key.
 *
 * Every comparator breaks ties by rank rather than leaving them at
 * whatever order the DB happened to return: two issues with the same
 * priority otherwise flip-flop across renders instead of settling into
 * their drag-and-drop order.
 */
export function compareIssues(
  key: SortKey,
  { statuses, issueTypes, members }: SortLookups,
): ((a: Issue, b: Issue) => number) | null {
  if (key === "manual") return null;

  const primary = (a: Issue, b: Issue): number => {
    switch (key) {
      case "priority":
        return b.priority - a.priority;
      case "type":
        return (
          issueTypes.findIndex((t) => t.id === a.type) -
          issueTypes.findIndex((t) => t.id === b.type)
        );
      case "status":
        return (
          statuses.findIndex((s) => s.id === a.status) -
          statuses.findIndex((s) => s.id === b.status)
        );
      case "storyPoints":
        return compareNullableNumber(a.storyPoints, b.storyPoints, true);
      case "dueDate":
        return compareNullableNumber(a.dueDate, b.dueDate, false);
      case "estimate":
        return compareNullableNumber(a.estimateHours, b.estimateHours, true);
      case "assignee": {
        const an = memberName(members, a.assignee);
        const bn = memberName(members, b.assignee);
        if (an === null) return bn === null ? 0 : 1;
        if (bn === null) return -1;
        return an.localeCompare(bn);
      }
      case "title":
        return a.title.localeCompare(b.title);
      case "created":
        return b.created - a.created;
      case "updated":
        return b.updated - a.updated;
      default:
        return 0;
    }
  };

  return (a, b) => primary(a, b) || effectiveRank(a) - effectiveRank(b);
}

/** Sorts `issues` by `key` within what's already one group — `manual`
 *  falls back to the existing rank order rather than being a no-op. */
export function sortByKey<T extends Issue>(
  issues: T[],
  key: SortKey,
  lookups: SortLookups,
): T[] {
  const cmp = compareIssues(key, lookups);
  if (!cmp)
    return [...issues].sort((a, b) => effectiveRank(a) - effectiveRank(b));
  return [...issues].sort(cmp);
}
