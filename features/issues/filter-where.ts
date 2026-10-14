import type { Prisma } from "@/lib/generated/prisma/client";
import type { StatusCategory } from "@/lib/status-category";
import {
  type FilterGroup,
  type FilterRule,
  type IssueFilter,
  isGroup,
  ME,
  type RelativeDate,
} from "./filter";

type Where = Prisma.IssueWhereInput;

/**
 * What `toIssueWhere` needs from outside. The two lookups are passed in
 * rather than imported so this file stays free of the database — the tests
 * hand in plain functions, `queries.ts` hands in the real ones.
 */
export interface FilterContext {
  /** Resolves `@me`. `null` (no session) drops `@me` from a rule. */
  userId: string | null;
  /** The moment relative dates are measured from. */
  now: Date;
  /** Ids of the statuses in these categories (`statusCategory` rules). */
  statusIdsIn: (categories: StatusCategory[]) => Promise<string[]>;
  /** Full-text matches for a search (`text` rules). */
  searchIds: (q: string) => Promise<string[]>;
}

/** Local midnight of `date`, plus `days`. Same local-time convention the
 *  due-date buckets used before BARY-162. */
function dayStart(date: Date, days = 0): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/** `[from, to)` for a relative range — either end may be open. */
function relativeRange(
  token: RelativeDate,
  now: Date,
): { gte?: Date; lt?: Date } {
  const today = dayStart(now);
  switch (token) {
    case "overdue":
      return { lt: today };
    case "today":
      return { gte: today, lt: dayStart(now, 1) };
    case "next_7_days":
      return { gte: today, lt: dayStart(now, 7) };
    case "last_7_days":
      return { gte: dayStart(now, -6), lt: dayStart(now, 1) };
    case "last_30_days":
      return { gte: dayStart(now, -29), lt: dayStart(now, 1) };
  }
}

/** `today` or `YYYY-MM-DD` as local midnight; `null` for anything else. */
function parseDay(value: string, now: Date): Date | null {
  if (value === "today") return dayStart(now);
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_COLUMN = {
  dueDate: "dueDate",
  created: "created",
  updated: "updated",
} as const;

/** The issue number a search may also mean: `ORB-12` or `12`. Capped at
 *  nine digits so nothing exceeds the column's int range. */
function issueKeyOf(q: string): number | undefined {
  const digits = q.match(/^(?:[a-z]+-)?(\d{1,9})$/i)?.[1];
  return digits ? Number(digits) : undefined;
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * One rule as a `where` condition, or `null` when it constrains nothing —
 * no values left (all ids gone, `@me` without a session), or a value of the
 * wrong shape. A rule that drops out widens the result rather than empty
 * it, the same rule a stale URL slug always followed.
 *
 * `none` on a nullable column keeps the rows where it's empty: "assignee
 * is not Mara" includes unassigned issues. A plain SQL `NOT IN` would drop
 * them, since `NULL NOT IN (…)` is never true.
 */
async function ruleWhere(
  rule: FilterRule,
  ctx: FilterContext,
): Promise<Where | null> {
  const { field, is, value } = rule;

  switch (field) {
    case "status":
    case "type": {
      const ids = list<string>(value);
      if (!ids.length) return null;
      return is === "none"
        ? { [field]: { notIn: ids } }
        : { [field]: { in: ids } };
    }

    case "statusCategory": {
      const categories = list<StatusCategory>(value);
      if (!categories.length) return null;
      const ids = await ctx.statusIdsIn(categories);
      return is === "none"
        ? { status: { notIn: ids } }
        : { status: { in: ids } };
    }

    case "priority": {
      if (is === "gte" || is === "lte")
        return typeof value === "number" ? { priority: { [is]: value } } : null;
      const values = list<number>(value);
      if (!values.length) return null;
      return is === "none"
        ? { priority: { notIn: values } }
        : { priority: { in: values } };
    }

    case "assignee":
    case "reporter": {
      const column = field === "assignee" ? "assigneeId" : "reporterId";
      if (is === "empty") return { [column]: null };
      if (is === "notEmpty") return { [column]: { not: null } };
      const ids = list<string>(value).flatMap((v) =>
        v === ME ? (ctx.userId ? [ctx.userId] : []) : [v],
      );
      if (!ids.length) return null;
      if (is === "none")
        return column === "assigneeId"
          ? { OR: [{ assigneeId: { notIn: ids } }, { assigneeId: null }] }
          : { reporterId: { notIn: ids } };
      return { [column]: { in: ids } };
    }

    case "label": {
      if (is === "empty") return { labels: { isEmpty: true } };
      if (is === "notEmpty") return { labels: { isEmpty: false } };
      const ids = list<string>(value);
      if (!ids.length) return null;
      if (is === "all") return { labels: { hasEvery: ids } };
      if (is === "none") return { NOT: { labels: { hasSome: ids } } };
      return { labels: { hasSome: ids } };
    }

    case "project": {
      const ids = list<string>(value);
      if (!ids.length) return null;
      return is === "none"
        ? { projectId: { notIn: ids } }
        : { projectId: { in: ids } };
    }

    case "storyPoints": {
      if (is === "empty") return { storyPoints: null };
      if (is === "notEmpty") return { storyPoints: { not: null } };
      if (is === "gte" || is === "lte")
        return typeof value === "number"
          ? { storyPoints: { [is]: value } }
          : null;
      const values = list<number>(value);
      if (!values.length) return null;
      return is === "none"
        ? { OR: [{ storyPoints: { notIn: values } }, { storyPoints: null }] }
        : { storyPoints: { in: values } };
    }

    case "estimate": {
      if (is === "empty") return { estimateHours: null };
      if (is === "notEmpty") return { estimateHours: { not: null } };
      return typeof value === "number"
        ? { estimateHours: { [is === "gte" ? "gte" : "lte"]: value } }
        : null;
    }

    case "dueDate":
    case "created":
    case "updated": {
      const column = DATE_COLUMN[field];
      if (is === "empty") return field === "dueDate" ? { dueDate: null } : null;
      if (is === "notEmpty")
        return field === "dueDate" ? { dueDate: { not: null } } : null;
      if (is === "within") {
        if (typeof value !== "string") return null;
        return { [column]: relativeRange(value as RelativeDate, ctx.now) };
      }
      const day = typeof value === "string" ? parseDay(value, ctx.now) : null;
      if (!day) return null;
      // "Before the 14th" ends at the start of the 14th; "after the 14th"
      // starts at the start of the 15th — the day itself belongs to neither.
      return is === "before"
        ? { [column]: { lt: day } }
        : { [column]: { gte: dayStart(day, 1) } };
    }

    case "parent": {
      if (is === "empty") return { parentId: null };
      if (is === "notEmpty") return { parentId: { not: null } };
      const ids = list<string>(value);
      return ids.length ? { parentId: { in: ids } } : null;
    }

    case "text": {
      const q = typeof value === "string" ? value.trim() : "";
      if (!q) return null;
      // "By title or ID": full-text matches, plus the issue number itself.
      const key = issueKeyOf(q);
      const ids = await ctx.searchIds(q);
      return {
        OR: [{ id: { in: ids } }, ...(key !== undefined ? [{ key }] : [])],
      };
    }
  }
}

async function groupWhere(
  group: FilterGroup,
  ctx: FilterContext,
): Promise<Where | null> {
  const parts = (
    await Promise.all(group.rules.map((r) => ruleWhere(r, ctx)))
  ).filter((w): w is Where => w !== null);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : { OR: parts };
}

/**
 * A filter tree as a Prisma `where` for `Issue` — the one path every board,
 * list and saved view queries through (BARY-162).
 *
 * The result is a single `AND`, so the caller can put its own scope
 * (project, visible projects, `parentId: null`) next to it without either
 * side overwriting the other's keys.
 */
export async function toIssueWhere(
  filter: IssueFilter,
  ctx: FilterContext,
): Promise<Where> {
  const parts = (
    await Promise.all(
      filter.rules.map((node) =>
        isGroup(node) ? groupWhere(node, ctx) : ruleWhere(node, ctx),
      ),
    )
  ).filter((w): w is Where => w !== null);
  return parts.length ? { AND: parts } : {};
}
