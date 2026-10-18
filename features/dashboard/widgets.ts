import { z } from "zod";
import { type IssueFilter, issueFilterSchema } from "@/features/issues/filter";

// ─── Dashboard widgets (BARY-169) ───────────────────────────────────────────
//
// Dependency-free: no DB, no `server-only`, no React. The server reads it to
// know what to compute, the UI to render and offer, the actions to validate.
//
// Widgets work like the ones on iOS and macOS: a few **fixed sizes** on a
// square grid instead of free resizing. A bigger size shows more, it doesn't
// just scale — and every kind only offers the sizes it looks good in. The
// grid is 8 columns on a desktop, 4 on a tablet and 2 on a phone; the order
// is the same everywhere and gaps fill themselves, so nobody keeps three
// layouts.

/** The sizes, small to large. `T` ("tall") is the narrow, high one; `W`
 *  ("wide") takes the whole row, one unit high — only the shortcuts have it. */
export const WIDGET_SIZES = ["S", "M", "L", "T", "XL", "W"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

/** Columns × rows each size takes on the grid. On a phone (2 columns) an
 *  `XL` is drawn as an `L` — see `dashboard.module.scss`. */
export const SIZE_SPAN: Record<WidgetSize, { cols: number; rows: number }> = {
  S: { cols: 1, rows: 1 },
  M: { cols: 2, rows: 1 },
  L: { cols: 2, rows: 2 },
  T: { cols: 2, rows: 4 },
  XL: { cols: 4, rows: 2 },
  /** Every column of the grid, whatever their number. */
  W: { cols: 8, rows: 1 },
};

export const WIDGET_TYPES = [
  "kpi",
  "progress",
  "distribution",
  "attention",
  "issues",
  "flow",
  "burnup",
  "cycle",
  "workload",
  "matrix",
  "age",
  "about",
  "members",
  "teams",
  "labels",
  "projects",
  "links",
  "shortcuts",
  "activity",
  "note",
  // A custom widget made of building blocks (BARY-170) — only the builder
  // makes these; the gallery doesn't list the kind itself.
  "blocks",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** What a number widget counts. */
export const KPI_METRICS = [
  "open",
  "inProgress",
  "inReview",
  "created",
  "closed",
  "overdue",
  "dueSoon",
  "unassigned",
  "urgent",
  "cycleTime",
  "total",
] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

/** Whether more of a metric is good news (green trend) or bad (red). */
export const METRIC_MORE_IS_GOOD: Record<KpiMetric, boolean> = {
  open: false,
  inProgress: true,
  inReview: true,
  created: true,
  closed: true,
  overdue: false,
  dueSoon: false,
  unassigned: false,
  urgent: false,
  cycleTime: false,
  total: true,
};

/** What a distribution or a matrix axis groups by. Labels only for the
 *  distribution — an issue with three labels would count three times in a
 *  matrix cell. */
export const GROUP_FIELDS = [
  "status",
  "statusCategory",
  "priority",
  "type",
  "assignee",
  "label",
  "project",
] as const;
export type GroupField = (typeof GROUP_FIELDS)[number];
export const MATRIX_FIELDS: GroupField[] = [
  "status",
  "priority",
  "type",
  "assignee",
  "project",
];

/** Where a shortcut tile can lead. Which ones a dashboard offers depends on
 *  the place (project or workspace) and the viewer's permissions. */
export const SHORTCUT_KEYS = [
  "board",
  "list",
  "myIssues",
  "createdByMe",
  "inbox",
  "workspaceDashboard",
  "projects",
  "views",
  "teams",
  "members",
  "roles",
  "labels",
  "fields",
  "invitations",
  "activity",
  "webhooks",
  "settings",
  "notifications",
  "account",
] as const;
export type ShortcutKey = (typeof SHORTCUT_KEYS)[number];

export const ISSUE_SORTS = [
  "updated",
  "created",
  "dueDate",
  "priority",
] as const;
export type IssueSort = (typeof ISSUE_SORTS)[number];

/** What a widget adds up (BARY-170): issues, or their story points or
 *  estimated hours. Custom number fields join here later (BARY-129). */
export const MEASURES = ["count", "storyPoints", "estimate"] as const;
export type Measure = (typeof MEASURES)[number];

/** The time axis of a time series: created and closed side by side (the
 *  classic), or one date alone — created, closed or due. */
export const TIME_BY = ["createdClosed", "created", "closed", "due"] as const;
export type TimeBy = (typeof TIME_BY)[number];

/** How a time series draws. */
export const SERIES_CHARTS = ["bars", "stacked", "line"] as const;
export type SeriesChart = (typeof SERIES_CHARTS)[number];

/** How a distribution draws: a ring with a legend, bars, or a table. */
export const DISTRIBUTION_CHARTS = ["ring", "bars", "table"] as const;
export type DistributionChart = (typeof DISTRIBUTION_CHARTS)[number];

/** The four backgrounds, each in the widget's accent. `fill` only where the
 *  content has no colors of its own (`WidgetDef.fill`). */
export const BACKGROUNDS = ["plain", "tint", "gradient", "fill"] as const;
export type WidgetBackground = (typeof BACKGROUNDS)[number];

/** Accent colors — the app's chart and named colors, plus pink and gray. */
export const ACCENTS = [
  "blue",
  "teal",
  "green",
  "lime",
  "ochre",
  "amber",
  "orange",
  "red",
  "pink",
  "purple",
  "indigo",
  "gray",
] as const;
export type WidgetAccent = (typeof ACCENTS)[number];

export interface ChartLabels {
  legend: boolean;
  axes: boolean;
  values: boolean;
}

/** Legend and axes on; values (numbers on bars and cells) too — a chart
 *  without its numbers answers "roughly" where people ask "how many". */
export const DEFAULT_LABELS: ChartLabels = {
  legend: true,
  axes: true,
  values: true,
};

export interface WidgetConfig {
  /** Own title; empty means the kind's (or the metric's) name. */
  title?: string;
  /** The widget's own filter, on top of the dashboard's. */
  filter?: IssueFilter;
  metric?: KpiMetric;
  groupBy?: GroupField;
  /** The matrix's second axis (columns). */
  groupBy2?: GroupField;
  chart?: DistributionChart;
  /** What is added up — issues by default. */
  measure?: Measure;
  /** Time series: which date, and split by what. */
  timeBy?: TimeBy;
  splitBy?: GroupField;
  seriesChart?: SeriesChart;
  /** Only issues that are still open. */
  openOnly?: boolean;
  sort?: IssueSort;
  labels?: ChartLabels;
  background?: WidgetBackground;
  accent?: WidgetAccent;
  /** The note's text. */
  text?: string;
  /** The widget's building blocks beyond its main part, in order
   *  (BARY-170). Unset: the kind's defaults. */
  elements?: WidgetElement[];
  /** The shortcut tiles shown, in order; unset means every one offered. */
  shortcuts?: ShortcutKey[];
  /** A custom widget's building blocks, top to bottom (`blocks` kind). */
  blocks?: WidgetBlock[];
}

/** The kinds a custom widget is built from — the configurable ones. */
export const BLOCK_TYPES = [
  "kpi",
  "progress",
  "distribution",
  "flow",
  "matrix",
  "issues",
] as const satisfies readonly WidgetType[];
export type BlockType = (typeof BLOCK_TYPES)[number];

/** What a block sets itself — what it counts and how; the widget keeps
 *  title, size, background and accent. Its filter adds to the widget's. */
export type BlockConfig = Pick<
  WidgetConfig,
  | "filter"
  | "metric"
  | "groupBy"
  | "groupBy2"
  | "chart"
  | "measure"
  | "timeBy"
  | "splitBy"
  | "seriesChart"
  | "openOnly"
  | "sort"
  | "labels"
  | "elements"
>;

/** One building block of a custom widget, with its own extras
 *  (`config.elements`). */
export interface WidgetBlock {
  id: string;
  type: BlockType;
  config: BlockConfig;
}

// ─── Elements ────────────────────────────────────────────────────────────────
//
// Every kind has one fixed main part (the number, the ring, the bars …) and
// a set of elements around it that can be added, ordered and removed —
// some with a small value of their own (a goal, a second filter, a count).

export const ELEMENT_KINDS = [
  // Chart labels — what used to be the three switches.
  "legend",
  "axes",
  "values",
  // Number
  "trend",
  "spark",
  "goal",
  "second",
  "miniList",
  "link",
  // Progress
  "breakdown",
  "deadline",
  "forecast",
  // Distribution
  "total",
  "percent",
  "topN",
  // Time series
  "average",
  "goalLine",
  "cumulative",
  "previous",
  "sumRow",
  // Matrix
  "rowTotals",
  "colTotals",
  "heatmap",
  "rowPercent",
  // Issue list: its columns, and how many rows
  "rows",
  "col_status",
  "col_assignee",
  "col_priority",
  "col_dueDate",
  "col_updated",
  "col_labels",
  "col_storyPoints",
] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** How an element draws — the choices `ELEMENT_OPTIONS` offers per kind. */
export const ELEMENT_STYLES = [
  "abs",
  "pct",
  "line",
  "area",
  "bars",
  "ring",
  "bar",
  "number",
  "percent",
  "both",
  "dashed",
  "top",
  "bottom",
  "all",
  "row",
  "date",
  "relative",
  "only",
  "beside",
] as const;
export type ElementStyle = (typeof ELEMENT_STYLES)[number];

export const ELEMENT_SORTS = ["priority", "updated", "dueDate"] as const;
export type ElementSort = (typeof ELEMENT_SORTS)[number];

/** "Ab Größe sichtbar": the smallest size an element shows in. */
export const ELEMENT_MIN_SIZES = ["S", "M", "L", "XL"] as const;
export type ElementMinSize = (typeof ELEMENT_MIN_SIZES)[number];

export interface WidgetElement {
  id: string;
  kind: ElementKind;
  /** goal, goalLine, topN, miniList, rows: a number; forecast: weeks. */
  value?: number;
  /** deadline: a day, `YYYY-MM-DD`. */
  date?: string;
  /** second: the extra condition the second number counts. */
  filter?: IssueFilter;
  /** Its own words — "dringend", "Release 2.4", the link's text. */
  label?: string;
  style?: ElementStyle;
  /** trend: colors turned round; topN: "Other" left out; average: labeled. */
  flag?: boolean;
  /** miniList: which issues come first. */
  sort?: ElementSort;
  color?: WidgetAccent;
  minSize?: ElementMinSize;
}

/** One setting of an element, as the editor shows it. */
export type ElementOption =
  | { key: "value"; min: number; max: number }
  | { key: "date" }
  | { key: "filter" }
  | { key: "label" }
  | { key: "style"; choices: readonly ElementStyle[] }
  | { key: "flag" }
  | { key: "sort" }
  | { key: "color" }
  | { key: "weeks" };

interface ElementDef {
  kind: ElementKind;
  icon: string;
  /** The starting value of `value`. */
  initial?: number;
}

const el = (kind: ElementKind, icon: string, initial?: number): ElementDef => ({
  kind,
  icon,
  initial,
});

const CHART_LABELS = [
  el("legend", "lucide:list"),
  el("axes", "lucide:move-horizontal"),
  el("values", "lucide:hash"),
];

/** What each kind can add, in the menu's order. */
export const ELEMENTS: Partial<Record<WidgetType, ElementDef[]>> = {
  kpi: [
    el("trend", "lucide:trending-up"),
    el("spark", "lucide:activity"),
    el("goal", "lucide:target", 20),
    el("second", "lucide:split"),
    el("miniList", "lucide:list", 3),
    el("link", "lucide:arrow-right"),
  ],
  progress: [
    el("breakdown", "lucide:chart-bar-stacked"),
    el("deadline", "lucide:calendar"),
    el("forecast", "lucide:telescope"),
    el("second", "lucide:split"),
  ],
  distribution: [
    el("legend", "lucide:list"),
    el("values", "lucide:hash"),
    el("total", "lucide:sigma"),
    el("percent", "lucide:percent"),
    el("topN", "lucide:list-ordered", 5),
  ],
  flow: [
    ...CHART_LABELS,
    el("average", "lucide:minus"),
    el("goalLine", "lucide:target", 10),
    el("cumulative", "lucide:trending-up"),
    el("previous", "lucide:history"),
    el("sumRow", "lucide:sigma"),
  ],
  matrix: [
    el("axes", "lucide:move-horizontal"),
    el("values", "lucide:hash"),
    el("heatmap", "lucide:grid-3x3"),
    el("rowTotals", "lucide:sigma"),
    el("colTotals", "lucide:sigma"),
    el("rowPercent", "lucide:percent"),
  ],
  issues: [
    el("rows", "lucide:rows-3", 8),
    el("col_status", "lucide:circle-dot"),
    el("col_assignee", "lucide:user"),
    el("col_priority", "lucide:signal-high"),
    el("col_dueDate", "lucide:calendar"),
    el("col_updated", "lucide:clock"),
    el("col_labels", "lucide:tag"),
    el("col_storyPoints", "lucide:gauge"),
    el("link", "lucide:arrow-right"),
  ],
  burnup: CHART_LABELS,
  cycle: CHART_LABELS,
  age: CHART_LABELS.filter((e) => e.kind !== "legend"),
  workload: CHART_LABELS,
};

/**
 * What each element can set, per widget kind (the same element may set
 * different things in different kinds — a link's text, the second number).
 * Every element also has "Ab Größe sichtbar" (`minSize`).
 */
const SECOND_OPTIONS: ElementOption[] = [
  { key: "label" },
  { key: "filter" },
  { key: "style", choices: ["number", "percent", "both"] },
];
const ELEMENT_OPTIONS: Partial<
  Record<WidgetType, Partial<Record<ElementKind, ElementOption[]>>>
> = {
  kpi: {
    trend: [{ key: "style", choices: ["abs", "pct"] }, { key: "flag" }],
    spark: [{ key: "style", choices: ["line", "area", "bars"] }],
    goal: [
      { key: "value", min: 1, max: 1_000_000 },
      { key: "style", choices: ["ring", "bar"] },
    ],
    second: SECOND_OPTIONS,
    miniList: [{ key: "value", min: 1, max: 10 }, { key: "sort" }],
    link: [{ key: "label" }],
  },
  progress: {
    deadline: [{ key: "date" }, { key: "label" }],
    forecast: [{ key: "weeks" }],
    second: SECOND_OPTIONS,
  },
  distribution: {
    total: [{ key: "label" }],
    percent: [{ key: "style", choices: ["only", "beside"] }],
    topN: [{ key: "value", min: 1, max: 20 }, { key: "flag" }],
  },
  flow: {
    legend: [{ key: "style", choices: ["top", "bottom"] }],
    average: [{ key: "flag" }],
    goalLine: [
      { key: "value", min: 0, max: 1_000_000 },
      { key: "label" },
      { key: "color" },
    ],
    previous: [{ key: "style", choices: ["dashed", "bars"] }],
    sumRow: [{ key: "label" }],
  },
  matrix: {
    heatmap: [{ key: "style", choices: ["all", "row"] }],
    rowTotals: [{ key: "label" }],
    colTotals: [{ key: "label" }],
  },
  issues: {
    rows: [{ key: "value", min: 1, max: 30 }],
    col_dueDate: [{ key: "style", choices: ["date", "relative"] }],
    link: [{ key: "label" }],
  },
};

/** The settings of an element in a kind — empty when it has none. */
export function elementOptions(
  type: WidgetType,
  kind: ElementKind,
): ElementOption[] {
  return ELEMENT_OPTIONS[type]?.[kind] ?? [];
}

const MIN_SIZE_RANK: Record<WidgetSize, number> = {
  S: 0,
  M: 1,
  W: 1,
  L: 2,
  T: 3,
  XL: 3,
};
const MIN_SIZE_NEED: Record<ElementMinSize, number> = {
  S: 0,
  M: 1,
  L: 2,
  XL: 3,
};

/**
 * The smallest size an element can be drawn in at all — below it there's
 * no room (a spark next to the number needs two columns, a mini list a
 * second row). Matches what the widget's CSS hides (`noS` → M, `noShort`
 * → L); an element's own `minSize` can only raise it.
 */
const NATURAL_MIN: Partial<
  Record<WidgetType, Partial<Record<ElementKind, ElementMinSize>>>
> = {
  kpi: { spark: "M", second: "L", miniList: "L", link: "L" },
  progress: { deadline: "L", forecast: "L", second: "L" },
  distribution: { legend: "M" },
  flow: { legend: "L", axes: "L" },
  issues: {
    rows: "M",
    link: "M",
    col_status: "M",
    col_assignee: "M",
    col_priority: "M",
    col_dueDate: "M",
    col_updated: "M",
    col_labels: "M",
    col_storyPoints: "M",
  },
  burnup: { legend: "L", axes: "L", values: "L" },
  cycle: { legend: "L", axes: "L", values: "L" },
  workload: { legend: "L" },
};

/** The smallest size an element can show in — by nature, or by choice. */
export function minSizeOf(
  type: WidgetType,
  element: Pick<WidgetElement, "kind" | "minSize">,
): ElementMinSize {
  const natural = NATURAL_MIN[type]?.[element.kind] ?? "S";
  const own = element.minSize ?? "S";
  return MIN_SIZE_NEED[own] > MIN_SIZE_NEED[natural] ? own : natural;
}

/** The sizes "Ab Größe sichtbar" offers — from the element's natural
 *  smallest size up. */
export function minSizeChoices(
  type: WidgetType,
  kind: ElementKind,
): ElementMinSize[] {
  const natural = MIN_SIZE_NEED[NATURAL_MIN[type]?.[kind] ?? "S"];
  return ELEMENT_MIN_SIZES.filter((s) => MIN_SIZE_NEED[s] >= natural);
}

/** Whether an element shows in a widget size. */
export function fitsSize(
  type: WidgetType,
  element: Pick<WidgetElement, "kind" | "minSize">,
  size: WidgetSize,
): boolean {
  return MIN_SIZE_RANK[size] >= MIN_SIZE_NEED[minSizeOf(type, element)];
}

/** The elements a widget draws — its own, minus those too big for it. */
export function shownElements(widget: Widget): WidgetElement[] {
  return elementsOf(widget).filter((e) =>
    fitsSize(widget.type, e, widget.size),
  );
}

/** The element of a kind, if the widget draws it in its size. */
export function shownElement(
  widget: Widget,
  kind: ElementKind,
): WidgetElement | undefined {
  return shownElements(widget).find((e) => e.kind === kind);
}

/**
 * Elements that are blocks of their own and sit in the widget in the order
 * they're listed. The rest change the main part (a goal ring, the chart's
 * axes, the heatmap) and have no place to move to.
 */
const PLACED: Partial<Record<WidgetType, ElementKind[]>> = {
  kpi: ["trend", "spark", "second", "miniList", "link"],
  progress: ["deadline", "forecast", "second"],
  flow: ["legend", "sumRow"],
  issues: [
    "col_status",
    "col_assignee",
    "col_priority",
    "col_dueDate",
    "col_updated",
    "col_labels",
    "col_storyPoints",
  ],
};

/** Whether an element can be moved — a block of its own (`PLACED`). */
export function isPlaced(type: WidgetType, kind: ElementKind): boolean {
  return PLACED[type]?.includes(kind) ?? false;
}

/** What a kind shows before anyone touches its elements — today's look. */
const DEFAULT_ELEMENTS: Partial<Record<WidgetType, ElementKind[]>> = {
  kpi: ["trend", "spark"],
  progress: ["breakdown"],
  distribution: ["legend", "values", "total"],
  flow: ["legend", "axes", "values"],
  matrix: ["axes", "values", "heatmap"],
  issues: ["col_updated"],
  burnup: ["legend", "axes", "values"],
  cycle: ["legend", "axes", "values"],
  age: ["axes", "values"],
  workload: ["legend", "axes", "values"],
};

export function elementDef(type: WidgetType, kind: ElementKind) {
  return ELEMENTS[type]?.find((d) => d.kind === kind);
}

/** A widget's elements — its own, or the defaults (honoring the older
 *  label switches). Elements a kind doesn't offer drop out. */
export function elementsOf(widget: Widget): WidgetElement[] {
  const offered = ELEMENTS[widget.type] ?? [];
  if (widget.config.elements) {
    return widget.config.elements.filter((e) =>
      offered.some((d) => d.kind === e.kind),
    );
  }
  const labels = widget.config.labels;
  // A list sorted by due date showed its due dates before there were columns.
  const defaults =
    widget.type === "issues" && widget.config.sort === "dueDate"
      ? (["col_dueDate"] as ElementKind[])
      : (DEFAULT_ELEMENTS[widget.type] ?? []);
  return defaults
    .filter(
      (kind) =>
        !labels ||
        !(kind === "legend" || kind === "axes" || kind === "values") ||
        labels[kind],
    )
    .map((kind) => ({
      id: kind,
      kind,
      ...(elementDef(widget.type, kind)?.initial !== undefined && {
        value: elementDef(widget.type, kind)?.initial,
      }),
    }));
}

/** The element of a kind, if the widget has it. */
export function elementOf(
  widget: Widget,
  kind: ElementKind,
): WidgetElement | undefined {
  return elementsOf(widget).find((e) => e.kind === kind);
}

/** A page of a note — its text is private to whoever wrote it
 *  (`DashboardNote`), never part of the layout. */
export interface NotePage {
  id: string;
  /** The page as a ProseMirror document — formatted as it's typed. */
  doc?: unknown;
  /** Older plain/Markdown text, read once into `doc`. */
  text?: string;
}

export interface Widget {
  /** Stable within a dashboard — the React key and the data map's key. */
  id: string;
  type: WidgetType;
  size: WidgetSize;
  config: WidgetConfig;
}

export interface WidgetDef {
  type: WidgetType;
  icon: string;
  /** The sizes this kind offers, small to large. */
  sizes: WidgetSize[];
  size: WidgetSize;
  accent: WidgetAccent;
  /** Has chart labels (legend, axes, values) to switch. */
  chart?: boolean;
  /** May take the `fill` background — only kinds without data colors. */
  fill?: boolean;
  /** Reads issues (and so takes a filter). */
  issues: boolean;
  /** The gallery's section. */
  group: "numbers" | "charts" | "lists" | "team" | "other";
  /** Only on these dashboards — a project has no projects or links. */
  kinds?: ("project" | "workspace" | "view")[];
  /** Not listed in the gallery (made by the builder). */
  hidden?: boolean;
  config: WidgetConfig;
}

export const WIDGETS: Record<WidgetType, WidgetDef> = {
  kpi: {
    type: "kpi",
    icon: "lucide:hash",
    sizes: ["S", "M", "L", "T", "XL"],
    size: "S",
    accent: "blue",
    fill: true,
    issues: true,
    group: "numbers",
    config: { metric: "open" },
  },
  progress: {
    type: "progress",
    icon: "lucide:target",
    sizes: ["S", "M", "L", "T", "XL"],
    size: "M",
    accent: "lime",
    fill: true,
    issues: true,
    group: "numbers",
    config: {},
  },
  distribution: {
    type: "distribution",
    icon: "lucide:chart-pie",
    sizes: ["S", "M", "L", "T", "XL"],
    size: "L",
    accent: "indigo",
    chart: true,
    issues: true,
    group: "charts",
    config: { groupBy: "status", chart: "ring" },
  },
  flow: {
    type: "flow",
    icon: "lucide:chart-column",
    sizes: ["S", "M", "L", "T", "XL"],
    size: "XL",
    accent: "blue",
    chart: true,
    issues: true,
    group: "charts",
    config: {},
  },
  burnup: {
    type: "burnup",
    icon: "lucide:chart-area",
    sizes: ["M", "L", "XL"],
    size: "XL",
    accent: "lime",
    chart: true,
    issues: true,
    group: "charts",
    config: {},
  },
  cycle: {
    type: "cycle",
    icon: "lucide:timer",
    sizes: ["S", "M", "L", "XL"],
    size: "L",
    accent: "teal",
    chart: true,
    issues: true,
    group: "charts",
    config: {},
  },
  age: {
    type: "age",
    icon: "lucide:hourglass",
    sizes: ["M", "L"],
    size: "M",
    accent: "orange",
    chart: true,
    issues: true,
    group: "charts",
    config: {},
  },
  matrix: {
    type: "matrix",
    icon: "lucide:grid-3x3",
    sizes: ["S", "M", "L", "T", "XL"],
    size: "L",
    accent: "indigo",
    issues: true,
    group: "charts",
    config: { groupBy: "assignee", groupBy2: "status", openOnly: true },
  },
  attention: {
    type: "attention",
    icon: "lucide:triangle-alert",
    sizes: ["S", "M", "L", "T"],
    size: "L",
    accent: "red",
    issues: true,
    group: "lists",
    config: {},
  },
  issues: {
    type: "issues",
    icon: "lucide:list",
    sizes: ["S", "M", "L", "T", "XL"],
    size: "L",
    accent: "blue",
    issues: true,
    group: "lists",
    config: { sort: "updated", openOnly: true },
  },
  workload: {
    type: "workload",
    icon: "lucide:users",
    sizes: ["M", "L", "T"],
    size: "L",
    accent: "purple",
    chart: true,
    issues: true,
    group: "lists",
    config: {},
  },
  activity: {
    type: "activity",
    icon: "lucide:history",
    sizes: ["M", "L", "T"],
    size: "L",
    accent: "ochre",
    issues: false,
    group: "lists",
    config: {},
  },
  about: {
    type: "about",
    icon: "lucide:info",
    sizes: ["M", "L", "XL"],
    size: "L",
    accent: "green",
    issues: false,
    group: "other",
    config: { background: "gradient" },
  },
  members: {
    type: "members",
    icon: "lucide:users",
    sizes: ["M", "L", "T"],
    size: "L",
    accent: "purple",
    issues: false,
    group: "team",
    config: {},
  },
  teams: {
    type: "teams",
    icon: "lucide:users-round",
    sizes: ["S", "M", "L", "T"],
    size: "L",
    accent: "teal",
    issues: false,
    group: "team",
    config: {},
  },
  labels: {
    type: "labels",
    icon: "lucide:tag",
    sizes: ["M", "L", "T"],
    size: "L",
    accent: "pink",
    issues: false,
    group: "team",
    config: {},
  },
  projects: {
    type: "projects",
    icon: "lucide:folders",
    sizes: ["M", "L", "T", "XL"],
    size: "L",
    accent: "blue",
    issues: false,
    group: "team",
    kinds: ["workspace", "view"],
    config: {},
  },
  links: {
    type: "links",
    icon: "lucide:link",
    sizes: ["S", "M", "L"],
    size: "M",
    accent: "indigo",
    issues: false,
    group: "other",
    kinds: ["workspace", "view"],
    config: {},
  },
  shortcuts: {
    type: "shortcuts",
    icon: "lucide:layout-grid",
    sizes: ["M", "L", "W"],
    size: "L",
    accent: "gray",
    issues: false,
    group: "other",
    config: { background: "tint" },
  },
  blocks: {
    type: "blocks",
    icon: "lucide:blocks",
    sizes: ["S", "M", "L", "T", "XL"],
    size: "L",
    accent: "blue",
    issues: true,
    group: "other",
    hidden: true,
    config: {},
  },
  note: {
    type: "note",
    icon: "lucide:sticky-note",
    sizes: ["S", "M", "L", "T"],
    size: "M",
    accent: "ochre",
    fill: true,
    issues: false,
    group: "other",
    config: { background: "fill" },
  },
};

/** What the builder ("New widget") saves — widgets made of blocks. */
export const BUILDER_TYPES = [
  "blocks",
] as const satisfies readonly WidgetType[];

// ─── Blocks and templates (BARY-170) ─────────────────────────────────────────

/** Both filters at once — the widget's and a block's own. */
export function andFilters(
  a: IssueFilter | undefined,
  b: IssueFilter | undefined,
): IssueFilter | undefined {
  if (!a?.rules.length) return b?.rules.length ? b : undefined;
  if (!b?.rules.length) return a;
  return { op: "and", rules: [a, b] };
}

/** A block as a widget of its kind — for its data and its drawing. The
 *  widget's size; the widget's filter and the block's together. */
export function blockWidget(widget: Widget, block: WidgetBlock): Widget {
  return {
    id: block.id,
    type: block.type,
    size: widget.size,
    config: {
      ...block.config,
      filter: andFilters(widget.config.filter, block.config.filter),
      accent: widget.config.accent,
    },
  };
}

/** The blocks a widget draws: all of them from size L up; below, only the
 *  first — there's no room for a second row. */
export function shownBlocks(widget: Widget): WidgetBlock[] {
  const blocks = widget.config.blocks ?? [];
  return MIN_SIZE_RANK[widget.size] >= 2 ? blocks : blocks.slice(0, 1);
}

/** A fresh block of a kind, with its defaults. */
export function newBlock(type: BlockType, id: string): WidgetBlock {
  // A kind's defaults hold no title, background or accent — those are
  // the widget's — so they carry over as they are.
  return { id, type, config: { ...WIDGETS[type].config } as BlockConfig };
}

/** An older custom widget of one kind, as a widget of one block. */
export function toBlocks(widget: Widget): Widget {
  if (!(BLOCK_TYPES as readonly string[]).includes(widget.type)) return widget;
  const { title, filter, background, accent, ...rest } = widget.config;
  return {
    id: widget.id,
    type: "blocks",
    size: widget.size,
    config: {
      title,
      filter,
      background: background === "fill" ? "tint" : background,
      accent: accent ?? WIDGETS[widget.type].accent,
      blocks: [
        {
          id: "b1",
          type: widget.type as BlockType,
          config: {
            ...rest,
            elements: rest.elements ?? elementsOf(widget),
          },
        },
      ],
    },
  };
}

/** Templates — a starting set of blocks, freely changed afterwards. */
export const TEMPLATES = [
  "kpi",
  "progress",
  "distribution",
  "flow",
  "matrix",
  "issues",
  "sprint",
  "kpiList",
  "empty",
] as const;
export type TemplateKey = (typeof TEMPLATES)[number];

const ex = (
  kind: ElementKind,
  more: Partial<WidgetElement> = {},
): WidgetElement => ({ id: kind, kind, ...more });

/** The blocks a template starts with; `id` makes each block's id. */
export function templateBlocks(
  key: TemplateKey,
  id: () => string,
): WidgetBlock[] {
  const block = (type: BlockType, config: BlockConfig = {}): WidgetBlock => {
    const fresh = newBlock(type, id());
    return { ...fresh, config: { ...fresh.config, ...config } };
  };
  switch (key) {
    case "empty":
      return [];
    case "sprint":
      return [
        block("progress", { elements: [ex("breakdown"), ex("deadline")] }),
        block("kpi", { metric: "closed", elements: [ex("trend")] }),
        block("issues", {
          sort: "priority",
          elements: [ex("rows", { value: 3 }), ex("col_assignee")],
        }),
      ];
    case "kpiList":
      return [
        block("kpi", { metric: "overdue", elements: [ex("trend")] }),
        block("issues", {
          sort: "dueDate",
          filter: {
            op: "and",
            rules: [{ field: "dueDate", is: "before", value: "today" }],
          },
          elements: [
            ex("rows", { value: 4 }),
            ex("col_dueDate", { style: "relative" }),
          ],
        }),
      ];
    default:
      return [block(key)];
  }
}

/** A fresh custom widget from a template. */
export function templateWidget(
  key: TemplateKey,
  id: () => string,
  keep: WidgetConfig = {},
): Widget {
  return {
    id: "draft",
    type: "blocks",
    size: WIDGETS.blocks.size,
    config: {
      filter: keep.filter,
      accent: keep.accent,
      background: keep.background,
      blocks: templateBlocks(key, id),
    },
  };
}

/** A saved custom widget (BARY-170), as the gallery lists it. */
export interface CustomWidgetEntry {
  id: string;
  name: string;
  widget: Widget;
  shared: boolean;
  /** The viewer built it — may change or delete it. */
  mine: boolean;
}

/** A fresh widget of a kind, with its defaults. */
export function newWidget(type: WidgetType, id: string): Widget {
  const def = WIDGETS[type];
  return { id, type, size: def.size, config: { ...def.config } };
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/** Fixed ids so the default layout is stable across renders and requests. */
function w(
  id: string,
  type: WidgetType,
  size: WidgetSize,
  config: WidgetConfig = {},
): Widget {
  return { id, type, size, config: { ...WIDGETS[type].config, ...config } };
}

/**
 * What a project or workspace dashboard shows before anyone changes it.
 * Coarse to fine: the state in numbers and its movement, then how it's
 * distributed and what needs attention, then how it developed.
 */
export function defaultWidgets(
  kind: "project" | "workspace" | "view",
  scope: "all" | "mine" = "all",
): Widget[] {
  // Each packs into 8 columns without a gap; narrower grids reflow the same
  // order. Chosen from the mockups (BARY-169): workspace C "calm",
  // workspace-for-me B "focus", project A "status", project-for-me C
  // "compact".
  if (kind === "view") {
    return [
      w("flow", "flow", "XL"),
      w("open", "kpi", "S", { metric: "open", background: "fill" }),
      w("inProgress", "kpi", "S", {
        metric: "inProgress",
        accent: "amber",
        background: "tint",
      }),
      w("overdue", "kpi", "S", {
        metric: "overdue",
        accent: "red",
        background: "tint",
      }),
      w("closed", "kpi", "S", { metric: "closed", accent: "green" }),
      w("cycle", "cycle", "M", { background: "gradient" }),
      w("done", "progress", "M", { background: "fill" }),
      w("status", "distribution", "L", { groupBy: "status" }),
      w("attention", "attention", "L"),
      w("workload", "workload", "L"),
      w("priority", "distribution", "L", {
        groupBy: "priority",
        chart: "bars",
        openOnly: true,
        accent: "orange",
      }),
    ];
  }

  // The four numbers most dashboards open with — in "mine" they count the
  // person's own issues (the scope filters).
  const numbers = (mine: boolean) => [
    w("open", "kpi", "S", { metric: "open", background: "fill" }),
    mine
      ? w("overdue", "kpi", "S", {
          metric: "overdue",
          accent: "red",
          background: "tint",
        })
      : w("inProgress", "kpi", "S", {
          metric: "inProgress",
          accent: "amber",
          background: "tint",
        }),
    mine
      ? w("inProgress", "kpi", "S", {
          metric: "inProgress",
          accent: "amber",
          background: "tint",
        })
      : w("overdue", "kpi", "S", {
          metric: "overdue",
          accent: "red",
          background: "tint",
        }),
    w("closed", "kpi", "S", { metric: "closed", accent: "green" }),
  ];

  if (kind === "workspace" && scope === "all") {
    // C "calm": a welcome, the numbers, the movement, what needs a look,
    // the projects, and the way on.
    return [
      w("about", "about", "M", { background: "gradient" }),
      ...numbers(false),
      w("done", "progress", "M", { background: "fill" }),
      w("flow", "flow", "XL"),
      w("attention", "attention", "L"),
      w("projectList", "projects", "L"),
      w("shortcuts", "shortcuts", "W", { background: "tint" }),
    ];
  }

  if (kind === "workspace") {
    // B "focus": what's due next and what moved last, two numbers, one's
    // own pace, a note, and the way to inbox and views.
    return [
      w("next", "issues", "L", { sort: "dueDate", accent: "amber" }),
      w("recent", "issues", "L", { sort: "updated" }),
      w("open", "kpi", "S", { metric: "open", background: "fill" }),
      w("overdue", "kpi", "S", {
        metric: "overdue",
        accent: "red",
        background: "tint",
      }),
      w("flow", "flow", "M"),
      w("note", "note", "M"),
      w("shortcuts", "shortcuts", "M", {
        background: "tint",
        shortcuts: ["inbox", "myIssues", "views"],
      }),
    ];
  }

  if (scope === "all") {
    // A "status": what the project is, its numbers and movement, then
    // where it stands and where it snags.
    return [
      w("about", "about", "L", { background: "gradient" }),
      ...numbers(false),
      w("flow", "flow", "XL"),
      w("status", "distribution", "L", { groupBy: "status" }),
      w("attention", "attention", "L"),
      w("workload", "workload", "L"),
      w("cycle", "cycle", "M", { background: "gradient" }),
      w("done", "progress", "M", { background: "fill" }),
    ];
  }

  // Project for me, C "compact": my issues here, my numbers, the project
  // in a line, and the way on.
  return [
    w("mine", "issues", "XL", { sort: "dueDate" }),
    ...numbers(true),
    w("about", "about", "M", { background: "gradient" }),
    w("done", "progress", "M", { background: "fill" }),
    w("shortcuts", "shortcuts", "W", { background: "tint" }),
  ];
}

/** Whether a kind belongs on this dashboard. */
export function offeredOn(
  type: WidgetType,
  kind: "project" | "workspace" | "view",
): boolean {
  const kinds = WIDGETS[type].kinds;
  if (WIDGETS[type].hidden) return false;
  return (
    (!kinds || kinds.includes(kind)) && !(kind === "view" && type === "about")
  );
}

// ─── Validation ──────────────────────────────────────────────────────────────

const labelsSchema = z
  .object({ legend: z.boolean(), axes: z.boolean(), values: z.boolean() })
  .strict();

const baseConfigShape = z.object({
  title: z.string().trim().max(80).optional(),
  filter: issueFilterSchema.optional(),
  metric: z.enum(KPI_METRICS).optional(),
  groupBy: z.enum(GROUP_FIELDS).optional(),
  groupBy2: z.enum(GROUP_FIELDS).optional(),
  chart: z.enum(DISTRIBUTION_CHARTS).optional(),
  measure: z.enum(MEASURES).optional(),
  timeBy: z.enum(TIME_BY).optional(),
  splitBy: z.enum(GROUP_FIELDS).optional(),
  seriesChart: z.enum(SERIES_CHARTS).optional(),
  openOnly: z.boolean().optional(),
  sort: z.enum(ISSUE_SORTS).optional(),
  labels: labelsSchema.optional(),
  background: z.enum(BACKGROUNDS).optional(),
  accent: z.enum(ACCENTS).optional(),
  text: z.string().max(2000).optional(),
  shortcuts: z.array(z.enum(SHORTCUT_KEYS)).max(20).optional(),
  // Notes used to carry their text here; it's private now
  // (`DashboardNote`) and dropped on read (`normalizeWidget`).
  pages: z.unknown().optional(),
  elements: z
    .array(
      z
        .object({
          id: z.string().min(1).max(40),
          kind: z.enum(ELEMENT_KINDS),
          value: z.number().min(0).max(1_000_000).optional(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          filter: issueFilterSchema.optional(),
          label: z.string().trim().max(40).optional(),
          style: z.enum(ELEMENT_STYLES).optional(),
          flag: z.boolean().optional(),
          sort: z.enum(ELEMENT_SORTS).optional(),
          color: z.enum(ACCENTS).optional(),
          minSize: z.enum(ELEMENT_MIN_SIZES).optional(),
        })
        .strict(),
    )
    .max(20)
    .optional(),
});

const blockSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(BLOCK_TYPES),
    config: baseConfigShape
      .pick({
        filter: true,
        metric: true,
        groupBy: true,
        groupBy2: true,
        chart: true,
        measure: true,
        timeBy: true,
        splitBy: true,
        seriesChart: true,
        openOnly: true,
        sort: true,
        labels: true,
        elements: true,
      })
      .strict(),
  })
  .strict();

const configSchema = baseConfigShape
  .extend({
    blocks: z
      .array(blockSchema)
      .max(6)
      .refine((list) => new Set(list.map((b) => b.id)).size === list.length, {
        message: "Duplicate block id",
      })
      .optional(),
  })
  .strict();

export const notePagesSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(40),
        doc: z.record(z.string(), z.unknown()).optional(),
        text: z.string().max(5000).optional(),
      })
      .strict(),
  )
  .min(1)
  .max(12)
  // A note, not a document store.
  .refine((pages) => JSON.stringify(pages).length <= 100_000, {
    message: "Note too large",
  });

const widgetSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(WIDGET_TYPES),
    size: z.enum(WIDGET_SIZES),
    config: configSchema,
  })
  .strict();

/** A dashboard's widgets — at most 40, ids unique. */
export const widgetsSchema = z
  .array(widgetSchema)
  .max(40)
  .refine((list) => new Set(list.map((x) => x.id)).size === list.length, {
    message: "Duplicate widget id",
  });

/**
 * Bring a size the kind doesn't offer to the nearest one it does — a
 * stored row may predate a change to the registry.
 */
export function fitSize(type: WidgetType, size: WidgetSize): WidgetSize {
  const sizes = WIDGETS[type].sizes;
  if (sizes.includes(size)) return size;
  const rank = WIDGET_SIZES.indexOf(size);
  return (
    [...sizes].sort(
      (a, b) =>
        Math.abs(WIDGET_SIZES.indexOf(a) - rank) -
        Math.abs(WIDGET_SIZES.indexOf(b) - rank),
    )[0] ?? WIDGETS[type].size
  );
}

/**
 * Read stored widgets. Anything that doesn't validate is `null` (the caller
 * falls back to the next level); sizes and `fill` are brought in line with
 * the registry.
 */
export function parseWidgets(input: unknown): Widget[] | null {
  const parsed = widgetsSchema.safeParse(input);
  if (!parsed.success) return null;
  return parsed.data.map((widget) => normalizeWidget(widget as Widget));
}

export function normalizeWidget(widget: Widget): Widget {
  const def = WIDGETS[widget.type];
  const config = { ...widget.config };
  if (config.background === "fill" && !def.fill) config.background = "tint";
  // A note's text never travels with a layout — it's private to each person.
  if (widget.type === "note") {
    delete config.text;
    delete (config as { pages?: unknown }).pages;
  }
  return { ...widget, size: fitSize(widget.type, widget.size), config };
}

/** The labels a chart shows — stored or the default. */
export function labelsOf(widget: Widget): ChartLabels {
  // Legend, axes and values are elements now — read through them.
  const kinds = new Set(shownElements(widget).map((e) => e.kind));
  return {
    legend: kinds.has("legend"),
    axes: kinds.has("axes"),
    values: kinds.has("values"),
  };
}

/** The accent a widget is drawn in — its own or its kind's. */
export function accentOf(widget: Widget): WidgetAccent {
  return widget.config.accent ?? WIDGETS[widget.type].accent;
}

/**
 * The shortcut tiles a widget shows: the chosen ones in their order, from
 * what the place offers. A choice the viewer can't reach (no permission,
 * a workspace-only target on a project) simply drops out.
 */
export function pickShortcuts<T extends { key: ShortcutKey; default: boolean }>(
  offered: T[],
  chosen: ShortcutKey[] | undefined,
): T[] {
  // Nothing chosen yet: the tiles shown by default; the rest wait in the
  // settings to be switched on.
  if (!chosen) return offered.filter((item) => item.default);
  return chosen.flatMap((key) => offered.filter((item) => item.key === key));
}

/** Move `id` to where `targetId` sits (drag and drop in edit mode). */
export function moveWidgetTo(
  widgets: Widget[],
  id: string,
  targetId: string,
): Widget[] {
  const from = widgets.findIndex((x) => x.id === id);
  const to = widgets.findIndex((x) => x.id === targetId);
  if (from < 0 || to < 0 || from === to) return widgets;
  const next = [...widgets];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Storage key of a dashboard's layout row (`DashboardLayout.key`). */
export function layoutKey(
  target: { kind: "project" | "workspace"; id: string },
  userId: string | null,
): string {
  return `${target.kind}:${target.id}${userId ? `:${userId}` : ""}`;
}
