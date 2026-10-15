// ─── The filter chips on top of the filter tree (BARY-166) ─────────────────
//
// The chips are the quick way to filter: one per field, "is / is not" and a
// list of values. Underneath is the same tree the editor edits; this reads
// a chip's state out of it and writes a chip's change back. Everything the
// chips can't show (an "at least", a date, an OR group) stays in the tree
// and shows as a rule chip of its own (`extraNodes`).

import {
  type FilterGroup,
  type FilterNode,
  type FilterRule,
  type IssueFilter,
  isGroup,
  rulesIn,
} from "@/features/issues/filter";
import { dueBucketOf } from "@/features/issues/filter-url";

/** The fields with a chip of their own. */
export const CHIP_FIELDS = [
  "status",
  "priority",
  "type",
  "assignee",
  "label",
  "project",
  "storyPoints",
] as const;
export type ChipField = (typeof CHIP_FIELDS)[number];

type Node = FilterNode;

const isChipField = (field: string): field is ChipField =>
  (CHIP_FIELDS as readonly string[]).includes(field);

/** A top-level "any/none of a list" rule — what a chip shows. */
function isChipRule(node: Node, field?: string): boolean {
  return (
    !isGroup(node) &&
    isChipField(node.field) &&
    (field === undefined || node.field === field) &&
    (node.is === "any" || node.is === "none") &&
    Array.isArray(node.value)
  );
}

/** The due-date chip's node: one bucket rule, or an OR group of them. */
function isBucketNode(node: Node): boolean {
  if (isGroup(node))
    return (
      node.op === "or" &&
      node.rules.every((m) => !isGroup(m) && dueBucketOf(m) !== null)
    );
  return dueBucketOf(node) !== null;
}

/** What a field's chip shows. */
export function chipState(
  filter: IssueFilter,
  field: ChipField,
): { values: (string | number)[]; negated: boolean } {
  const rule = filter.rules.find((n) => isChipRule(n, field)) as
    | FilterRule
    | undefined;
  return {
    values: (rule?.value as (string | number)[] | undefined) ?? [],
    negated: rule?.is === "none",
  };
}

/** The tree with a field's chip set to `values` — removed when empty. */
export function withChip(
  filter: IssueFilter,
  field: ChipField,
  values: (string | number)[],
  negated: boolean,
): IssueFilter {
  const index = filter.rules.findIndex((n) => isChipRule(n, field));
  const rules = [...filter.rules];
  const next: FilterRule = {
    field,
    is: negated ? "none" : "any",
    value: values,
  };
  if (values.length === 0) {
    if (index !== -1) rules.splice(index, 1);
  } else if (index === -1) rules.push(next);
  else rules[index] = next;
  return { op: "and", rules };
}

/** The due-date chip's buckets (`overdue`, `today`, `week`, `none`). */
export function dueBuckets(filter: IssueFilter): string[] {
  const node = filter.rules.find(isBucketNode);
  if (!node) return [];
  const rules = rulesIn(node);
  return rules.map((r) => dueBucketOf(r) as string);
}

const BUCKET_RULES: Record<string, FilterRule> = {
  overdue: { field: "dueDate", is: "within", value: "overdue" },
  today: { field: "dueDate", is: "within", value: "today" },
  week: { field: "dueDate", is: "within", value: "next_7_days" },
  none: { field: "dueDate", is: "empty" },
};

/** The tree with the due-date chip set to `buckets`. */
export function withDueBuckets(
  filter: IssueFilter,
  buckets: string[],
): IssueFilter {
  const rules = filter.rules.filter((n) => !isBucketNode(n));
  const own = buckets.flatMap((b) =>
    BUCKET_RULES[b] ? [BUCKET_RULES[b]] : [],
  );
  if (own.length === 1) rules.push(own[0]);
  else if (own.length > 1) rules.push({ op: "or", rules: own });
  return { op: "and", rules };
}

/** Everything the chips don't show — each becomes a rule chip. The search
 *  text has its own box and isn't one. */
export function extraNodes(
  filter: IssueFilter,
): { node: Node; index: number }[] {
  return filter.rules.flatMap((node, index) =>
    isChipRule(node) ||
    isBucketNode(node) ||
    (!isGroup(node) && node.field === "text")
      ? []
      : [{ node, index }],
  );
}

/**
 * The tree without the node at `index` — or, with a `path`, without just
 * that part inside it (child indexes, level by level), the group tidied up
 * after (`tidy`).
 */
export function withoutNode(
  filter: IssueFilter,
  index: number,
  path: number[] = [],
): IssueFilter {
  const drop = (node: FilterNode, rest: number[]): FilterNode | null => {
    if (!rest.length || !isGroup(node)) return null;
    const [at, ...deeper] = rest;
    const rules = node.rules.flatMap((child, i) => {
      if (i !== at) return [child];
      const kept = drop(child, deeper);
      return kept ? [kept] : [];
    });
    return tidy({ op: node.op, rules });
  };
  const rules = filter.rules.flatMap((node, i) => {
    if (i !== index) return [node];
    const kept = drop(node, path);
    if (!kept) return [];
    // An AND left on top joins the top level, where the chips see it.
    return isGroup(kept) && kept.op === "and" ? kept.rules : [kept];
  });
  return { op: "and", rules };
}

/** The tree without anything but the search text. */
export function onlySearch(filter: IssueFilter): IssueFilter {
  return {
    op: "and",
    rules: filter.rules.filter((n) => !isGroup(n) && n.field === "text"),
  };
}

/** How many conditions are set — chips count their values, every other
 *  rule (and every rule of a group) counts once. */
export function conditionCount(filter: IssueFilter): number {
  return filter.rules.reduce((sum, node) => {
    if (isGroup(node)) return sum + rulesIn(node).length;
    if (node.field === "text") return sum;
    if (isChipRule(node))
      return sum + ((node as FilterRule).value as unknown[]).length;
    return sum + 1;
  }, 0);
}

// ─── The editor's boxes (BARY-166) ─────────────────────────────────────────
//
// The editor shows the filter as boxes: each says "all of these" or "one of
// these" and holds conditions and further boxes, as deep as anyone likes.
// The outermost box is the whole filter. While editing it may hold what the
// URL can't — an empty box, a box of one — so the editor keeps its own copy
// and writes a tidied one (`tidy`).

/** The outermost box for a filter (the search text left out): "one of
 *  these" when the filter is nothing but one OR group, else "all of these". */
export function rootBox(filter: IssueFilter): FilterGroup {
  const own = filter.rules.filter((n) => isGroup(n) || n.field !== "text");
  if (own.length === 1 && isGroup(own[0]) && own[0].op === "or")
    return { op: "or", rules: own[0].rules };
  return { op: "and", rules: own };
}

/** A box without empty boxes, boxes of one unwrapped, a box inside a box
 *  of the same kind merged into it; `null` when nothing is left. */
export function tidy(node: FilterNode): FilterNode | null {
  if (!isGroup(node)) return node;
  const rules = node.rules.flatMap((child) => {
    const out = tidy(child);
    if (!out) return [];
    return isGroup(out) && out.op === node.op ? out.rules : [out];
  });
  if (!rules.length) return null;
  return rules.length === 1 ? rules[0] : { op: node.op, rules };
}

/** The outermost box back as a filter, the search text (`keep`) appended:
 *  "all of these" puts its parts on top, where the chips can show them. */
export function fromRootBox(
  box: FilterGroup,
  keep: FilterRule[] = [],
): IssueFilter {
  const out = tidy(box);
  const rules = !out
    ? []
    : isGroup(out) && out.op === "and"
      ? out.rules
      : [out];
  return { op: "and", rules: [...rules, ...keep] };
}
