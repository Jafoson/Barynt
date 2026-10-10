// ─── Grouping of board columns / list groups (BARY-35) ─────────────────────

import { STORY_POINTS_OPTIONS } from "@/features/issues/story-points";
import type { IssuePatch } from "@/features/issues/types";
import type { FieldDefinition } from "@/lib/custom-fields";
import type { Issue, IssueType, Priority, Status, User } from "@/types";

export const GROUP_KEYS = [
  "status",
  "priority",
  "type",
  "assignee",
  "storyPoints",
] as const;

/** The groupings every workspace has. */
export type BuiltinGroupKey = (typeof GROUP_KEYS)[number];

/**
 * Grouping by a custom field: `cf:<fieldId>`. Only fields with a fixed set
 * of choices can be grouped by (`isGroupableField`); which fields exist is a
 * workspace matter, so a key from the address can name a field that is gone
 * (`resolveGroupKey` falls back to status then).
 */
export type CustomGroupKey = `cf:${string}`;

export type GroupKey = BuiltinGroupKey | CustomGroupKey;

const CUSTOM_PREFIX = "cf:";

export function customGroupKey(fieldId: string): CustomGroupKey {
  return `${CUSTOM_PREFIX}${fieldId}`;
}

export function isCustomGroupKey(value: string): value is CustomGroupKey {
  return value.startsWith(CUSTOM_PREFIX) && value.length > CUSTOM_PREFIX.length;
}

export function customFieldIdOf(key: CustomGroupKey): string {
  return key.slice(CUSTOM_PREFIX.length);
}

export function isGroupKey(value: string): value is GroupKey {
  return (
    (GROUP_KEYS as readonly string[]).includes(value) || isCustomGroupKey(value)
  );
}

/** Which custom fields can be a grouping: the ones with a list of choices. */
export function isGroupableField(
  field: Pick<FieldDefinition, "type">,
): boolean {
  return field.type === "SELECT" || field.type === "MULTI_SELECT";
}

/**
 * The key to actually use: a custom grouping whose field no longer exists,
 * was archived, or isn't groupable becomes status, like a stale `?group=`.
 */
export function resolveGroupKey(
  key: GroupKey,
  customFields: FieldDefinition[] = [],
): GroupKey {
  if (!isCustomGroupKey(key)) return key;
  const id = customFieldIdOf(key);
  const field = customFields.find((f) => f.id === id);
  return field && isGroupableField(field) ? key : "status";
}

/** The field a custom grouping is by, if there is one. */
export function groupField(
  key: GroupKey,
  customFields: FieldDefinition[] = [],
): FieldDefinition | null {
  if (!isCustomGroupKey(key)) return null;
  const id = customFieldIdOf(key);
  return customFields.find((f) => f.id === id) ?? null;
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
  /** Needed for a grouping by a custom field. */
  customFields?: FieldDefinition[];
}

export interface GroupLabels {
  unassigned: string;
  noStoryPoints: string;
  /** The group of issues without a value in a custom field. */
  noValue: string;
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

/**
 * Every group an issue belongs to under `key`. One for every built-in
 * grouping; for a multi-choice field, one per value — the issue then shows in
 * each of them — and the "no value" group when it has none.
 */
export function groupIdsOf(issue: Issue, key: GroupKey): string[] {
  if (!isCustomGroupKey(key)) return [groupIdOf(issue, key)];
  const value = issue.fieldValues?.[customFieldIdOf(key)];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.length > 0) return value;
  return [NONE];
}

/** The first group of the issue — the only one outside a multi-choice field. */
export function groupIdOf(issue: Issue, key: GroupKey): string {
  if (isCustomGroupKey(key)) return groupIdsOf(issue, key)[0] ?? NONE;
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
  { statuses, priorities, issueTypes, members, customFields }: GroupLookups,
  labels: GroupLabels,
  issues: Issue[],
): GroupDef[] {
  if (isCustomGroupKey(key)) {
    const field = groupField(key, customFields);
    if (!field || !isGroupableField(field)) return [];
    // Every choice is a group even while empty, so there is somewhere to
    // drop a card. Issues without a value gather in the first one, at the
    // left: it is the state every issue starts in.
    return [
      { key, id: NONE, label: labels.noValue, alwaysShow: true },
      ...field.options.map((o) => ({
        key,
        id: o.id,
        label: o.label,
        color: o.color ?? undefined,
        alwaysShow: true,
      })),
    ];
  }
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
  const key = defs[0]?.key ?? "status";
  const used = new Set(issues.flatMap((i) => groupIdsOf(i, key)));
  return defs.filter((d) => d.alwaysShow || used.has(d.id));
}

/**
 * What moving `issue` out of group `fromId` into group `toId` changes on it.
 *
 * For a multi-choice field this takes the value of the group it left and adds
 * the one it entered, so a card dragged from "Peter" to "Klaus" ends up with
 * Klaus and any other values it had; into the "no value" group it just loses
 * the value it left. For a single choice the value is replaced.
 */
export function groupMovePatch(
  issue: Issue,
  key: GroupKey,
  fromId: string | null,
  toId: string,
  field: FieldDefinition | null = null,
): IssuePatch {
  if (!isCustomGroupKey(key)) return groupPatch(key, toId);
  const fieldId = customFieldIdOf(key);

  if (field?.type !== "MULTI_SELECT") {
    return { fieldValues: { [fieldId]: toId === NONE ? null : toId } };
  }

  const current = issue.fieldValues?.[fieldId];
  let values = Array.isArray(current)
    ? current
    : typeof current === "string"
      ? [current]
      : [];
  if (fromId && fromId !== NONE) values = values.filter((v) => v !== fromId);
  if (toId !== NONE && !values.includes(toId)) values = [...values, toId];
  return { fieldValues: { [fieldId]: values.length > 0 ? values : null } };
}

/**
 * The issue's own copy of a move, for showing it before the server answers:
 * `fieldValues` of a patch carries `null` for "cleared".
 */
export function withMovePatch<T extends Issue>(issue: T, patch: IssuePatch): T {
  if (!patch.fieldValues) return { ...issue, ...(patch as Partial<T>) };
  const next = { ...(issue.fieldValues ?? {}) };
  for (const [id, value] of Object.entries(patch.fieldValues)) {
    if (value === null || value === undefined) delete next[id];
    else next[id] = value as never;
  }
  return { ...issue, fieldValues: next };
}

/** What moving an issue into group `id` changes on it. */
export function groupPatch(key: BuiltinGroupKey, id: string): IssuePatch {
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
