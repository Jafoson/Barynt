// ─── The filter chips on top of the filter tree (BARY-166) ─────────────────
//
// The chips are the quick way to filter: one per field, "is / is not" and a
// list of values. Underneath is the same tree the editor edits; this reads
// a chip's state out of it and writes a chip's change back. Everything the
// chips can't show (an "at least", a date, an OR group) stays in the tree
// and shows as a rule chip of its own (`extraNodes`).

import {
  type FilterGroup,
  type FilterRule,
  type IssueFilter,
  isGroup,
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

type Node = FilterRule | FilterGroup;

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
  if (isGroup(node)) return node.rules.every((r) => dueBucketOf(r) !== null);
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
  const rules = isGroup(node) ? node.rules : [node];
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

/** The tree without the node at `index`. */
export function withoutNode(filter: IssueFilter, index: number): IssueFilter {
  return { op: "and", rules: filter.rules.filter((_, i) => i !== index) };
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
    if (isGroup(node)) return sum + node.rules.length;
    if (node.field === "text") return sum;
    if (isChipRule(node))
      return sum + ((node as FilterRule).value as unknown[]).length;
    return sum + 1;
  }, 0);
}
