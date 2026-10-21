import {
  FILTER_FIELD_KEYS,
  FILTER_FIELDS,
  type FilterField,
  type FilterOp,
  NULLABLE_FIELDS,
  RELATIVE_DATES,
} from "@/features/issues/filter";

// The filter guide in the API and MCP docs (BARY-172) — how a filter tree
// is built, in the order a newcomer needs it: the idea, one rule, the
// fields, the operators, special values, recipes. English, like the rest
// of the docs content (the wire format is the contract).
//
// The field table is built from `FILTER_FIELDS` itself: which operators a
// field takes can't drift from what the server accepts, and a new field
// fails to compile here until it has a description.

/** The smallest useful filter — shown first, explained line by line. */
export const FILTER_DOC_FIRST_EXAMPLE = `{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me"] },
    { "field": "priority", "is": "gte", "value": 3 }
  ]
}`;

export const FILTER_DOC_INTRO = [
  'A filter is a list of rules. An issue matches when every rule matches — that\'s what "op": "and" at the top means.',
  "Each rule names a field, how to compare (is), and a value. The example reads: assigned to me, and priority high or urgent.",
  'Need "either … or …"? Put the rules in a group with "op": "or". Groups go anywhere a rule can, and can hold further groups.',
];

export const FILTER_DOC_GROUP_EXAMPLE = `{
  "op": "and",
  "rules": [
    { "field": "type", "is": "any", "value": ["bug"] },
    {
      "op": "or",
      "rules": [
        { "field": "priority", "is": "gte", "value": 4 },
        { "field": "dueDate", "is": "within", "value": "overdue" }
      ]
    }
  ]
}`;

export const FILTER_DOC_GROUP_TEXT =
  "Bugs that are urgent or overdue: the top-level rules are AND-ed, the group's rules are OR-ed.";

/** One rule's three keys. */
export const FILTER_DOC_RULE_KEYS = [
  {
    name: "field",
    type: "string",
    desc: "What to look at — see Fields below.",
  },
  {
    name: "is",
    type: "string",
    desc: "How to compare — see Operators below. Each field allows only some.",
  },
  {
    name: "value",
    type: "list | number | string",
    desc: 'Depends on "is": a list for any/none/all, a number for gte/lte, a date for before/after, a range name for within, text for contains — and no value at all for empty/notEmpty.',
  },
];

/** What each field holds and where its values come from. */
const FIELD_INFO: Record<FilterField, { what: string; values: string }> = {
  status: {
    what: "The issue's status.",
    values:
      "Status ids from GET /api/v1/workspaces/{id}/statuses (list_statuses).",
  },
  statusCategory: {
    what: "The status's phase — the same in every workspace, whatever the statuses are called.",
    values: '"backlog", "unstarted", "started", "completed", "canceled".',
  },
  priority: {
    what: "The priority.",
    values: "0 none, 1 low, 2 medium, 3 high, 4 urgent.",
  },
  type: {
    what: "The issue type.",
    values:
      'Type ids as issues show them in "type", e.g. "bug", "feature", "task".',
  },
  assignee: {
    what: "Who it's assigned to.",
    values:
      'User ids from GET /api/v1/workspaces/{id}/members, "@me", or "_none" for unassigned.',
  },
  reporter: {
    what: "Who created it.",
    values: 'User ids, or "@me".',
  },
  label: {
    what: "Its labels. any = has one of them, all = has every one, none = has none of them.",
    values:
      'Label ids from GET /api/v1/workspaces/{id}/labels, or "_none" for no label.',
  },
  project: {
    what: "Its project — useful in cross-project views and workspace-wide queries.",
    values: "Project ids from GET /api/v1/workspaces/{id}/projects.",
  },
  storyPoints: {
    what: "Story points.",
    values: 'Numbers; "_none" in a list for issues without points.',
  },
  estimate: {
    what: "The time estimate, always in hours.",
    values: "A number of hours, e.g. 2.5.",
  },
  dueDate: {
    what: "The due date.",
    values:
      'A day "YYYY-MM-DD" or "today"; for within, a range name (see Special values).',
  },
  created: {
    what: "When it was created.",
    values: 'A day "YYYY-MM-DD" or "today"; for within, a range name.',
  },
  updated: {
    what: "When it last changed.",
    values: 'A day "YYYY-MM-DD" or "today"; for within, a range name.',
  },
  parent: {
    what: "Its parent issue. empty = top-level issues only, notEmpty = sub-issues only.",
    values: 'Issue ids (the internal id, not "WEB-42").',
  },
  text: {
    what: 'A search in title and description; a number or "WEB-42" also finds that issue.',
    values: "Any text.",
  },
};

export interface FilterDocField {
  field: FilterField;
  ops: readonly FilterOp[];
  what: string;
  values: string;
  /** Takes "_none" in its lists. */
  nullable: boolean;
}

export const FILTER_DOC_FIELDS: FilterDocField[] = FILTER_FIELD_KEYS.map(
  (field) => ({
    field,
    ops: FILTER_FIELDS[field].ops,
    ...FIELD_INFO[field],
    nullable: NULLABLE_FIELDS.has(field),
  }),
);

/** Every operator: what it means, what value it takes. */
export const FILTER_DOC_OPS: Record<
  FilterOp,
  { means: string; value: string }
> = {
  any: { means: "is one of", value: '["a", "b"]' },
  none: {
    means: "is none of (issues without a value still match)",
    value: '["a", "b"]',
  },
  all: { means: "has all of (labels only)", value: '["a", "b"]' },
  empty: { means: "is not set", value: "— (leave value out)" },
  notEmpty: { means: "is set", value: "— (leave value out)" },
  gte: { means: "is at least", value: "3" },
  lte: { means: "is at most", value: "3" },
  before: {
    means: "is before that day (the day itself doesn't count)",
    value: '"2026-10-31" or "today"',
  },
  after: {
    means: "is after that day (the day itself doesn't count)",
    value: '"2026-10-31" or "today"',
  },
  within: { means: "falls in a named range", value: '"next_7_days"' },
  contains: { means: "matches the text", value: '"checkout"' },
};

/** "@me", "_none", "today" and the ranges for `within`. */
export const FILTER_DOC_SPECIAL = [
  {
    value: '"@me"',
    desc: "Whoever is asking — the owner of the API key or OAuth token. A shared view with @me shows each person their own issues.",
  },
  {
    value: '"_none"',
    desc: `"Not set", as one entry in an any/none list: ["@me", "_none"] = assigned to me or to nobody. For ${[...NULLABLE_FIELDS].join(", ")}.`,
  },
  {
    value: '"today"',
    desc: "For before/after: the start of today, when the request runs.",
  },
  ...RELATIVE_DATES.map((range) => ({
    value: `"${range}"`,
    desc: {
      overdue: "For within: before today.",
      today: "For within: today.",
      next_7_days: "For within: today and the 6 days after.",
      last_7_days: "For within: today and the 6 days before.",
      last_30_days: "For within: today and the 29 days before.",
    }[range],
  })),
];

/** Copy-paste starting points. */
export const FILTER_DOC_RECIPES = [
  {
    title: "My open issues",
    code: `{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me"] },
    { "field": "statusCategory", "is": "none", "value": ["completed", "canceled"] }
  ]
}`,
  },
  {
    title: "Due this week, not done",
    code: `{
  "op": "and",
  "rules": [
    { "field": "dueDate", "is": "within", "value": "next_7_days" },
    { "field": "statusCategory", "is": "any", "value": ["unstarted", "started"] }
  ]
}`,
  },
  {
    title: "Unassigned or mine, high priority and up",
    code: `{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me", "_none"] },
    { "field": "priority", "is": "gte", "value": 3 }
  ]
}`,
  },
  {
    title: "In progress, unchanged since a given day",
    code: `{
  "op": "and",
  "rules": [
    { "field": "statusCategory", "is": "any", "value": ["started"] },
    { "field": "updated", "is": "before", "value": "2026-09-21" }
  ]
}`,
  },
  {
    title: "Top-level issues without an estimate",
    code: `{
  "op": "and",
  "rules": [
    { "field": "parent", "is": "empty" },
    { "field": "estimate", "is": "empty" }
  ]
}`,
  },
];

/** Where a filter goes. */
export const FILTER_DOC_USAGE = [
  {
    where: "GET /api/v1/projects/{id}/issues?filter=…",
    how: "As JSON, URL-encoded (encodeURIComponent(JSON.stringify(filter))). Combines with status, assignee and q.",
  },
  {
    where: "POST /api/v1/projects/{id}/views, PATCH /api/v1/views/{id}",
    how: 'As "filter" in the JSON body. Saved with the view; GET /api/v1/views/{id}/issues applies it.',
  },
  {
    where: "MCP list_issues, create_view, update_view",
    how: 'As the "filter" argument — a plain object, not a string.',
  },
];

/** What usually goes wrong. */
export const FILTER_DOC_PITFALLS = [
  'The top level is always "op": "and". For OR, use a group inside it.',
  'Values are ids, not names: a label is "l_9f2a1b", not "frontend"; a status is "in_progress", not "In Progress".',
  'any, none and all take a list, even for one value: ["bug"], not "bug".',
  "An operator a field doesn't allow, or a value of the wrong kind, is rejected with 422 invalid_filter (MCP: invalid_input).",
  "A rule whose ids no longer exist (a deleted label) drops out instead of matching nothing — the rest of the filter still applies.",
  "Lists hold up to 50 rules each; groups can nest as deep as needed.",
];
