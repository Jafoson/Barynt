import { z } from "zod";
import { STATUS_CATEGORIES } from "@/lib/status-category";

/**
 * The filter of a board, a list or (later) a saved view, as a tree (BARY-162).
 *
 * Two levels and no deeper: the top is an AND of rules and OR groups, an OR
 * group holds plain rules. That covers "label is X and (priority ≥ high or
 * due within 7 days)" — almost every real filter — and keeps the editor
 * (V6) something a person can still read.
 *
 * Values are internal ids, not the slugs the URL shows: a saved view has
 * to survive a label being renamed. `filterFromUrl` builds a tree from the
 * URL's already-resolved ids; `toIssueWhere` (`filter-where.ts`) turns a
 * tree into a Prisma `where`. No dependencies here — runs in client
 * components, tests and server code alike.
 */

export const FILTER_OPS = [
  "any",
  "none",
  "all",
  "empty",
  "notEmpty",
  "gte",
  "lte",
  "before",
  "after",
  "within",
  "contains",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

/** Placeholder for "whoever is looking" — resolved at read time, so one
 *  shared view means "my issues" for every person who opens it. */
export const ME = "@me";

/** "Not set" as one of the values of an any/none rule (BARY-166): "assignee
 *  is me or nobody". Only for fields that can be empty (`NULLABLE_FIELDS`). */
export const NONE_VALUE = "_none";

/** Fields whose rules may list `NONE_VALUE`. */
export const NULLABLE_FIELDS = new Set<string>([
  "assignee",
  "label",
  "storyPoints",
]);

/** Relative date ranges for `within` (and `today` for `before`/`after`).
 *  Resolved against the moment of reading, like `@me`. */
export const RELATIVE_DATES = [
  "overdue",
  "today",
  "next_7_days",
  "last_7_days",
  "last_30_days",
] as const;
export type RelativeDate = (typeof RELATIVE_DATES)[number];

/** What kind of value a field's rules carry. */
type ValueKind =
  | "ids" // string ids (status, type, label, project, parent)
  | "users" // user ids or `@me`
  | "numbers" // priority, story points
  | "number" // estimate (hours)
  | "categories" // status categories
  | "date" // due, created, updated
  | "text"; // full-text search

interface FieldDef {
  kind: ValueKind;
  ops: readonly FilterOp[];
}

/**
 * Every field a rule can name, with the operators it allows. The one place
 * to extend: a new field (custom fields, BARY-129) gets an entry here and a
 * case in `toIssueWhere` — the schema, `filterFromUrl` and the editor read
 * from this list.
 */
export const FILTER_FIELDS = {
  status: { kind: "ids", ops: ["any", "none"] },
  statusCategory: { kind: "categories", ops: ["any", "none"] },
  priority: { kind: "numbers", ops: ["any", "none", "gte", "lte"] },
  type: { kind: "ids", ops: ["any", "none"] },
  assignee: { kind: "users", ops: ["any", "none", "empty", "notEmpty"] },
  reporter: { kind: "users", ops: ["any", "none"] },
  label: { kind: "ids", ops: ["any", "none", "all", "empty", "notEmpty"] },
  project: { kind: "ids", ops: ["any", "none"] },
  storyPoints: {
    kind: "numbers",
    ops: ["any", "none", "gte", "lte", "empty", "notEmpty"],
  },
  estimate: { kind: "number", ops: ["gte", "lte", "empty", "notEmpty"] },
  dueDate: {
    kind: "date",
    ops: ["before", "after", "within", "empty", "notEmpty"],
  },
  created: { kind: "date", ops: ["before", "after", "within"] },
  updated: { kind: "date", ops: ["before", "after", "within"] },
  parent: { kind: "ids", ops: ["any", "empty", "notEmpty"] },
  text: { kind: "text", ops: ["contains"] },
} as const satisfies Record<string, FieldDef>;

export type FilterField = keyof typeof FILTER_FIELDS;
export const FILTER_FIELD_KEYS = Object.keys(FILTER_FIELDS) as FilterField[];

export type FilterValue = string | number | (string | number)[];

export interface FilterRule {
  field: FilterField;
  is: FilterOp;
  /** Absent for `empty`/`notEmpty`. A list for `any`/`none`/`all`; a single
   *  number for `gte`/`lte`; an ISO date (`YYYY-MM-DD`) or `today` for
   *  `before`/`after`; a `RelativeDate` for `within`; text for `contains`. */
  value?: FilterValue;
}

export interface FilterGroup {
  op: "or";
  rules: FilterRule[];
}

export interface IssueFilter {
  op: "and";
  rules: (FilterRule | FilterGroup)[];
}

export const EMPTY_FILTER: IssueFilter = { op: "and", rules: [] };

export function isGroup(node: FilterRule | FilterGroup): node is FilterGroup {
  return "op" in node;
}

/**
 * The projects out of `allowed` that the filter can still match — known
 * before asking the database. Cross-project views use it as their scope, and
 * an empty result means there's nothing to query at all.
 *
 * Only top-level project rules count: they're AND-ed, so each one must hold.
 * A project rule inside an OR group may be outweighed by its siblings and
 * narrows nothing for certain — `toIssueWhere` still applies it.
 */
export function narrowProjects(
  filter: IssueFilter,
  allowed: Iterable<string>,
): string[] {
  let ids = [...allowed];
  for (const node of filter.rules) {
    if (isGroup(node) || node.field !== "project") continue;
    const values = Array.isArray(node.value) ? node.value : [];
    // A rule without values drops out in `toIssueWhere`, so it can't narrow
    // here either.
    if (!values.length) continue;
    ids =
      node.is === "none"
        ? ids.filter((id) => !values.includes(id))
        : ids.filter((id) => values.includes(id));
  }
  return ids;
}

// ─── Validation ─────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `value` has the shape `field`+`is` expects — the part a plain
 *  Zod union can't express, since it depends on both. */
function valueFits(field: FilterField, is: FilterOp, value: unknown): boolean {
  const { kind } = FILTER_FIELDS[field];
  if (is === "empty" || is === "notEmpty") return value === undefined;
  if (is === "any" || is === "none" || is === "all") {
    if (!Array.isArray(value)) return false;
    const plain = NULLABLE_FIELDS.has(field)
      ? value.filter((v) => v !== NONE_VALUE)
      : value;
    if (kind === "numbers") return plain.every((v) => typeof v === "number");
    if (kind === "categories")
      return plain.every((v) =>
        (STATUS_CATEGORIES as readonly unknown[]).includes(v),
      );
    return plain.every((v) => typeof v === "string");
  }
  if (is === "gte" || is === "lte")
    return typeof value === "number" && Number.isFinite(value);
  if (is === "within")
    return (RELATIVE_DATES as readonly unknown[]).includes(value);
  if (is === "before" || is === "after")
    return (
      typeof value === "string" && (value === "today" || ISO_DATE.test(value))
    );
  if (is === "contains") return typeof value === "string";
  return false;
}

const ruleSchema = z
  .object({
    field: z.enum(FILTER_FIELD_KEYS as [FilterField, ...FilterField[]]),
    is: z.enum(FILTER_OPS),
    value: z
      .union([
        z.string().max(500),
        z.number(),
        z.array(z.union([z.string().max(200), z.number()])).max(200),
      ])
      .optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const def = FILTER_FIELDS[rule.field];
    if (!(def.ops as readonly FilterOp[]).includes(rule.is)) {
      ctx.addIssue({
        code: "custom",
        message: `"${rule.is}" is not allowed for "${rule.field}"`,
      });
    } else if (!valueFits(rule.field, rule.is, rule.value)) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid value for "${rule.field} ${rule.is}"`,
      });
    }
  });

const groupSchema = z
  .object({ op: z.literal("or"), rules: z.array(ruleSchema).max(50) })
  .strict();

/** Validates a filter before it's stored (saved views, V3) or taken from an
 *  API call (V12). */
export const issueFilterSchema = z
  .object({
    op: z.literal("and"),
    rules: z.array(z.union([groupSchema, ruleSchema])).max(50),
  })
  .strict();

export function parseIssueFilter(input: unknown): IssueFilter | null {
  const result = issueFilterSchema.safeParse(input);
  return result.success ? (result.data as IssueFilter) : null;
}

// ─── From the URL ───────────────────────────────────────────────────────────

/** The URL filters after their slugs were looked up (`resolveIssueFilters`
 *  in `queries.ts`) — ids, not slugs. A slug that matched nothing is simply
 *  missing from its list. */
export interface ResolvedUrlFilters {
  statuses: string[];
  priorities: number[];
  assignees: string[];
  labels: string[];
  /** Cross-project views only. */
  projects: string[];
  storyPoints: number[];
  /** Buckets: `overdue`, `today`, `week`, `none` (BARY-4). */
  dueDate: string[];
  q?: string;
}

const DUE_BUCKETS: Record<string, FilterRule> = {
  overdue: { field: "dueDate", is: "within", value: "overdue" },
  today: { field: "dueDate", is: "within", value: "today" },
  week: { field: "dueDate", is: "within", value: "next_7_days" },
  none: { field: "dueDate", is: "empty" },
};

/**
 * The URL's flat filters as a tree: every parameter is one AND-ed rule,
 * several values of one parameter mean "any of them" — exactly what the
 * URL meant before BARY-162. The due-date buckets become an OR group of
 * their own ("overdue or no due date").
 *
 * A parameter whose slugs all matched nothing leaves no rule: the view then
 * shows everything instead of nothing, so a stale link doesn't end up on an
 * empty page.
 */
export function filterFromUrl(url: ResolvedUrlFilters): IssueFilter {
  const rules: (FilterRule | FilterGroup)[] = [];
  const anyOf = (field: FilterField, value: (string | number)[]) => {
    if (value.length) rules.push({ field, is: "any", value });
  };

  anyOf("status", url.statuses);
  anyOf("priority", url.priorities);
  anyOf("assignee", url.assignees);
  anyOf("label", url.labels);
  anyOf("project", url.projects);
  anyOf("storyPoints", url.storyPoints);

  const due = url.dueDate.flatMap((b) =>
    DUE_BUCKETS[b] ? [DUE_BUCKETS[b]] : [],
  );
  if (due.length === 1) rules.push(due[0]);
  else if (due.length > 1) rules.push({ op: "or", rules: due });

  const q = url.q?.trim();
  if (q) rules.push({ field: "text", is: "contains", value: q });

  return { op: "and", rules };
}

// ─── References that no longer exist ────────────────────────────────────────

/** Ids a field's rules can point at, as far as the caller knows them. */
export type KnownRefs = Partial<Record<FilterField, Set<string | number>>>;

export interface MissingRef {
  field: FilterField;
  value: string | number;
}

/**
 * Splits a stored filter into what still exists and what doesn't — a label
 * deleted, a person removed. The missing values are dropped from the
 * filter that gets applied (a rule left without values drops out, same as a
 * stale URL slug) and returned so the editor (V6) can show them as "no
 * longer exists" instead of the view silently showing more than before.
 *
 * Only fields the caller passes in `known` are checked; `@me` always counts
 * as known.
 */
export function pruneMissingRefs(
  filter: IssueFilter,
  known: KnownRefs,
): { filter: IssueFilter; missing: MissingRef[] } {
  const missing: MissingRef[] = [];

  const pruneRule = (rule: FilterRule): FilterRule | null => {
    const set = known[rule.field];
    if (!set || !Array.isArray(rule.value)) return rule;
    const kept = rule.value.filter((v) => {
      const ok = v === ME || set.has(v);
      if (!ok) missing.push({ field: rule.field, value: v });
      return ok;
    });
    if (kept.length === rule.value.length) return rule;
    return kept.length ? { ...rule, value: kept } : null;
  };

  const rules = filter.rules.flatMap((node): (FilterRule | FilterGroup)[] => {
    if (!isGroup(node)) {
      const rule = pruneRule(node);
      return rule ? [rule] : [];
    }
    const inner = node.rules.flatMap((r) => {
      const rule = pruneRule(r);
      return rule ? [rule] : [];
    });
    return inner.length ? [{ op: "or", rules: inner }] : [];
  });

  return { filter: { op: "and", rules }, missing };
}
