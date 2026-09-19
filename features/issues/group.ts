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
] as const;

export type GroupKey = (typeof GROUP_KEYS)[number];

export function isGroupKey(value: string): value is GroupKey {
  return (GROUP_KEYS as readonly string[]).includes(value);
}

/** Reads `?group=` — "status" (the only grouping before BARY-35) for anything missing or stale. */
export function groupKeyFromParam(value: string | undefined): GroupKey {
  return value && isGroupKey(value) ? value : "status";
}

export interface GroupLookups {
  statuses: Status[];
  priorities: Priority[];
  issueTypes: IssueType[];
  members: User[];
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
  }
}

/** Every group that could exist for `key`, in display order. */
export function groupDefs(
  key: GroupKey,
  { statuses, priorities, issueTypes, members }: GroupLookups,
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
  }
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
  }
}
