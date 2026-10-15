// ─── The filter tree in the address (BARY-166) ─────────────────────────────
//
// Board, list and saved views keep their whole state in the URL. Up to V5
// a filter there was a flat "any of" list per field (`status=todo,done`).
// The tree (`filter.ts`) can say more — "is not", "is empty", "at least",
// dates, OR groups — and this is how that reads in the address:
//
//   status=todo,done            any of           (unchanged)
//   status.not=done             none of
//   label.empty=1               is empty         (`.set=1`: is not empty)
//   label.all=bug,ui            all of
//   priority.gte=high           at least         (`.lte`: at most)
//   dueDate.within=next_7_days  relative range   (`.before`/`.after`: a day)
//   dueDate=overdue,none        the due-date buckets of the chip (unchanged)
//   q=login                     text
//   or=priority.gte:high;dueDate.within:next_7_days|label:bug
//                               OR groups: rules `key:values` joined by `;`,
//                               groups joined by `|`
//   or=assignee:@me~dueDate.within:overdue;priority:urgent
//                               inside: `;` is OR, `~` is AND (binds
//                               tighter), parentheses nest as deep as needed:
//   or=status:todo~(label:bug;(priority:high~assignee:@me))
//
// `@me` is whoever looks, `_none` "not set" inside a list. Values are slugs
// (priority key, user handle, label/project slug) — readable links that
// survive a rename of nothing but ids. `parseFilterParams` gives a tree with
// those slugs, `resolveFilterValues` swaps them for ids (the server with
// the database, the client with its lookups), `filterToParams` goes back.
//
// No dependencies beyond `filter.ts` — runs in the client and the server.

import {
  FILTER_FIELD_KEYS,
  FILTER_FIELDS,
  type FilterField,
  type FilterGroup,
  type FilterNode,
  type FilterOp,
  type FilterRule,
  type IssueFilter,
  isGroup,
  ME,
  mapNode,
  NONE_VALUE,
  rulesIn,
} from "./filter";

/** URL suffix per operator — `any` has none. */
const SUFFIX: Record<Exclude<FilterOp, "contains">, string> = {
  any: "",
  none: "not",
  all: "all",
  empty: "empty",
  notEmpty: "set",
  gte: "gte",
  lte: "lte",
  before: "before",
  after: "after",
  within: "within",
};
const OP_OF_SUFFIX = new Map(
  Object.entries(SUFFIX).map(([op, suffix]) => [suffix, op as FilterOp]),
);

/** The due-date buckets the chip offers, and the rule each one stands for. */
const DUE_BUCKET_RULES: Record<string, FilterRule> = {
  overdue: { field: "dueDate", is: "within", value: "overdue" },
  today: { field: "dueDate", is: "within", value: "today" },
  week: { field: "dueDate", is: "within", value: "next_7_days" },
  none: { field: "dueDate", is: "empty" },
};

/** Which bucket a rule is, if it is one. */
export function dueBucketOf(rule: FilterRule): string | null {
  if (rule.field !== "dueDate") return null;
  if (rule.is === "empty") return "none";
  if (rule.is !== "within") return null;
  if (rule.value === "overdue") return "overdue";
  if (rule.value === "today") return "today";
  if (rule.value === "next_7_days") return "week";
  return null;
}

const isListOp = (is: FilterOp) =>
  is === "any" || is === "none" || is === "all";

/** `field` or `field.suffix` → field and operator; `null` for any other key. */
export function parseFilterKey(
  key: string,
): { field: FilterField; is: FilterOp } | null {
  const [name, suffix = ""] = key.split(".", 2);
  if (!(FILTER_FIELD_KEYS as string[]).includes(name) || name === "text")
    return null;
  const field = name as FilterField;
  const is = OP_OF_SUFFIX.get(suffix);
  if (!is) return null;
  if (!(FILTER_FIELDS[field].ops as readonly FilterOp[]).includes(is))
    // `dueDate=` is the bucket list — the only "any" a date field has.
    return field === "dueDate" && is === "any" ? { field, is } : null;
  return { field, is };
}

/** Whether a URL parameter is part of the filter (for "unsaved"). */
export function isFilterParam(key: string): boolean {
  return key === "q" || key === "or" || parseFilterKey(key) !== null;
}

function ruleFrom(
  field: FilterField,
  is: FilterOp,
  raw: string,
): FilterRule | FilterRule[] | null {
  if (is === "empty" || is === "notEmpty")
    return raw === "1" ? { field, is } : null;
  if (field === "dueDate" && is === "any") {
    // The chip's buckets: one rule each, OR-ed by the caller.
    return raw
      .split(",")
      .flatMap((b) => (DUE_BUCKET_RULES[b] ? [DUE_BUCKET_RULES[b]] : []));
  }
  if (isListOp(is)) {
    const values = raw.split(",").filter(Boolean);
    return values.length ? { field, is, value: values } : null;
  }
  return raw ? { field, is, value: raw } : null;
}

function rulesFromEntry(key: string, raw: string): FilterRule[] {
  const parsed = parseFilterKey(key);
  if (!parsed) return [];
  const rule = ruleFrom(parsed.field, parsed.is, raw);
  if (!rule) return [];
  return Array.isArray(rule) ? rule : [rule];
}

/** One `key:values` part of an expression — or the due-date buckets of a
 *  bare `dueDate:overdue,none`, OR-ed. */
function nodeOfPart(part: string): FilterNode | null {
  const at = part.indexOf(":");
  const found =
    at === -1
      ? rulesFromEntry(part, "1")
      : rulesFromEntry(part.slice(0, at), part.slice(at + 1));
  if (!found.length) return null;
  return found.length === 1 ? found[0] : { op: "or", rules: found };
}

/** Joins parts under one operator: drops the empty, unwraps a single one. */
function joined(op: "and" | "or", parts: (FilterNode | null)[]) {
  const kept = parts.filter((n): n is FilterNode => n !== null);
  if (!kept.length) return null;
  return kept.length === 1 ? kept[0] : { op, rules: kept };
}

/**
 * `a~b;(c;d~e)` → a tree: `;` is OR, `~` AND (binding tighter), parentheses
 * group. Lenient — an unclosed parenthesis closes at the end, a stray one is
 * skipped — since a link may have been edited by hand.
 */
function parseExpression(source: string): FilterNode | null {
  let at = 0;
  const orExpr = (): FilterNode | null => {
    const parts = [andExpr()];
    while (source[at] === ";") {
      at++;
      parts.push(andExpr());
    }
    return joined("or", parts);
  };
  const andExpr = (): FilterNode | null => {
    const parts = [atom()];
    while (source[at] === "~") {
      at++;
      parts.push(atom());
    }
    return joined("and", parts);
  };
  const atom = (): FilterNode | null => {
    if (source[at] === "(") {
      at++;
      const inner = orExpr();
      if (source[at] === ")") at++;
      return inner;
    }
    const start = at;
    while (at < source.length && !"();~".includes(source[at])) at++;
    const node = nodeOfPart(source.slice(start, at));
    // A stray ")" would stop the parse for good; step over it.
    if (source[at] === ")" && start === at) at++;
    return node;
  };
  const parts: (FilterNode | null)[] = [];
  while (at < source.length) {
    const before = at;
    parts.push(orExpr());
    if (at === before) at++;
  }
  return joined("and", parts);
}

/**
 * The URL's filter as a tree, values still as they stand in the URL (slugs,
 * `@me`, `_none`). Unknown keys are ignored; a parameter that yields
 * nothing leaves no rule.
 */
export function parseFilterParams(
  params: URLSearchParams | Record<string, string | undefined>,
): IssueFilter {
  const entries: [string, string][] =
    params instanceof URLSearchParams
      ? [...params.entries()]
      : Object.entries(params).flatMap(([k, v]) =>
          v === undefined ? [] : [[k, v] as [string, string]],
        );

  const rules: FilterNode[] = [];
  for (const [key, raw] of entries) {
    if (key === "q") {
      const q = raw.trim();
      if (q) rules.push({ field: "text", is: "contains", value: q });
      continue;
    }
    if (key === "or") {
      for (const segment of raw.split("|")) {
        const node = parseExpression(segment);
        if (node) rules.push(node);
      }
      continue;
    }
    const found = rulesFromEntry(key, raw);
    if (found.length === 1) rules.push(found[0]);
    else if (found.length > 1) rules.push({ op: "or", rules: found });
  }
  return { op: "and", rules };
}

/** Turns one value of a rule into another — or `null` to drop it. */
export type ValueMapper = (
  field: FilterField,
  value: string | number,
) => string | number | null;

/**
 * The same tree with every value mapped (slug → id or back). A list that
 * loses all its values drops the rule, a group that loses all its rules
 * drops the group — the same "a stale link shows more, not nothing" rule as
 * before.
 */
export function mapFilterValues(
  filter: IssueFilter,
  map: ValueMapper,
): IssueFilter {
  const mapRule = (rule: FilterRule): FilterRule | null => {
    if (rule.value === undefined || rule.field === "text") return rule;
    // Relative tokens and plain dates aren't references.
    if (FILTER_FIELDS[rule.field].kind === "date") return rule;
    if (Array.isArray(rule.value)) {
      const values = rule.value.flatMap((v) => {
        if (v === ME || v === NONE_VALUE) return [v];
        const out = map(rule.field, v);
        return out === null ? [] : [out];
      });
      return values.length ? { ...rule, value: values } : null;
    }
    const out = map(rule.field, rule.value);
    return out === null ? null : { ...rule, value: out };
  };
  const rules = filter.rules.flatMap((node) => {
    const out = mapNode(node, mapRule);
    return out ? [out] : [];
  });
  return { op: "and", rules };
}

/** Slugs per field that need looking up — everything but the tokens. */
export function slugsByField(
  filter: IssueFilter,
): Partial<Record<FilterField, string[]>> {
  const out: Partial<Record<FilterField, Set<string>>> = {};
  const visit = (rule: FilterRule) => {
    const values = Array.isArray(rule.value)
      ? rule.value
      : rule.value === undefined
        ? []
        : [rule.value];
    for (const v of values) {
      if (v === ME || v === NONE_VALUE || typeof v !== "string") continue;
      const set = out[rule.field] ?? new Set<string>();
      set.add(v);
      out[rule.field] = set;
    }
  };
  for (const node of filter.rules) {
    rulesIn(node).forEach(visit);
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, set]) => [k, [...(set as Set<string>)]]),
  ) as Partial<Record<FilterField, string[]>>;
}

function encodeValue(rule: FilterRule): string {
  if (rule.is === "empty" || rule.is === "notEmpty") return "1";
  if (Array.isArray(rule.value)) return rule.value.join(",");
  return String(rule.value ?? "");
}

function keyOf(rule: FilterRule): string {
  const suffix = SUFFIX[rule.is as Exclude<FilterOp, "contains">];
  return suffix ? `${rule.field}.${suffix}` : rule.field;
}

/** The OR group as the chip's due-date buckets, if that's all it is. */
function bucketsOf(group: FilterGroup): string[] | null {
  if (group.op !== "or" || group.rules.some(isGroup)) return null;
  const buckets = (group.rules as FilterRule[]).map(dueBucketOf);
  return buckets.every((b) => b !== null) ? (buckets as string[]) : null;
}

/**
 * A tree (values already as slugs) as URL parameters. Top-level rules get a
 * key of their own; a second rule with the same key, and every OR group,
 * goes into `or`. Due-date buckets keep their short form, so the chip and
 * old links read the same.
 */
export function filterToParams(filter: IssueFilter): [string, string][] {
  const out: [string, string][] = [];
  const used = new Set<string>();
  const groups: string[] = [];
  const encodeRule = (r: FilterRule) => `${keyOf(r)}:${encodeValue(r)}`;
  // AND binds tighter than OR: only an OR inside an AND needs parentheses.
  const encodeNode = (node: FilterNode, inAnd = false): string => {
    if (!isGroup(node)) return encodeRule(node);
    const inner = node.rules
      .map((child) => encodeNode(child, node.op === "and"))
      .join(node.op === "and" ? "~" : ";");
    return node.op === "or" && inAnd ? `(${inner})` : inner;
  };

  for (const node of filter.rules) {
    if (isGroup(node)) {
      const buckets = bucketsOf(node);
      if (buckets && !used.has("dueDate")) {
        used.add("dueDate");
        out.push(["dueDate", buckets.join(",")]);
      } else groups.push(encodeNode(node));
      continue;
    }
    if (node.field === "text") {
      if (!used.has("q")) {
        used.add("q");
        out.push(["q", String(node.value ?? "")]);
      }
      continue;
    }
    const bucket = dueBucketOf(node);
    const key = bucket ? "dueDate" : keyOf(node);
    if (used.has(key)) {
      groups.push(encodeRule(node));
      continue;
    }
    used.add(key);
    out.push([key, bucket ?? encodeValue(node)]);
  }
  if (groups.length) out.push(["or", groups.join("|")]);
  return out;
}

// ─── Slugs ↔ ids ────────────────────────────────────────────────────────────

/** What it takes to turn ids into the URL's slugs and back. */
export interface SlugLookups {
  priorities: { id: number; key: string }[];
  members: { id: string; handle: string }[];
  labels: { id: string; slug: string }[];
  /** Cross-project views only. */
  projects?: { id: string; slug: string }[];
}

/** Slug → id, from lookups. `projects: false` drops project rules (a
 *  project's own board has nothing to narrow there). */
export function slugToId(
  lookups: SlugLookups,
  { projects = true }: { projects?: boolean } = {},
): ValueMapper {
  const priority = new Map(lookups.priorities.map((p) => [p.key, p.id]));
  const user = new Map(lookups.members.map((m) => [m.handle, m.id]));
  const label = new Map(lookups.labels.map((l) => [l.slug, l.id]));
  const project = new Map((lookups.projects ?? []).map((p) => [p.slug, p.id]));
  return (field, value) => {
    const slug = String(value);
    switch (field) {
      case "priority":
        return priority.get(slug) ?? null;
      case "assignee":
      case "reporter":
        return user.get(slug) ?? null;
      case "label":
        return label.get(slug) ?? null;
      case "project":
        return projects ? (project.get(slug) ?? null) : null;
      case "storyPoints":
      case "estimate": {
        const n = Number(slug);
        return Number.isFinite(n) ? n : null;
      }
      default:
        return slug;
    }
  };
}

/** Id → slug, for writing a tree into the URL. */
export function idToSlug(lookups: SlugLookups): ValueMapper {
  const priority = new Map(lookups.priorities.map((p) => [p.id, p.key]));
  const user = new Map(lookups.members.map((m) => [m.id, m.handle]));
  const label = new Map(lookups.labels.map((l) => [l.id, l.slug]));
  const project = new Map((lookups.projects ?? []).map((p) => [p.id, p.slug]));
  return (field, value) => {
    switch (field) {
      case "priority":
        return priority.get(Number(value)) ?? null;
      case "assignee":
      case "reporter":
        return user.get(String(value)) ?? null;
      case "label":
        return label.get(String(value)) ?? null;
      case "project":
        return project.get(String(value)) ?? null;
      default:
        return value;
    }
  };
}
