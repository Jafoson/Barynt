// ─── Grouping of board columns / list groups (BARY-35) ─────────────────────

import { STORY_POINTS_OPTIONS } from "@/features/issues/story-points";
import type { IssuePatch } from "@/features/issues/types";
import type { Issue, IssueType, Priority, Status, User } from "@/types";

export const GROUP_KEYS = [
  "status",
  "priority",
  "type",
  "assignee",
  "storyPoints",
  // Across projects only (V8) — moving a card between projects isn't a drag.
  "project",
] as const;

export type GroupKey = (typeof GROUP_KEYS)[number];

export function isGroupKey(value: string): value is GroupKey {
  return (GROUP_KEYS as readonly string[]).includes(value);
}

/** Reads `?group=` — "status" (the only grouping before BARY-35) for anything missing or stale. */
export function groupKeyFromParam(value: string | undefined): GroupKey {
  return value && isGroupKey(value) ? value : "status";
}

/**
 * Reads `?lanes=` (BARY-173): the board's second grouping, as horizontal
 * swimlanes. `null` for none, a stale value, or the same grouping as the
 * columns — a lane per column value would only repeat the columns.
 */
export function laneKeyFromParam(
  value: string | null | undefined,
  groupKey: GroupKey,
): GroupKey | null {
  return value && isGroupKey(value) && value !== groupKey ? value : null;
}

/** A lane as stored in `collapsedLanes` — "<laneKey>:<laneId>", like the
 *  `hidden-groups.ts` entries, so another lane grouping never matches. */
export function laneEntry(key: GroupKey, id: string): string {
  return `${key}:${id}`;
}

export interface GroupLookups {
  statuses: Status[];
  priorities: Priority[];
  issueTypes: IssueType[];
  members: User[];
  /** Given only across projects (V8) — where grouping by project exists. */
  projects?: { id: string; name: string; color: string }[];
}

export interface GroupLabels {
  unassigned: string;
  noStoryPoints: string;
}

export interface GroupDef {
  key: GroupKey;
  /** What `groupIdOf` returns for the issues in this group. */
  id: string;
  label: string;
  color?: string;
  member?: User;
  /** Shown even when empty (a workflow status, a priority) — the rest only with issues. */
  alwaysShow: boolean;
}

const NONE = "none";

export function groupIdOf(issue: Issue, key: GroupKey): string {
  switch (key) {
    case "status":
      return issue.status;
    case "priority":
      return String(issue.priority);
    case "type":
      return issue.type;
    case "assignee":
      return issue.assignee ?? NONE;
    case "storyPoints":
      return issue.storyPoints === null ? NONE : String(issue.storyPoints);
    case "project":
      return issue.project;
  }
}

/** Every group that could exist for `key`, in display order. */
export function groupDefs(
  key: GroupKey,
  { statuses, priorities, issueTypes, members, projects = [] }: GroupLookups,
  labels: GroupLabels,
  issues: Issue[],
): GroupDef[] {
  switch (key) {
    case "status":
      return statuses.map((s) => ({
        key,
        id: s.id,
        label: s.name,
        color: s.color,
        alwaysShow: s.isColumn,
      }));
    case "priority":
      return [...priorities]
        .sort((a, b) => b.id - a.id)
        .map((p) => ({
          key,
          id: String(p.id),
          label: p.name,
          color: p.color,
          alwaysShow: true,
        }));
    case "type":
      return issueTypes.map((t) => ({
        key,
        id: t.id,
        label: t.name,
        color: t.color,
        alwaysShow: true,
      }));
    case "assignee":
      return [
        ...members.map((m) => ({
          key,
          id: m.id,
          label: `${m.firstName} ${m.lastName}`.trim(),
          member: m,
          alwaysShow: false,
        })),
        { key, id: NONE, label: labels.unassigned, alwaysShow: true },
      ];
    case "storyPoints": {
      const values = new Set<number>(STORY_POINTS_OPTIONS);
      for (const i of issues)
        if (i.storyPoints !== null) values.add(i.storyPoints);
      return [
        ...[...values]
          .sort((a, b) => a - b)
          .map((n) => ({
            key,
            id: String(n),
            label: String(n),
            alwaysShow: false,
          })),
        { key, id: NONE, label: labels.noStoryPoints, alwaysShow: true },
      ];
    }
    case "project":
      return projects.map((p) => ({
        key,
        id: p.id,
        label: p.name,
        color: p.color,
        alwaysShow: false,
      }));
  }
}

/** Whether a card can be dragged into another group of `key` — not across
 *  projects (V8): that's a move with a new key, not a field change. */
export function canMoveBetweenGroups(key: GroupKey): boolean {
  return key !== "project";
}

/** The groups to actually draw: always-shown ones plus any with issues. */
export function visibleGroups(defs: GroupDef[], issues: Issue[]): GroupDef[] {
  const used = new Set(
    issues.map((i) => groupIdOf(i, defs[0]?.key ?? "status")),
  );
  return defs.filter((d) => d.alwaysShow || used.has(d.id));
}

/** What moving an issue into group `id` changes on it. */
export function groupPatch(key: GroupKey, id: string): IssuePatch {
  switch (key) {
    case "status":
      return { status: id };
    case "priority":
      return { priority: Number(id) };
    case "type":
      return { type: id };
    case "assignee":
      return { assignee: id === NONE ? null : id };
    case "storyPoints":
      return { storyPoints: id === NONE ? null : Number(id) };
    case "project":
      // Not a field change (`canMoveBetweenGroups`).
      return {};
  }
}
