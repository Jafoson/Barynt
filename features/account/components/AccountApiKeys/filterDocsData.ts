import {
  FILTER_FIELD_KEYS,
  FILTER_FIELDS,
  type FilterField,
  type FilterOp,
  NULLABLE_FIELDS,
  RELATIVE_DATES,
} from "@/features/issues/filter";
import type { DocText } from "./docText";
import type { GuideRow } from "./GuideParts";

// The filter guide in the API and MCP docs (BARY-172) — how a filter tree
// is built, in the order a newcomer needs it: the idea, one rule, the
// fields, the operators, special values, recipes. In both languages
// (`DocText`); the JSON itself stays as it's sent.
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

export const FILTER_DOC_INTRO: DocText[] = [
  {
    en: 'A filter is a list of rules. An issue matches when every rule matches — that\'s what "op": "and" at the top means.',
    de: 'Ein Filter ist eine Liste von Regeln. Ein Issue passt, wenn jede Regel passt — das bedeutet "op": "and" ganz oben.',
  },
  {
    en: "Each rule names a field, how to compare (is), and a value. The example reads: assigned to me, and priority high or urgent.",
    de: "Jede Regel nennt ein Feld, wie verglichen wird (is) und einen Wert. Das Beispiel heißt: mir zugewiesen und Priorität hoch oder dringend.",
  },
  {
    en: 'Need "either … or …"? Put the rules in a group with "op": "or". Groups go anywhere a rule can, and can hold further groups.',
    de: 'Du brauchst „entweder … oder …“? Pack die Regeln in eine Gruppe mit "op": "or". Gruppen stehen überall, wo eine Regel stehen kann, und können weitere Gruppen enthalten.',
  },
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

export const FILTER_DOC_GROUP_TEXT: DocText = {
  en: "Bugs that are urgent or overdue: the top-level rules are AND-ed, the group's rules are OR-ed.",
  de: "Bugs, die dringend oder überfällig sind: Die Regeln oben gelten alle (UND), die in der Gruppe reicht eine (ODER).",
};

/** One rule's three keys. */
export const FILTER_DOC_RULE_KEYS: GuideRow[] = [
  {
    name: "field",
    type: "string",
    desc: {
      en: "What to look at — see Fields below.",
      de: "Worauf geschaut wird — siehe Felder unten.",
    },
  },
  {
    name: "is",
    type: "string",
    desc: {
      en: "How to compare — see Comparisons below. Each field allows only some.",
      de: "Wie verglichen wird — siehe Vergleiche unten. Jedes Feld erlaubt nur bestimmte.",
    },
  },
  {
    name: "value",
    type: "list | number | string",
    desc: {
      en: 'Depends on "is": a list for any/none/all, a number for gte/lte, a date for before/after, a range name for within, text for contains — and no value at all for empty/notEmpty.',
      de: 'Hängt von "is" ab: eine Liste bei any/none/all, eine Zahl bei gte/lte, ein Datum bei before/after, ein Zeitraum-Name bei within, Text bei contains — und gar kein Wert bei empty/notEmpty.',
    },
  },
];

/** What each field holds and where its values come from. */
const FIELD_INFO: Record<FilterField, { what: DocText; values: DocText }> = {
  status: {
    what: { en: "The issue's status.", de: "Der Status des Issues." },
    values: {
      en: "Status ids from GET /api/v1/workspaces/{id}/statuses (list_statuses).",
      de: "Status-IDs aus GET /api/v1/workspaces/{id}/statuses (list_statuses).",
    },
  },
  statusCategory: {
    what: {
      en: "The status's phase — the same in every workspace, whatever the statuses are called.",
      de: "Die Phase des Status — in jedem Workspace gleich, egal wie die Status heißen.",
    },
    values: '"backlog", "unstarted", "started", "completed", "canceled".',
  },
  priority: {
    what: { en: "The priority.", de: "Die Priorität." },
    values: {
      en: "0 none, 1 low, 2 medium, 3 high, 4 urgent.",
      de: "0 keine, 1 niedrig, 2 mittel, 3 hoch, 4 dringend.",
    },
  },
  type: {
    what: { en: "The issue type.", de: "Der Issue-Typ." },
    values: {
      en: 'Type ids as issues show them in "type", e.g. "bug", "feature", "task".',
      de: 'Typ-IDs, wie Issues sie in "type" zeigen, z. B. "bug", "feature", "task".',
    },
  },
  assignee: {
    what: { en: "Who it's assigned to.", de: "Wem es zugewiesen ist." },
    values: {
      en: 'User ids from GET /api/v1/workspaces/{id}/members, "@me", or "_none" for unassigned.',
      de: 'User-IDs aus GET /api/v1/workspaces/{id}/members, "@me", oder "_none" für nicht zugewiesen.',
    },
  },
  reporter: {
    what: { en: "Who created it.", de: "Wer es angelegt hat." },
    values: { en: 'User ids, or "@me".', de: 'User-IDs oder "@me".' },
  },
  label: {
    what: {
      en: "Its labels. any = has one of them, all = has every one, none = has none of them.",
      de: "Seine Labels. any = hat eines davon, all = hat alle, none = hat keines davon.",
    },
    values: {
      en: 'Label ids from GET /api/v1/workspaces/{id}/labels, or "_none" for no label.',
      de: 'Label-IDs aus GET /api/v1/workspaces/{id}/labels, oder "_none" für kein Label.',
    },
  },
  project: {
    what: {
      en: "Its project — useful in cross-project views and workspace-wide queries.",
      de: "Sein Projekt — nützlich in projektübergreifenden Views und Abfragen über den Workspace.",
    },
    values: {
      en: "Project ids from GET /api/v1/workspaces/{id}/projects.",
      de: "Projekt-IDs aus GET /api/v1/workspaces/{id}/projects.",
    },
  },
  storyPoints: {
    what: { en: "Story points.", de: "Story Points." },
    values: {
      en: 'Numbers; "_none" in a list for issues without points.',
      de: 'Zahlen; "_none" in einer Liste für Issues ohne Punkte.',
    },
  },
  estimate: {
    what: {
      en: "The time estimate, always in hours.",
      de: "Die Zeitschätzung, immer in Stunden.",
    },
    values: {
      en: "A number of hours, e.g. 2.5.",
      de: "Eine Stundenzahl, z. B. 2.5.",
    },
  },
  dueDate: {
    what: { en: "The due date.", de: "Das Fälligkeitsdatum." },
    values: {
      en: 'A day "YYYY-MM-DD" or "today"; for within, a range name (see Special values).',
      de: 'Ein Tag "YYYY-MM-DD" oder "today"; bei within ein Zeitraum-Name (siehe Besondere Werte).',
    },
  },
  created: {
    what: { en: "When it was created.", de: "Wann es angelegt wurde." },
    values: {
      en: 'A day "YYYY-MM-DD" or "today"; for within, a range name.',
      de: 'Ein Tag "YYYY-MM-DD" oder "today"; bei within ein Zeitraum-Name.',
    },
  },
  updated: {
    what: {
      en: "When it last changed.",
      de: "Wann es zuletzt geändert wurde.",
    },
    values: {
      en: 'A day "YYYY-MM-DD" or "today"; for within, a range name.',
      de: 'Ein Tag "YYYY-MM-DD" oder "today"; bei within ein Zeitraum-Name.',
    },
  },
  parent: {
    what: {
      en: "Its parent issue. empty = top-level issues only, notEmpty = sub-issues only.",
      de: "Sein übergeordnetes Issue. empty = nur Issues ganz oben, notEmpty = nur Sub-Issues.",
    },
    values: {
      en: 'Issue ids (the internal id, not "WEB-42").',
      de: 'Issue-IDs (die interne ID, nicht "WEB-42").',
    },
  },
  text: {
    what: {
      en: 'A search in title and description; a number or "WEB-42" also finds that issue.',
      de: 'Eine Suche in Titel und Beschreibung; eine Nummer oder "WEB-42" findet auch genau dieses Issue.',
    },
    values: { en: "Any text.", de: "Beliebiger Text." },
  },
};

export interface FilterDocField {
  field: FilterField;
  ops: readonly FilterOp[];
  what: DocText;
  values: DocText;
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
  { means: DocText; value: string }
> = {
  any: {
    means: { en: "is one of", de: "ist eines davon" },
    value: '["a", "b"]',
  },
  none: {
    means: {
      en: "is none of (issues without a value still match)",
      de: "ist keines davon (Issues ohne Wert passen trotzdem)",
    },
    value: '["a", "b"]',
  },
  all: {
    means: {
      en: "has all of (labels only)",
      de: "hat alle davon (nur Labels)",
    },
    value: '["a", "b"]',
  },
  empty: { means: { en: "is not set", de: "ist nicht gesetzt" }, value: "—" },
  notEmpty: { means: { en: "is set", de: "ist gesetzt" }, value: "—" },
  gte: { means: { en: "is at least", de: "ist mindestens" }, value: "3" },
  lte: { means: { en: "is at most", de: "ist höchstens" }, value: "3" },
  before: {
    means: {
      en: "is before that day (the day itself doesn't count)",
      de: "liegt vor diesem Tag (der Tag selbst zählt nicht)",
    },
    value: '"2026-10-31" | "today"',
  },
  after: {
    means: {
      en: "is after that day (the day itself doesn't count)",
      de: "liegt nach diesem Tag (der Tag selbst zählt nicht)",
    },
    value: '"2026-10-31" | "today"',
  },
  within: {
    means: {
      en: "falls in a named range",
      de: "liegt in einem benannten Zeitraum",
    },
    value: '"next_7_days"',
  },
  contains: {
    means: { en: "matches the text", de: "passt zum Text" },
    value: '"checkout"',
  },
};

const RANGE_TEXT: Record<(typeof RELATIVE_DATES)[number], DocText> = {
  overdue: { en: "For within: before today.", de: "Bei within: vor heute." },
  today: { en: "For within: today.", de: "Bei within: heute." },
  next_7_days: {
    en: "For within: today and the 6 days after.",
    de: "Bei within: heute und die 6 Tage danach.",
  },
  last_7_days: {
    en: "For within: today and the 6 days before.",
    de: "Bei within: heute und die 6 Tage davor.",
  },
  last_30_days: {
    en: "For within: today and the 29 days before.",
    de: "Bei within: heute und die 29 Tage davor.",
  },
};

const nullable = [...NULLABLE_FIELDS].join(", ");

/** "@me", "_none", "today" and the ranges for `within`. */
export const FILTER_DOC_SPECIAL: GuideRow[] = [
  {
    name: '"@me"',
    desc: {
      en: "Whoever is asking — the owner of the API key or OAuth token. A shared view with @me shows each person their own issues.",
      de: "Wer gerade fragt — der Besitzer des API-Keys oder OAuth-Tokens. Eine geteilte View mit @me zeigt jeder Person ihre eigenen Issues.",
    },
  },
  {
    name: '"_none"',
    desc: {
      en: `"Not set", as one entry in an any/none list: ["@me", "_none"] = assigned to me or to nobody. For ${nullable}.`,
      de: `„Nicht gesetzt“, als Eintrag in einer any/none-Liste: ["@me", "_none"] = mir oder niemandem zugewiesen. Für ${nullable}.`,
    },
  },
  {
    name: '"today"',
    desc: {
      en: "For before/after: the start of today, when the request runs.",
      de: "Bei before/after: der Beginn des heutigen Tages, wenn die Anfrage läuft.",
    },
  },
  ...RELATIVE_DATES.map((range) => ({
    name: `"${range}"`,
    desc: RANGE_TEXT[range],
  })),
];

/** Copy-paste starting points. */
export const FILTER_DOC_RECIPES: { title: DocText; code: string }[] = [
  {
    title: { en: "My open issues", de: "Meine offenen Issues" },
    code: `{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me"] },
    { "field": "statusCategory", "is": "none", "value": ["completed", "canceled"] }
  ]
}`,
  },
  {
    title: {
      en: "Due this week, not done",
      de: "Diese Woche fällig, nicht erledigt",
    },
    code: `{
  "op": "and",
  "rules": [
    { "field": "dueDate", "is": "within", "value": "next_7_days" },
    { "field": "statusCategory", "is": "any", "value": ["unstarted", "started"] }
  ]
}`,
  },
  {
    title: {
      en: "Unassigned or mine, high priority and up",
      de: "Nicht zugewiesen oder meine, ab Priorität hoch",
    },
    code: `{
  "op": "and",
  "rules": [
    { "field": "assignee", "is": "any", "value": ["@me", "_none"] },
    { "field": "priority", "is": "gte", "value": 3 }
  ]
}`,
  },
  {
    title: {
      en: "In progress, unchanged since a given day",
      de: "In Arbeit, seit einem bestimmten Tag unverändert",
    },
    code: `{
  "op": "and",
  "rules": [
    { "field": "statusCategory", "is": "any", "value": ["started"] },
    { "field": "updated", "is": "before", "value": "2026-09-21" }
  ]
}`,
  },
  {
    title: {
      en: "Top-level issues without an estimate",
      de: "Issues ganz oben ohne Schätzung",
    },
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
export const FILTER_DOC_USAGE: GuideRow[] = [
  {
    name: "GET /api/v1/projects/{id}/issues?filter=…",
    desc: {
      en: "As JSON, URL-encoded (encodeURIComponent(JSON.stringify(filter))). Combines with status, assignee and q.",
      de: "Als JSON, URL-kodiert (encodeURIComponent(JSON.stringify(filter))). Lässt sich mit status, assignee und q kombinieren.",
    },
  },
  {
    name: "POST /api/v1/projects/{id}/views, PATCH /api/v1/views/{id}",
    desc: {
      en: 'As "filter" in the JSON body. Saved with the view; GET /api/v1/views/{id}/issues applies it.',
      de: 'Als "filter" im JSON-Body. Wird mit der View gespeichert; GET /api/v1/views/{id}/issues wendet ihn an.',
    },
  },
  {
    name: "MCP list_issues, create_view, update_view",
    desc: {
      en: 'As the "filter" argument — a plain object, not a string.',
      de: 'Als Argument "filter" — ein normales Objekt, kein String.',
    },
  },
];

/** What usually goes wrong. */
export const FILTER_DOC_PITFALLS: DocText[] = [
  {
    en: 'The top level is always "op": "and". For OR, use a group inside it.',
    de: 'Ganz oben steht immer "op": "and". Für ODER nimm eine Gruppe darin.',
  },
  {
    en: 'Values are ids, not names: a label is "l_9f2a1b", not "frontend"; a status is "in_progress", not "In Progress".',
    de: 'Werte sind IDs, keine Namen: ein Label ist "l_9f2a1b", nicht "frontend"; ein Status ist "in_progress", nicht "In Progress".',
  },
  {
    en: 'any, none and all take a list, even for one value: ["bug"], not "bug".',
    de: 'any, none und all nehmen eine Liste, auch bei einem einzigen Wert: ["bug"], nicht "bug".',
  },
  {
    en: "An operator a field doesn't allow, or a value of the wrong kind, is rejected with 422 invalid_filter (MCP: invalid_input).",
    de: "Ein Vergleich, den ein Feld nicht erlaubt, oder ein Wert der falschen Art wird mit 422 invalid_filter abgelehnt (MCP: invalid_input).",
  },
  {
    en: "A rule whose ids no longer exist (a deleted label) drops out instead of matching nothing — the rest of the filter still applies.",
    de: "Eine Regel, deren IDs es nicht mehr gibt (ein gelöschtes Label), fällt weg, statt nichts zu finden — der Rest des Filters gilt weiter.",
  },
  {
    en: "Lists hold up to 50 rules each; groups can nest as deep as needed.",
    de: "Jede Liste fasst bis zu 50 Regeln; Gruppen lassen sich beliebig tief verschachteln.",
  },
];
