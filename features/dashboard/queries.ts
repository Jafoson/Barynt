import "server-only";
import { cache } from "react";
import {
  getProjectActivity,
  getWorkspaceActivity,
} from "@/features/audit/queries";
import {
  type DashboardScope,
  toDashboardScope,
} from "@/features/dashboard/scope";
import type {
  AboutData,
  AttentionReason,
  DashboardIssue,
  DashboardTarget,
  DashboardView,
  LabelRow,
  RoleGroup,
  Shortcut,
  Slice,
  WidgetData,
  WidgetDataMap,
  WorkloadRow,
} from "@/features/dashboard/types";
import {
  type CustomWidgetEntry,
  defaultWidgets,
  elementOf,
  type GroupField,
  type KpiMetric,
  layoutKey,
  type Measure,
  notePagesSchema,
  parseWidgets,
  type Widget,
} from "@/features/dashboard/widgets";
import type { IssueFilter } from "@/features/issues/filter";
import {
  filterToParams,
  idToSlug,
  mapFilterValues,
  type SlugLookups,
} from "@/features/issues/filter-url";
import { toIssueWhere } from "@/features/issues/filter-where";
import {
  filterContext,
  getIssueTypes,
  getPriorities,
  getStatuses,
} from "@/features/issues/queries";
import { getVisibleViewById } from "@/features/views/queries";
import { systemViewSlug } from "@/features/views/system";
import { viewPath } from "@/features/views/url";
import {
  bucketKey,
  previousWindow,
  type RangeKey,
  step,
  toRange,
  truncate,
  type Window,
  windowFor,
} from "@/lib/buckets";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  accountPath,
  PROJECT_SETTINGS_PERMISSIONS,
  projectPath,
  projectSettingsPath,
  WORKSPACE_SETTINGS_PERMISSIONS,
  workspacePath,
  workspaceSettingsPath,
} from "@/lib/nav";
import {
  accessFor,
  currentUserCanEnterWorkspace,
  currentUserId,
  hasPermission,
  visibleProjectIds,
} from "@/lib/permissions";
import {
  DEFAULT_WORKSPACE_ROLE_KEY,
  PROJECT_BLOCKED_ROLE_KEY,
  WORKSPACE_GUEST_ROLE_KEY,
  WORKSPACE_VIEWER_ROLE_KEY,
} from "@/lib/rbac";
import { STATUS_CATEGORIES } from "@/lib/status-category";
import { resolveAvatarUrl } from "@/lib/storage";
import type { IssueType, Priority, Status, User } from "@/types";

// ─── Dashboards (BARY-169) ──────────────────────────────────────────────────
//
// Every widget is computed on its own: the dashboard's scope (projects,
// "mine", a view's filter) AND the widget's own filter. Counting happens in
// the database; the time series fetch a single date column of the matching
// issues and bucket them here — a `GROUP BY` only knows buckets with
// something in them, and a quiet week has to be a zero, not a gap.
//
// **Permissions.** Everything hangs off seeing the issues: `project.view`
// for a project, entering the workspace (and then only its visible
// projects) for the workspace, seeing the view for a view. `null` means
// "doesn't exist for you"; the page turns it into a 404.

type Where = Prisma.IssueWhereInput;

/** The status ladder's colors, by category. */
const CATEGORY_COLORS: Record<string, string> = {
  backlog: "#8a9099",
  unstarted: "#b8bcc4",
  started: "#e0992b",
  completed: "#5ab98a",
  canceled: "#5f6b71",
};

/** After how long an in-progress issue counts as stale. */
const STALE_DAYS = 14;
/** Rows a list widget brings at most — the tall size shows about this many. */
const LIST_LIMIT = 12;
/** Entries per distribution before the rest becomes "other". */
const SLICE_LIMIT = 12;
const DAY = 86_400_000;

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  handle: true,
  email: true,
  color: true,
  image: true,
  avatarKey: true,
} as const;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

async function mapUser(user: UserRow): Promise<User> {
  const image = (await resolveAvatarUrl(user.avatarKey)) ?? user.image;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    handle: user.handle,
    email: user.email,
    color: user.color,
    ...(image ? { image } : {}),
  };
}

const ISSUE_SELECT = {
  id: true,
  key: true,
  title: true,
  status: true,
  priority: true,
  updated: true,
  dueDate: true,
  projectId: true,
  storyPoints: true,
  labels: true,
  assignee: { select: USER_SELECT },
} as const;

type IssueRow = Prisma.IssueGetPayload<{ select: typeof ISSUE_SELECT }>;

// ── What a dashboard is about ────────────────────────────────────────────────

interface Resolved {
  workspaceId: string;
  /** The project a project dashboard (or a project's view) belongs to. */
  projectId: string | null;
  projectIds: string[];
  viewFilter: IssueFilter | null;
  canViewAll: boolean;
  canEdit: boolean;
  canEditShared: boolean;
  /** For a view: its stored widgets. */
  viewWidgets: unknown;
}

const resolveTarget = cache(
  async (
    kind: DashboardTarget["kind"],
    id: string,
  ): Promise<Resolved | null> => {
    const userId = await currentUserId();
    if (!userId) return null;

    if (kind === "project") {
      if (!(await hasPermission("project.view", { projectId: id })))
        return null;
      const project = await db.project.findUnique({
        where: { id },
        select: { workspaceId: true },
      });
      if (!project) return null;
      const [canViewAll, canEditShared] = await Promise.all([
        hasPermission("dashboard.view.all", { projectId: id }),
        hasPermission("dashboard.manage", { projectId: id }),
      ]);
      return {
        workspaceId: project.workspaceId,
        projectId: id,
        projectIds: [id],
        viewFilter: null,
        canViewAll,
        canEdit: true,
        canEditShared,
        viewWidgets: null,
      };
    }

    if (kind === "workspace") {
      if (!(await currentUserCanEnterWorkspace(id))) return null;
      const [visible, canViewAll, canEditShared] = await Promise.all([
        visibleProjectIds(id),
        hasPermission("dashboard.view.all", { workspaceId: id }),
        hasPermission("dashboard.manage", { workspaceId: id }),
      ]);
      return {
        workspaceId: id,
        projectId: null,
        projectIds: [...visible],
        viewFilter: null,
        canViewAll,
        canEdit: true,
        canEditShared,
        viewWidgets: null,
      };
    }

    const view = await getVisibleViewById(id);
    if (!view) return null;
    const visible = await visibleProjectIds(view.workspaceId);
    const projectIds = view.projectId
      ? visible.has(view.projectId)
        ? [view.projectId]
        : []
      : [...visible];
    const canViewAll = await hasPermission(
      "dashboard.view.all",
      view.projectId
        ? { projectId: view.projectId }
        : { workspaceId: view.workspaceId },
    );
    return {
      workspaceId: view.workspaceId,
      projectId: view.projectId,
      projectIds,
      viewFilter: view.filter,
      canViewAll,
      canEdit: view.canEdit,
      canEditShared: false,
      viewWidgets: view.display.widgets,
    };
  },
);

// ── Layout ───────────────────────────────────────────────────────────────────

/**
 * The widgets a person sees: their own row, else the default admins set,
 * else the built-in one. A row that no longer validates counts as missing.
 */
async function layoutFor(
  target: DashboardTarget,
  resolved: Resolved,
  userId: string,
  scope: DashboardScope,
): Promise<{ widgets: Widget[]; personal: boolean; hasShared: boolean }> {
  if (target.kind === "view") {
    return {
      widgets: parseWidgets(resolved.viewWidgets) ?? defaultWidgets("view"),
      personal: false,
      hasShared: false,
    };
  }
  const sharedKey = layoutKey(target, null);
  const personalKey = layoutKey(target, userId);
  const rows = await db.dashboardLayout.findMany({
    where: { key: { in: [sharedKey, personalKey] } },
    select: { key: true, widgets: true },
  });
  const shared = parseWidgets(rows.find((r) => r.key === sharedKey)?.widgets);
  const personal = parseWidgets(
    rows.find((r) => r.key === personalKey)?.widgets,
  );
  return {
    // Someone looking at their own issues ("mine") starts from the personal
    // default; the shared one is the team's view of everything.
    widgets:
      personal ??
      (scope === "mine"
        ? defaultWidgets(target.kind, "mine")
        : (shared ?? defaultWidgets(target.kind, "all"))),
    personal: !!personal,
    hasShared: !!shared,
  };
}

/** Range and scope this person last opened the dashboard with. */
async function storedPrefs(
  target: DashboardTarget,
  userId: string,
): Promise<{ range: string | null; scope: string | null }> {
  if (target.kind === "project") {
    const row = await db.dashboardPreference.findUnique({
      where: { userId_projectId: { userId, projectId: target.id } },
      select: { range: true, scope: true },
    });
    return { range: row?.range ?? null, scope: row?.scope ?? null };
  }
  if (target.kind === "workspace") {
    const row = await db.workspaceDashboardPreference.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: target.id } },
      select: { range: true, scope: true },
    });
    return { range: row?.range ?? null, scope: row?.scope ?? null };
  }
  return { range: null, scope: null };
}

// ── Shared context for one computation ──────────────────────────────────────

interface Ctx {
  resolved: Resolved;
  userId: string;
  base: Where;
  window: Window;
  previous: Window;
  closed: string[];
  started: string[];
  completed: string[];
  statuses: Status[];
  priorities: Priority[];
  types: IssueType[];
  prefixes: Map<string, string>;
  statusById: Map<string, Status>;
  scope: DashboardScope;
  /** "<kind>:<id>" — where a private note is filed. */
  targetKey: string;
  /** The board this dashboard's numbers come from: the project's, or the
   *  workspace's across projects. */
  boardBase: string;
  /** Id → slug lookups for writing filters into an address — loaded on
   *  first use. */
  slugs: () => Promise<SlugLookups>;
}

/** Turn a list of filter nodes into one `where`, or `{}` when empty. */
async function filterWhere(filter: IssueFilter | null | undefined) {
  if (!filter || filter.rules.length === 0) return {};
  return toIssueWhere(filter, await filterContext());
}

async function buildCtx(
  target: DashboardTarget,
  resolved: Resolved,
  userId: string,
  range: RangeKey,
  scope: DashboardScope,
): Promise<Ctx> {
  const window = windowFor(range);
  const [statuses, priorities, types, projects, viewWhere] = await Promise.all([
    getStatuses(resolved.workspaceId),
    getPriorities(resolved.workspaceId),
    getIssueTypes(resolved.workspaceId),
    db.project.findMany({
      where: { id: { in: resolved.projectIds } },
      select: { id: true, prefix: true },
    }),
    filterWhere(resolved.viewFilter),
  ]);
  const ids = (cats: string[]) =>
    statuses.filter((s) => cats.includes(s.category)).map((s) => s.id);

  const place = await placeOf(resolved.workspaceId, resolved.projectId);
  let slugs: Promise<SlugLookups> | null = null;
  const loadSlugs = async (): Promise<SlugLookups> => {
    const [members, labels, allProjects] = await Promise.all([
      db.workspaceMember.findMany({
        where: { workspaceId: resolved.workspaceId },
        select: { user: { select: { id: true, handle: true } } },
      }),
      db.label.findMany({
        where: { workspaceId: resolved.workspaceId },
        select: { id: true, slug: true },
      }),
      db.project.findMany({
        where: { workspaceId: resolved.workspaceId },
        select: { id: true, slug: true },
      }),
    ]);
    return {
      priorities: priorities.map((p) => ({ id: p.id, key: p.key })),
      members: members.map((m) => ({ id: m.user.id, handle: m.user.handle })),
      labels,
      projects: allProjects,
    };
  };

  return {
    resolved,
    userId,
    scope,
    targetKey: `${target.kind}:${target.id}`,
    boardBase:
      resolved.projectId && place.slug
        ? projectPath(resolved.workspaceId, place.slug, "")
        : workspacePath(resolved.workspaceId, "issues"),
    slugs: () => {
      slugs ??= loadSlugs();
      return slugs;
    },
    base: {
      AND: [
        { projectId: { in: resolved.projectIds } },
        scope === "mine" ? { assigneeId: userId } : {},
        viewWhere,
      ],
    },
    window,
    previous: previousWindow(window, range),
    closed: ids(["completed", "canceled"]),
    started: ids(["started"]),
    completed: ids(["completed"]),
    statuses,
    priorities,
    types,
    prefixes: new Map(projects.map((p) => [p.id, p.prefix])),
    statusById: new Map(statuses.map((s) => [s.id, s])),
  };
}

function mapIssue(ctx: Ctx, row: IssueRow): Promise<DashboardIssue> {
  const status = ctx.statusById.get(row.status);
  return (async () => ({
    id: row.id,
    ref: `${ctx.prefixes.get(row.projectId) ?? "?"}-${row.key}`,
    title: row.title,
    statusName: status?.name ?? row.status,
    statusColor: status?.color ?? "#8a9099",
    priority: row.priority,
    assignee: row.assignee ? await mapUser(row.assignee) : null,
    updated: row.updated.getTime(),
    dueDate: row.dueDate?.getTime() ?? null,
    storyPoints: row.storyPoints,
  }))();
}

/** The issues a number counts, as a `where` — for its "second number" and
 *  its mini list (elements). */
function metricWhere(ctx: Ctx, metric: KpiMetric): Where {
  const open: Where = { status: { notIn: ctx.closed } };
  const inWindow = { gte: ctx.window.from, lt: ctx.window.to };
  switch (metric) {
    case "open":
      return open;
    case "inProgress":
      return { status: { in: ctx.started } };
    case "inReview":
      return { status: "in_review" };
    case "created":
      return { created: inWindow };
    case "closed":
    case "cycleTime":
      return { closedAt: inWindow };
    case "overdue":
      return { ...open, dueDate: { lt: todayStart() } };
    case "dueSoon":
      return {
        ...open,
        dueDate: {
          gte: todayStart(),
          lt: new Date(todayStart().getTime() + 7 * DAY),
        },
      };
    case "unassigned":
      return { ...open, assigneeId: null };
    case "urgent":
      return { ...open, priority: { gte: 4 } };
    case "total":
      return {};
  }
}

/** "Second number": the same set narrowed by an extra filter. */
async function secondNumber(
  ctx: Ctx,
  base: Where,
  widget: Widget,
  extra: [string, string][],
  measure: Measure,
): Promise<{ value: number; href: string | null } | null> {
  const second = elementOf(widget, "second");
  if (!second?.filter?.rules.length) return null;
  const narrow = await filterWhere(second.filter);
  const own = widget.config.filter;
  const both: IssueFilter = {
    op: "and",
    rules: [...(own?.rules ?? []), ...second.filter.rules],
  };
  return {
    value: await measureOf({ AND: [base, narrow] }, measure),
    href: await boardHref(ctx, both, extra),
  };
}

/**
 * The board, filtered to exactly what a number counts: the dashboard's
 * scope ("mine"), a view's filter, the widget's own filter and the metric's
 * condition. Rules joined by AND — the board reads repeated keys as such.
 */
async function boardHref(
  ctx: Ctx,
  own: IssueFilter | undefined,
  extra: [string, string][],
): Promise<string> {
  const lookups = await ctx.slugs();
  const params = new URLSearchParams();
  const add = (filter: IssueFilter | null | undefined) => {
    if (!filter?.rules.length) return;
    for (const [key, value] of filterToParams(
      mapFilterValues(filter, idToSlug(lookups)),
    ))
      params.append(key, value);
  };
  add(ctx.resolved.viewFilter);
  add(own);
  if (ctx.scope === "mine") params.append("assignee", "@me");
  for (const [key, value] of extra) params.append(key, value);
  const query = params.toString();
  return query ? `${ctx.boardBase}?${query}` : ctx.boardBase;
}

const OPEN_PARAM: [string, string] = [
  "statusCategory.not",
  "completed,canceled",
];

/** What a number counts, as board filter parameters. */
/** Board params for a date column within `[from, to)`. The board's
 *  "after" starts the day after, its "before" ends the day before — so
 *  the day before `from`, and `to` itself. */
function between(
  field: "created" | "updated" | "dueDate",
  from: Date,
  to?: Date,
): [string, string][] {
  const before = new Date(from);
  before.setDate(before.getDate() - 1);
  return [
    [`${field}.after`, bucketKey(before)],
    ...(to ? ([[`${field}.before`, bucketKey(to)]] as [string, string][]) : []),
  ];
}

function metricParams(ctx: Ctx, metric: KpiMetric): [string, string][] {
  switch (metric) {
    case "open":
      return [OPEN_PARAM];
    case "inProgress":
      return [["statusCategory", "started"]];
    case "inReview":
      return [["status", "in_review"]];
    case "created":
      return between("created", ctx.window.from);
    case "closed":
    case "cycleTime":
      return [
        ["statusCategory", "completed"],
        ...between("updated", ctx.window.from),
      ];
    case "overdue":
      return [OPEN_PARAM, ["dueDate.within", "overdue"]];
    case "dueSoon":
      return [OPEN_PARAM, ["dueDate.within", "next_7_days"]];
    case "unassigned":
      return [OPEN_PARAM, ["assignee.empty", "1"]];
    case "urgent": {
      const top = [...ctx.priorities].sort((a, b) => b.id - a.id)[0];
      return top ? [OPEN_PARAM, ["priority", top.key]] : [OPEN_PARAM];
    }
    case "total":
      return [];
  }
}

const todayStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

// ── Time series helpers ─────────────────────────────────────────────────────

/** The fields every measured read needs — a weight and every group key. */
const AGG_SELECT = {
  storyPoints: true,
  estimateHours: true,
  status: true,
  priority: true,
  type: true,
  assigneeId: true,
  projectId: true,
  labels: true,
} as const;

type AggRow = Prisma.IssueGetPayload<{ select: typeof AGG_SELECT }>;

/** What one issue adds to a measure (BARY-170). */
function weightOf(measure: Measure): (row: AggRow) => number {
  if (measure === "storyPoints") return (row) => row.storyPoints ?? 0;
  if (measure === "estimate") return (row) => row.estimateHours ?? 0;
  return () => 1;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Issues (or their points/hours) matching `where` — one number. */
async function measureOf(where: Where, measure: Measure): Promise<number> {
  if (measure === "count") return db.issue.count({ where });
  const result = await db.issue.aggregate({
    where,
    _sum: { storyPoints: true, estimateHours: true },
  });
  return round1(
    measure === "storyPoints"
      ? (result._sum.storyPoints ?? 0)
      : (result._sum.estimateHours ?? 0),
  );
}

interface Dated {
  date: Date;
  w: number;
  row: AggRow;
}

/** Sum weights per bucket of `window`, every bucket present. */
function bucketSums(items: Dated[], window: Window): number[] {
  const index = new Map(window.keys.map((key, i) => [key, i]));
  const sums = window.keys.map(() => 0);
  for (const item of items) {
    const i = index.get(bucketKey(truncate(item.date, window.unit)));
    if (i !== undefined) sums[i] += item.w;
  }
  return sums.map(round1);
}

/** Issues whose date `column` falls in `[from, to)`, weighted. */
async function datesIn(
  where: Where,
  column: "created" | "closedAt" | "dueDate",
  from: Date,
  to: Date,
  measure: Measure = "count",
): Promise<Dated[]> {
  const rows = await db.issue.findMany({
    where: { AND: [where, { [column]: { gte: from, lt: to } }] },
    select: { ...AGG_SELECT, [column]: true },
  });
  const weight = weightOf(measure);
  return rows.flatMap((row) => {
    const date = (row as unknown as Record<string, Date | null>)[column];
    return date ? [{ date, w: weight(row as AggRow), row: row as AggRow }] : [];
  });
}

/** The group key(s) of an issue for a field — labels can be several. */
function keysOf(ctx: Ctx, row: AggRow, field: GroupField): string[] {
  switch (field) {
    case "status":
      return [row.status];
    case "statusCategory":
      return [ctx.statusById.get(row.status)?.category ?? "backlog"];
    case "priority":
      return [String(row.priority)];
    case "type":
      return [row.type];
    case "assignee":
      return [row.assigneeId ?? "_none"];
    case "project":
      return [row.projectId];
    case "label":
      return row.labels.length ? row.labels : ["_none"];
  }
}

/** Closed issues in a window with their cycle time in days. */
async function cyclesIn(where: Where, from: Date, to: Date, take = 2000) {
  const rows = await db.issue.findMany({
    where: { AND: [where, { closedAt: { gte: from, lt: to } }] },
    select: {
      id: true,
      key: true,
      title: true,
      projectId: true,
      created: true,
      closedAt: true,
    },
    orderBy: { closedAt: "desc" },
    take,
  });
  return rows.flatMap((row) =>
    row.closedAt
      ? [
          {
            ...row,
            closedAt: row.closedAt,
            days:
              Math.max(0, row.closedAt.getTime() - row.created.getTime()) / DAY,
          },
        ]
      : [],
  );
}

const avg = (values: number[]) =>
  values.length === 0
    ? null
    : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, i)] * 10) / 10;
}

// ── The widgets ──────────────────────────────────────────────────────────────

async function kpi(
  ctx: Ctx,
  where: Where,
  metric: KpiMetric,
  own: IssueFilter | undefined,
  measure: Measure,
  widget: Widget,
): Promise<WidgetData> {
  const params = metricParams(ctx, metric);
  const [href, data] = await Promise.all([
    boardHref(ctx, own, params),
    kpiValue(ctx, where, metric, measure),
  ]);
  if (data.type !== "kpi") return data;
  const counted: Where = { AND: [where, metricWhere(ctx, metric)] };
  const list = elementOf(widget, "miniList");
  const [second, rows] = await Promise.all([
    secondNumber(ctx, counted, widget, params, measure),
    list
      ? db.issue.findMany({
          where: counted,
          select: ISSUE_SELECT,
          orderBy: [{ priority: "desc" }, { updated: "desc" }],
          take: Math.min(10, Math.max(1, list.value ?? 3)),
        })
      : Promise.resolve([]),
  ]);
  return {
    ...data,
    href,
    second,
    list: await Promise.all(rows.map((row) => mapIssue(ctx, row))),
  };
}

async function kpiValue(
  ctx: Ctx,
  where: Where,
  metric: KpiMetric,
  measure: Measure,
): Promise<WidgetData> {
  const { window, previous } = ctx;
  const open: Where = { status: { notIn: ctx.closed } };
  const count = (extra: Where) => measureOf({ AND: [where, extra] }, measure);

  switch (metric) {
    case "open": {
      const [now, created, closed] = await Promise.all([
        count(open),
        datesIn(where, "created", window.from, window.to, measure),
        datesIn(where, "closedAt", window.from, window.to, measure),
      ]);
      // Walk back from now: the open pile at each bucket's end.
      const c = bucketSums(created, window);
      const d = bucketSums(closed, window);
      const spark = window.keys.map(() => 0);
      let level = now;
      for (let i = window.keys.length - 1; i >= 0; i--) {
        spark[i] = round1(level);
        level -= c[i] - d[i];
      }
      return {
        type: "kpi",
        value: now,
        previous: round1(level),
        spark,
        href: null,
      };
    }
    case "created":
    case "closed": {
      const column = metric === "created" ? "created" : "closedAt";
      const [dates, before] = await Promise.all([
        datesIn(where, column, window.from, window.to, measure),
        count({ [column]: { gte: previous.from, lt: previous.to } }),
      ]);
      return {
        type: "kpi",
        value: round1(dates.reduce((a, d) => a + d.w, 0)),
        previous: before,
        spark: bucketSums(dates, window),
        href: null,
      };
    }
    case "cycleTime": {
      const [now, before] = await Promise.all([
        cyclesIn(where, window.from, window.to),
        cyclesIn(where, previous.from, previous.to),
      ]);
      return {
        type: "kpi",
        value: avg(now.map((x) => x.days)),
        previous: avg(before.map((x) => x.days)),
        spark: cycleSpark(now, window).map((v) => v ?? 0),
        href: null,
      };
    }
    case "inProgress":
      return stock(await count({ status: { in: ctx.started } }));
    case "inReview":
      return stock(await count({ status: "in_review" }));
    case "overdue":
      return stock(await count({ ...open, dueDate: { lt: todayStart() } }));
    case "dueSoon":
      return stock(
        await count({
          ...open,
          dueDate: {
            gte: todayStart(),
            lt: new Date(todayStart().getTime() + 7 * DAY),
          },
        }),
      );
    case "unassigned":
      return stock(await count({ ...open, assigneeId: null }));
    case "urgent":
      return stock(await count({ ...open, priority: { gte: 4 } }));
    case "total":
      return stock(await count({}));
  }
}

const stock = (value: number): WidgetData => ({
  type: "kpi",
  value,
  previous: null,
  spark: null,
  href: null,
});

function cycleSpark(
  rows: { closedAt: Date; days: number }[],
  window: Window,
): (number | null)[] {
  const index = new Map(window.keys.map((key, i) => [key, i]));
  const sums = window.keys.map(() => [] as number[]);
  for (const row of rows) {
    const i = index.get(bucketKey(truncate(row.closedAt, window.unit)));
    if (i !== undefined) sums[i].push(row.days);
  }
  return sums.map(avg);
}

async function progress(
  ctx: Ctx,
  where: Where,
  measure: Measure,
): Promise<WidgetData> {
  const canceled = ctx.closed.filter((id) => !ctx.completed.includes(id));
  const scoped: Where = { AND: [where, { status: { notIn: canceled } }] };
  const [total, done, inProgress] = await Promise.all([
    measureOf(scoped, measure),
    measureOf({ AND: [where, { status: { in: ctx.completed } }] }, measure),
    measureOf({ AND: [where, { status: { in: ctx.started } }] }, measure),
  ]);
  return { type: "progress", total, done, inProgress, href: null };
}

const COLUMN: Record<
  Exclude<GroupField, "label" | "statusCategory">,
  "status" | "priority" | "type" | "assigneeId" | "projectId"
> = {
  status: "status",
  priority: "priority",
  type: "type",
  assignee: "assigneeId",
  project: "projectId",
};

/** Name and color for every key an axis can have, in its natural order. */
async function axisFor(
  ctx: Ctx,
  field: GroupField,
  keys: string[],
): Promise<Slice[]> {
  switch (field) {
    case "statusCategory":
      // Named on the client (`category_*`); colors match the status ladder.
      return STATUS_CATEGORIES.map((key) => ({
        key,
        label: "",
        color: CATEGORY_COLORS[key],
        count: 0,
      }));
    case "status":
      return ctx.statuses.map((s) => ({
        key: s.id,
        label: s.name,
        color: s.color,
        count: 0,
      }));
    case "priority":
      return [...ctx.priorities]
        .sort((a, b) => b.id - a.id)
        .map((p) => ({
          key: String(p.id),
          label: p.name,
          color: p.color,
          count: 0,
        }));
    case "type":
      return ctx.types.map((t) => ({
        key: t.id,
        label: t.name,
        color: t.color,
        count: 0,
      }));
    case "assignee": {
      const users = await db.user.findMany({
        where: { id: { in: keys.filter((k) => k !== "_none") } },
        select: USER_SELECT,
      });
      const mapped = await Promise.all(users.map(mapUser));
      return [
        ...mapped.map((user) => ({
          key: user.id,
          label: `${user.firstName} ${user.lastName}`.trim(),
          color: user.color,
          count: 0,
          user,
        })),
        { key: "_none", label: "", color: "#8a9099", count: 0, user: null },
      ];
    }
    case "project": {
      const projects = await db.project.findMany({
        where: { id: { in: keys } },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      });
      return projects.map((p) => ({
        key: p.id,
        label: p.name,
        color: p.color,
        count: 0,
      }));
    }
    case "label": {
      const labels = await db.label.findMany({
        where: { id: { in: keys } },
        select: { id: true, name: true, color: true },
      });
      return [
        ...labels.map((l) => ({
          key: l.id,
          label: l.name,
          color: l.color,
          count: 0,
        })),
        { key: "_none", label: "", color: "#8a9099", count: 0 },
      ];
    }
  }
}

/** The measure per key of one field — issues, points or hours. */
async function countsBy(
  ctx: Ctx,
  where: Where,
  field: GroupField,
  measure: Measure = "count",
): Promise<Map<string, number>> {
  if (field === "label") {
    const rows = await db.issue.findMany({ where, select: AGG_SELECT });
    const weight = weightOf(measure);
    const counts = new Map<string, number>();
    for (const row of rows)
      for (const key of keysOf(ctx, row, field))
        counts.set(key, (counts.get(key) ?? 0) + weight(row));
    return new Map([...counts].map(([k, v]) => [k, round1(v)]));
  }
  const column = field === "statusCategory" ? "status" : COLUMN[field];
  const rows = await db.issue.groupBy({
    by: [column],
    where,
    _count: { _all: true },
    _sum: { storyPoints: true, estimateHours: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = String((row as Record<string, unknown>)[column] ?? "_none");
    const key =
      field === "statusCategory"
        ? (ctx.statusById.get(raw)?.category ?? "backlog")
        : raw;
    const value =
      measure === "storyPoints"
        ? (row._sum.storyPoints ?? 0)
        : measure === "estimate"
          ? (row._sum.estimateHours ?? 0)
          : row._count._all;
    counts.set(key, round1((counts.get(key) ?? 0) + value));
  }
  return counts;
}

/** Ladder fields keep their order; people, projects and labels go by size. */
const LADDER = new Set<GroupField>([
  "status",
  "statusCategory",
  "priority",
  "type",
]);

/** Board params for one value of a field — `null` for "everything else". */
async function sliceParams(
  ctx: Ctx,
  field: GroupField,
  key: string,
): Promise<[string, string][] | null> {
  if (key === "_other") return null;
  if (key === "_none") {
    return field === "assignee"
      ? [["assignee.empty", "1"]]
      : field === "label"
        ? [["label.empty", "1"]]
        : null;
  }
  const lookups = await ctx.slugs();
  switch (field) {
    case "statusCategory":
      return [["statusCategory", key]];
    case "status":
      return [["status", key]];
    case "type":
      return [["type", key]];
    case "priority": {
      const p = lookups.priorities.find((x) => String(x.id) === key);
      return p ? [["priority", p.key]] : null;
    }
    case "assignee": {
      const m = lookups.members.find((x) => x.id === key);
      return m ? [["assignee", m.handle]] : null;
    }
    case "label": {
      const l = lookups.labels.find((x) => x.id === key);
      return l ? [["label", l.slug]] : null;
    }
    case "project": {
      const p = lookups.projects?.find((x) => x.id === key);
      return p ? [["project", p.slug]] : null;
    }
  }
}

async function distribution(
  ctx: Ctx,
  where: Where,
  field: GroupField,
  openOnly: boolean,
  own: IssueFilter | undefined,
  measure: Measure,
): Promise<WidgetData> {
  const scoped = openOnly
    ? { AND: [where, { status: { notIn: ctx.closed } }] }
    : where;
  const counts = await countsBy(ctx, scoped, field, measure);
  const axis = await axisFor(ctx, field, [...counts.keys()]);
  let slices = axis
    .map((slice) => ({ ...slice, count: counts.get(slice.key) ?? 0 }))
    .filter((slice) => slice.count > 0);
  if (!LADDER.has(field)) slices.sort((a, b) => b.count - a.count);
  const total = round1([...counts.values()].reduce((a, b) => a + b, 0));
  if (slices.length > SLICE_LIMIT) {
    const rest = slices.slice(SLICE_LIMIT - 1);
    slices = [
      ...slices.slice(0, SLICE_LIMIT - 1),
      {
        key: "_other",
        label: "",
        color: "#8a9099",
        count: round1(rest.reduce((a, b) => a + b.count, 0)),
      },
    ];
  }
  // Each part opens the board filtered to its value.
  const withHrefs = await Promise.all(
    slices.map(async (slice) => {
      const params = await sliceParams(ctx, field, slice.key);
      return {
        ...slice,
        href: params
          ? await boardHref(ctx, own, [
              ...(openOnly ? [OPEN_PARAM] : []),
              ...params,
            ])
          : null,
      };
    }),
  );
  return { type: "distribution", slices: withHrefs, total };
}

async function attention(ctx: Ctx, where: Where): Promise<WidgetData> {
  const today = todayStart();
  const staleBefore = new Date(Date.now() - STALE_DAYS * DAY);
  const scoped: Where = {
    AND: [
      where,
      { status: { notIn: ctx.closed } },
      {
        OR: [
          { dueDate: { lt: today } },
          { priority: { gte: 3 } },
          { status: { in: ctx.started }, updated: { lt: staleBefore } },
        ],
      },
    ],
  };
  const [rows, total] = await Promise.all([
    db.issue.findMany({
      where: scoped,
      select: ISSUE_SELECT,
      orderBy: [{ priority: "desc" }, { updated: "asc" }],
      take: 200,
    }),
    db.issue.count({ where: scoped }),
  ]);
  const reasonOf = (row: IssueRow): AttentionReason =>
    row.dueDate && row.dueDate < today
      ? "overdue"
      : row.priority >= 4 && !row.assignee
        ? "unassigned"
        : row.priority >= 3
          ? "urgent"
          : "stale";
  const rank: Record<AttentionReason, number> = {
    overdue: 0,
    unassigned: 1,
    urgent: 2,
    stale: 3,
  };
  const picked = rows
    .map((row) => ({ row, reason: reasonOf(row) }))
    .sort((a, b) => rank[a.reason] - rank[b.reason])
    .slice(0, LIST_LIMIT);
  return {
    type: "attention",
    total,
    issues: await Promise.all(
      picked.map(async ({ row, reason }) => ({
        ...(await mapIssue(ctx, row)),
        reason,
      })),
    ),
  };
}

async function issues(
  ctx: Ctx,
  where: Where,
  sort: Widget["config"]["sort"],
  openOnly: boolean,
  widget: Widget,
): Promise<WidgetData> {
  const scoped = openOnly
    ? { AND: [where, { status: { notIn: ctx.closed } }] }
    : where;
  const orderBy: Prisma.IssueOrderByWithRelationInput[] =
    sort === "created"
      ? [{ created: "desc" }]
      : sort === "dueDate"
        ? [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }]
        : sort === "priority"
          ? [{ priority: "desc" }, { updated: "desc" }]
          : [{ updated: "desc" }];
  const [rows, total] = await Promise.all([
    db.issue.findMany({
      where: scoped,
      select: ISSUE_SELECT,
      orderBy,
      take: Math.min(
        30,
        Math.max(1, elementOf(widget, "rows")?.value ?? LIST_LIMIT),
      ),
    }),
    db.issue.count({ where: scoped }),
  ]);
  // The labels column needs names and colors.
  const labelIds = elementOf(widget, "col_labels")
    ? [...new Set(rows.flatMap((r) => r.labels))]
    : [];
  const labels = labelIds.length
    ? new Map(
        (
          await db.label.findMany({
            where: { id: { in: labelIds } },
            select: { id: true, name: true, color: true },
          })
        ).map((l) => [l.id, l]),
      )
    : null;
  return {
    type: "issues",
    total,
    // "Open as list →" (element "link").
    href: elementOf(widget, "link")
      ? await boardHref(ctx, widget.config.filter, openOnly ? [OPEN_PARAM] : [])
      : null,
    issues: await Promise.all(
      rows.map(async (row) => ({
        ...(await mapIssue(ctx, row)),
        ...(labels && {
          labels: row.labels.flatMap((id) => {
            const l = labels.get(id);
            return l ? [{ name: l.name, color: l.color }] : [];
          }),
        }),
      })),
    ),
  };
}

/** Buckets of the same length as `window`, from today forward — for due
 *  dates, which lie ahead. */
function forwardWindow(window: Window): Window {
  const from = truncate(new Date(), window.unit);
  const keys = window.keys.map((_, i) => bucketKey(step(from, window.unit, i)));
  return {
    from,
    to: step(from, window.unit, window.keys.length),
    unit: window.unit,
    keys,
  };
}

const SERIES_LIMIT = 6;

/**
 * A time series (BARY-170): created and closed side by side, or one date
 * — created, closed or due — on its own or split by a field. Each value
 * is a link to the board filtered to its bucket (and group).
 */
async function flow(
  ctx: Ctx,
  where: Where,
  own: IssueFilter | undefined,
  config: Widget["config"],
): Promise<WidgetData> {
  const timeBy = config.timeBy ?? "createdClosed";
  const measure = config.measure ?? "count";
  const window = timeBy === "due" ? forwardWindow(ctx.window) : ctx.window;
  const starts = window.keys.map((key) => {
    const [y, m, dd] = key.split("-").map(Number);
    return new Date(y, m - 1, dd);
  });
  const end = (i: number) => starts[i + 1] ?? window.to;

  /** Board params for bucket `i` of a date. */
  const bucketParams = (
    by: Exclude<typeof timeBy, "createdClosed">,
    i: number,
  ): [string, string][] =>
    by === "created"
      ? between("created", starts[i], end(i))
      : by === "closed"
        ? [
            ["statusCategory", "completed"],
            ...between("updated", starts[i], end(i)),
          ]
        : between("dueDate", starts[i], end(i));

  const series = async (
    key: string,
    label: string,
    color: string,
    values: number[],
    params: (i: number) => [string, string][],
  ) => ({
    key,
    label,
    color,
    values,
    total: round1(values.reduce((a, b) => a + b, 0)),
    hrefs: await Promise.all(
      values.map((v, i) => (v ? boardHref(ctx, own, params(i)) : null)),
    ),
  });

  // "Previous period": the main series a range earlier, bucket by bucket.
  const previousOf = async (
    column: "created" | "closedAt",
  ): Promise<number[] | null> => {
    if (!elementOf({ id: "", type: "flow", size: "XL", config }, "previous"))
      return null;
    const prev = ctx.previous;
    const items = await datesIn(where, column, prev.from, prev.to, measure);
    return bucketSums(items, prev);
  };

  if (timeBy === "createdClosed") {
    const [created, closed, previous] = await Promise.all([
      datesIn(where, "created", window.from, window.to, measure),
      datesIn(where, "closedAt", window.from, window.to, measure),
      previousOf("created"),
    ]);
    return {
      type: "flow",
      dates: window.keys,
      previous,
      timeBy,
      series: [
        await series(
          "created",
          "",
          "var(--chart-1)",
          bucketSums(created, window),
          (i) => bucketParams("created", i),
        ),
        await series(
          "closed",
          "",
          "var(--chart-3)",
          bucketSums(closed, window),
          (i) => bucketParams("closed", i),
        ),
      ],
    };
  }

  const column =
    timeBy === "created"
      ? "created"
      : timeBy === "closed"
        ? "closedAt"
        : "dueDate";
  const items = await datesIn(where, column, window.from, window.to, measure);
  const split = config.splitBy;

  if (!split) {
    return {
      type: "flow",
      dates: window.keys,
      previous:
        timeBy === "due"
          ? null
          : await previousOf(timeBy === "created" ? "created" : "closedAt"),
      timeBy,
      series: [
        await series(
          "all",
          "",
          "var(--accent)",
          bucketSums(items, window),
          (i) => bucketParams(timeBy, i),
        ),
      ],
    };
  }

  // Split: one series per value, the biggest few, the rest as "other".
  const byKey = new Map<string, Dated[]>();
  for (const item of items)
    for (const key of keysOf(ctx, item.row, split))
      byKey.set(key, [...(byKey.get(key) ?? []), item]);
  const axis = await axisFor(ctx, split, [...byKey.keys()]);
  const ranked = axis
    .filter((slice) => byKey.has(slice.key))
    .map((slice) => ({
      slice,
      values: bucketSums(byKey.get(slice.key) ?? [], window),
    }))
    .sort((a, b) =>
      LADDER.has(split)
        ? 0
        : b.values.reduce((x, y) => x + y, 0) -
          a.values.reduce((x, y) => x + y, 0),
    );
  const shown = ranked.slice(0, SERIES_LIMIT);
  const rest = ranked.slice(SERIES_LIMIT);
  const out = await Promise.all(
    shown.map(async ({ slice, values }) => {
      const group = await sliceParams(ctx, split, slice.key);
      return series(slice.key, slice.label, slice.color, values, (i) => [
        ...bucketParams(timeBy, i),
        ...(group ?? []),
      ]);
    }),
  );
  if (rest.length) {
    const values = window.keys.map((_, i) =>
      round1(rest.reduce((a, r) => a + r.values[i], 0)),
    );
    out.push({
      key: "_other",
      label: "",
      color: "#8a9099",
      values,
      total: round1(values.reduce((a, b) => a + b, 0)),
      hrefs: values.map(() => null),
    });
  }
  return {
    type: "flow",
    dates: window.keys,
    previous: null,
    timeBy,
    series: out,
  };
}

async function burnup(ctx: Ctx, where: Where): Promise<WidgetData> {
  const { window } = ctx;
  const [totalBefore, doneBefore, created, closed] = await Promise.all([
    db.issue.count({
      where: { AND: [where, { created: { lt: window.from } }] },
    }),
    db.issue.count({
      where: { AND: [where, { closedAt: { lt: window.from } }] },
    }),
    datesIn(where, "created", window.from, window.to),
    datesIn(where, "closedAt", window.from, window.to),
  ]);
  const c = bucketSums(created, window);
  const d = bucketSums(closed, window);
  let total = totalBefore;
  let done = doneBefore;
  return {
    type: "burnup",
    points: window.keys.map((date, i) => {
      total += c[i];
      done += d[i];
      return { date, total, done };
    }),
  };
}

async function cycle(ctx: Ctx, where: Where): Promise<WidgetData> {
  const { window, previous } = ctx;
  const [now, before] = await Promise.all([
    cyclesIn(where, window.from, window.to),
    cyclesIn(where, previous.from, previous.to),
  ]);
  const sorted = now.map((x) => x.days).sort((a, b) => a - b);
  return {
    type: "cycle",
    avg: avg(sorted),
    previous: avg(before.map((x) => x.days)),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    points: now.slice(0, 300).map((row) => ({
      id: row.id,
      ref: `${ctx.prefixes.get(row.projectId) ?? "?"}-${row.key}`,
      title: row.title,
      closed: row.closedAt.getTime(),
      days: Math.round(row.days * 10) / 10,
    })),
    spark: cycleSpark(now, window),
  };
}

async function workload(
  ctx: Ctx,
  where: Where,
  own: IssueFilter | undefined,
): Promise<WidgetData> {
  const rows = await db.issue.groupBy({
    by: ["assigneeId", "status"],
    where: { AND: [where, { status: { notIn: ctx.closed } }] },
    _count: { _all: true },
  });
  const ids = [
    ...new Set(
      rows.map((r) => r.assigneeId).filter((id): id is string => !!id),
    ),
  ];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: USER_SELECT,
  });
  const byId = new Map(
    await Promise.all(
      users.map(async (u) => [u.id, await mapUser(u)] as const),
    ),
  );
  const totals = new Map<string, { open: number; inProgress: number }>();
  for (const row of rows) {
    const key = row.assigneeId ?? "";
    const entry = totals.get(key) ?? { open: 0, inProgress: 0 };
    entry.open += row._count._all;
    if (ctx.started.includes(row.status)) entry.inProgress += row._count._all;
    totals.set(key, entry);
  }
  const list: WorkloadRow[] = [...totals.entries()]
    .map(([id, counts]) => ({
      user: id ? (byId.get(id) ?? null) : null,
      ...counts,
    }))
    .sort(
      (a, b) =>
        b.open - a.open ||
        (a.user?.firstName ?? "").localeCompare(b.user?.firstName ?? ""),
    );
  // Each person opens the board with their open issues.
  const lookups = await ctx.slugs();
  const withHrefs = await Promise.all(
    list.map(async (row) => {
      const handle = row.user
        ? lookups.members.find((m) => m.id === row.user?.id)?.handle
        : null;
      const param: [string, string] | null = row.user
        ? handle
          ? ["assignee", handle]
          : null
        : ["assignee.empty", "1"];
      return {
        ...row,
        href: param ? await boardHref(ctx, own, [OPEN_PARAM, param]) : null,
      };
    }),
  );
  return { type: "workload", rows: withHrefs };
}

async function matrix(
  ctx: Ctx,
  where: Where,
  rowField: GroupField,
  colField: GroupField,
  openOnly: boolean,
  measure: Measure,
): Promise<WidgetData> {
  // Labels and status groups can't be an axis (see `MATRIX_FIELDS`); fall
  // back to status.
  const rf =
    rowField === "label" || rowField === "statusCategory" ? "status" : rowField;
  const cf =
    colField === "label" || colField === "statusCategory" || colField === rf
      ? rf === "status"
        ? "priority"
        : "status"
      : colField;
  const scoped = openOnly
    ? { AND: [where, { status: { notIn: ctx.closed } }] }
    : where;
  const r = COLUMN[rf];
  const c = COLUMN[cf];
  const rows = await db.issue.groupBy({
    by: r === c ? [r] : [r, c],
    where: scoped,
    _count: { _all: true },
    _sum: { storyPoints: true, estimateHours: true },
  });
  const measured = (row: (typeof rows)[number]) =>
    measure === "storyPoints"
      ? (row._sum.storyPoints ?? 0)
      : measure === "estimate"
        ? (row._sum.estimateHours ?? 0)
        : row._count._all;
  const keyOf = (row: Record<string, unknown>, column: string) =>
    String(row[column] ?? "_none");
  const rowKeys = new Set(rows.map((row) => keyOf(row, r)));
  const colKeys = new Set(rows.map((row) => keyOf(row, c)));
  const [rowAxis, colAxis] = await Promise.all([
    axisFor(ctx, rf, [...rowKeys]),
    axisFor(ctx, cf, [...colKeys]),
  ]);
  const rowsUsed = rowAxis.filter((s) => rowKeys.has(s.key)).slice(0, 12);
  const colsUsed = colAxis.filter((s) => colKeys.has(s.key)).slice(0, 8);
  const cells = rowsUsed.map(() => colsUsed.map(() => 0));
  for (const row of rows) {
    const i = rowsUsed.findIndex((s) => s.key === keyOf(row, r));
    const j = colsUsed.findIndex((s) => s.key === keyOf(row, c));
    if (i >= 0 && j >= 0) cells[i][j] = round1(cells[i][j] + measured(row));
  }
  for (const [i, s] of rowsUsed.entries())
    s.count = cells[i].reduce((a, b) => a + b, 0);
  for (const [j, s] of colsUsed.entries())
    s.count = cells.reduce((a, row) => a + row[j], 0);
  // Nothing measured (e.g. no story points set): nothing to draw.
  if (cells.every((row) => row.every((v) => v === 0))) {
    return { type: "matrix", rows: [], cols: [], cells: [], max: 0 };
  }
  return {
    type: "matrix",
    rows: rowsUsed,
    cols: colsUsed,
    cells,
    max: Math.max(0, ...cells.flat()),
  };
}

/** Upper bounds of the age buckets, in days. */
const AGE_BOUNDS = [7, 14, 28, 90];

async function age(ctx: Ctx, where: Where): Promise<WidgetData> {
  const scoped: Where = { AND: [where, { status: { notIn: ctx.closed } }] };
  const [dates, oldest] = await Promise.all([
    db.issue.findMany({ where: scoped, select: { created: true } }),
    db.issue.findMany({
      where: scoped,
      select: ISSUE_SELECT,
      orderBy: { created: "asc" },
      take: 5,
    }),
  ]);
  const now = Date.now();
  const days = dates.map((row) => (now - row.created.getTime()) / DAY);
  const buckets = [0, 0, 0, 0, 0];
  for (const d of days) {
    const i = AGE_BOUNDS.findIndex((bound) => d < bound);
    buckets[i < 0 ? 4 : i]++;
  }
  return {
    type: "age",
    buckets,
    avg: avg(days) === null ? null : Math.round(avg(days) ?? 0),
    oldest: await Promise.all(oldest.map((row) => mapIssue(ctx, row))),
  };
}

const aboutFor = cache(
  async (
    workspaceId: string,
    projectId: string | null,
  ): Promise<AboutData | null> => {
    const statuses = await db.status.findMany({
      select: { id: true, category: true },
    });
    const idsIn = (...cats: string[]) =>
      statuses.filter((s) => cats.includes(s.category)).map((s) => s.id);
    const notClosed = { notIn: idsIn("completed", "canceled") };
    /** Done, started and all-but-canceled within these projects. */
    const progressIn = async (projectIds: string[]) => {
      const scope = { projectId: { in: projectIds } };
      const [done, inProgress, total] = await Promise.all([
        db.issue.count({
          where: { ...scope, status: { in: idsIn("completed") } },
        }),
        db.issue.count({
          where: { ...scope, status: { in: idsIn("started") } },
        }),
        db.issue.count({
          where: { ...scope, status: { notIn: idsIn("canceled") } },
        }),
      ]);
      return { done, inProgress, total };
    };

    if (projectId) {
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: {
          name: true,
          desc: true,
          color: true,
          avatarKey: true,
          prefix: true,
          createdAt: true,
          members: {
            select: { user: { select: USER_SELECT } },
            orderBy: { user: { firstName: "asc" } },
          },
        },
      });
      if (!project) return null;
      const [open, teams, progress] = await Promise.all([
        db.issue.count({ where: { projectId, status: notClosed } }),
        db.teamProject.count({ where: { projectId } }),
        progressIn([projectId]),
      ]);
      return {
        kind: "project",
        name: project.name,
        desc: project.desc,
        color: project.color,
        avatarUrl: await resolveAvatarUrl(project.avatarKey),
        prefix: project.prefix,
        createdAt: project.createdAt.getTime(),
        members: await Promise.all(
          project.members.slice(0, 8).map((m) => mapUser(m.user)),
        ),
        memberCount: project.members.length,
        open,
        projects: null,
        teams,
        progress,
        links: [],
        editHref: (await placeOf(workspaceId, projectId)).project.has(
          "project.update",
        )
          ? projectSettingsPath(
              workspaceId,
              (await placeOf(workspaceId, projectId)).slug ?? "",
              "",
            )
          : null,
      };
    }

    const [workspace, visible] = await Promise.all([
      db.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          name: true,
          desc: true,
          color: true,
          avatarKey: true,
          createdAt: true,
          links: {
            select: { id: true, label: true, url: true },
            orderBy: { position: "asc" },
          },
          members: {
            select: { user: { select: USER_SELECT } },
            orderBy: { user: { firstName: "asc" } },
          },
        },
      }),
      visibleProjectIds(workspaceId),
    ]);
    if (!workspace) return null;
    const [open, teams, progress] = await Promise.all([
      db.issue.count({
        where: { projectId: { in: [...visible] }, status: notClosed },
      }),
      db.team.count({ where: { workspaceId } }),
      progressIn([...visible]),
    ]);
    return {
      kind: "workspace",
      name: workspace.name,
      desc: workspace.desc,
      color: workspace.color,
      avatarUrl: await resolveAvatarUrl(workspace.avatarKey),
      prefix: null,
      createdAt: workspace.createdAt.getTime(),
      members: await Promise.all(
        workspace.members.slice(0, 8).map((m) => mapUser(m.user)),
      ),
      memberCount: workspace.members.length,
      open,
      projects: visible.size,
      teams,
      progress,
      links: workspace.links,
      editHref: (await placeOf(workspaceId, null)).workspace.has(
        "workspace.update",
      )
        ? workspaceSettingsPath(workspaceId, "")
        : null,
    };
  },
);

// ── What the old overview showed ────────────────────────────────────────────

/** The project's slug and the caller's permissions, in both contexts. */
const placeOf = cache(async (workspaceId: string, projectId: string | null) => {
  const userId = await currentUserId();
  const [project, slug, workspace] = await Promise.all([
    projectId
      ? accessFor(userId, { projectId })
      : Promise.resolve(new Set<string>()),
    projectId
      ? db.project
          .findUnique({ where: { id: projectId }, select: { slug: true } })
          .then((row) => row?.slug ?? null)
      : Promise.resolve(null),
    accessFor(userId, { workspaceId }),
  ]);
  return {
    slug,
    project: project as { has: (key: string) => boolean },
    workspace: workspace as { has: (key: string) => boolean },
  };
});

/** Workspace roles that mean "contributes" or "reads along" — without
 *  `member.view` only the others (leadership) are listed. */
const WS_ROSTER_ROLE_KEYS = new Set<string>([
  DEFAULT_WORKSPACE_ROLE_KEY,
  WORKSPACE_VIEWER_ROLE_KEY,
  WORKSPACE_GUEST_ROLE_KEY,
]);

/** The list page of the dashboard's place, filtered to open issues. */
function openListHref(
  workspaceId: string,
  projectSlug: string | null,
  params: Record<string, string>,
): string {
  const base = projectSlug
    ? projectPath(workspaceId, projectSlug, "list")
    : workspacePath(workspaceId, "issues/list");
  const query = new URLSearchParams({
    ...params,
    "statusCategory.not": "completed,canceled",
  });
  return `${base}?${query}`;
}

async function members(ctx: Ctx): Promise<WidgetData> {
  const { workspaceId, projectId } = ctx.resolved;
  const place = await placeOf(workspaceId, projectId);
  const select = {
    user: { select: USER_SELECT },
    role: { select: { key: true, name: true, rank: true } },
  } as const;
  const rows = await (projectId
    ? db.projectMember.findMany({
        // Locked out of the project isn't "a member" to show off.
        where: {
          projectId,
          role: { key: { not: PROJECT_BLOCKED_ROLE_KEY } },
        },
        select,
        orderBy: { user: { firstName: "asc" } },
      })
    : db.workspaceMember.findMany({
        where: { workspaceId },
        select,
        orderBy: { user: { firstName: "asc" } },
      }));
  const seeAll = projectId ? true : place.workspace.has("member.view");
  const groups = new Map<string, RoleGroup>();
  for (const row of rows) {
    if (!seeAll && WS_ROSTER_ROLE_KEYS.has(row.role.key)) continue;
    const group = groups.get(row.role.key) ?? {
      key: row.role.key,
      name: row.role.name,
      rank: row.role.rank,
      members: [],
    };
    group.members.push({
      user: await mapUser(row.user),
      href: openListHref(workspaceId, place.slug, {
        assignee: row.user.handle,
      }),
    });
    groups.set(row.role.key, group);
  }
  return {
    type: "members",
    groups: [...groups.values()].sort((a, b) => b.rank - a.rank),
    total: seeAll
      ? rows.length
      : [...groups.values()].reduce((n, g) => n + g.members.length, 0),
    href: projectId
      ? projectPath(workspaceId, place.slug ?? "", "members")
      : seeAll
        ? workspacePath(workspaceId, "members")
        : null,
  };
}

async function teams(ctx: Ctx): Promise<WidgetData> {
  const { workspaceId, projectId } = ctx.resolved;
  const place = await placeOf(workspaceId, projectId);
  const rows = await db.team.findMany({
    where: projectId ? { projects: { some: { projectId } } } : { workspaceId },
    select: {
      id: true,
      name: true,
      key: true,
      color: true,
      lead: { select: USER_SELECT },
      members: {
        select: { user: { select: USER_SELECT } },
        orderBy: { user: { firstName: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });
  return {
    type: "teams",
    teams: await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        name: row.name,
        key: row.key,
        color: row.color,
        members: row.members.length,
        lead: row.lead ? await mapUser(row.lead) : null,
        people: await Promise.all(
          row.members.slice(0, 6).map((m) => mapUser(m.user)),
        ),
        href: row.members.length
          ? openListHref(workspaceId, place.slug, {
              assignee: row.members.map((m) => m.user.handle).join(","),
            })
          : null,
      })),
    ),
    href: workspacePath(workspaceId, "teams"),
  };
}

async function labels(ctx: Ctx): Promise<WidgetData> {
  const { workspaceId, projectId } = ctx.resolved;
  const place = await placeOf(workspaceId, projectId);
  const [rows, issues] = await Promise.all([
    db.label.findMany({
      where: projectId
        ? {
            OR: [
              { projectId },
              {
                projectId: null,
                workspaceId,
                hiddenIn: { none: { projectId } },
              },
            ],
          }
        : { workspaceId, projectId: null },
      select: {
        id: true,
        name: true,
        color: true,
        slug: true,
        projectId: true,
      },
      orderBy: { name: "asc" },
    }),
    db.issue.findMany({
      where: { AND: [ctx.base, { status: { notIn: ctx.closed } }] },
      select: { labels: true },
    }),
  ]);
  const counts = new Map<string, number>();
  for (const issue of issues)
    for (const id of issue.labels) counts.set(id, (counts.get(id) ?? 0) + 1);
  const list: LabelRow[] = rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      open: counts.get(row.id) ?? 0,
      own: row.projectId !== null,
      href: openListHref(workspaceId, place.slug, { label: row.slug }),
    }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  const canCreate = projectId
    ? place.project.has("label.create")
    : place.workspace.has("label.create");
  return {
    type: "labels",
    labels: list,
    projectId,
    workspaceId,
    canCreate,
    href: canCreate
      ? projectId
        ? projectSettingsPath(workspaceId, place.slug ?? "", "labels")
        : workspaceSettingsPath(workspaceId, "labels")
      : null,
  };
}

async function projects(ctx: Ctx): Promise<WidgetData> {
  const { workspaceId, projectIds } = ctx.resolved;
  const [rows, open] = await Promise.all([
    db.project.findMany({
      where: { id: { in: projectIds }, archivedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        prefix: true,
        color: true,
        avatarKey: true,
      },
      orderBy: { name: "asc" },
    }),
    db.issue.groupBy({
      by: ["projectId"],
      where: { AND: [ctx.base, { status: { notIn: ctx.closed } }] },
      _count: { _all: true },
    }),
  ]);
  const openBy = new Map(open.map((row) => [row.projectId, row._count._all]));
  return {
    type: "projects",
    projects: await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        color: row.color,
        avatarUrl: await resolveAvatarUrl(row.avatarKey),
        open: openBy.get(row.id) ?? 0,
        href: projectPath(workspaceId, row.slug, "overview"),
      })),
    ),
    href: workspacePath(workspaceId, "projects"),
  };
}

async function links(workspaceId: string): Promise<WidgetData> {
  const place = await placeOf(workspaceId, null);
  const rows = await db.workspaceLink.findMany({
    where: { workspaceId },
    select: { id: true, label: true, url: true },
    orderBy: { position: "asc" },
  });
  return {
    type: "links",
    links: rows,
    href: place.workspace.has("workspace.update")
      ? workspaceSettingsPath(workspaceId, "")
      : null,
  };
}

/** Every shortcut this place offers the viewer, in the default order —
 *  the widget's own setting picks and orders from these. `false` as the last
 *  argument: offered, but off until someone switches it on. */
async function shortcuts(
  workspaceId: string,
  projectId: string | null,
): Promise<WidgetData> {
  const place = await placeOf(workspaceId, projectId);
  const items: Shortcut[] = [];
  const add = (
    key: Shortcut["key"],
    icon: string,
    href: string,
    shown = true,
  ) => items.push({ key, icon, href, default: shown });
  const ws = place.workspace;
  const createdByMe = await systemViewSlug(workspaceId, "created-by-me");

  if (projectId && place.slug) {
    const slug = place.slug;
    const pr = place.project;
    add("board", "lucide:kanban", projectPath(workspaceId, slug, ""));
    add("list", "lucide:list", projectPath(workspaceId, slug, "list"));
    add(
      "myIssues",
      "lucide:circle-user",
      workspacePath(workspaceId, "my"),
      false,
    );
    if (createdByMe)
      add(
        "createdByMe",
        "lucide:pen-line",
        viewPath(workspaceId, null, createdByMe),
        false,
      );
    add("inbox", "lucide:inbox", workspacePath(workspaceId, "inbox"), false);
    add(
      "workspaceDashboard",
      "lucide:gauge",
      workspacePath(workspaceId, "dashboard"),
      false,
    );
    add("members", "lucide:users", projectPath(workspaceId, slug, "members"));
    if (pr.has("role.manage"))
      add(
        "roles",
        "lucide:shield",
        projectPath(workspaceId, slug, "roles"),
        false,
      );
    if (pr.has("label.create"))
      add(
        "labels",
        "lucide:tag",
        projectSettingsPath(workspaceId, slug, "labels"),
        false,
      );
    if (pr.has("project.update"))
      add(
        "fields",
        "lucide:sliders-horizontal",
        projectSettingsPath(workspaceId, slug, "fields"),
        false,
      );
    if (pr.has("member.invite"))
      add(
        "invitations",
        "lucide:mail-plus",
        projectSettingsPath(workspaceId, slug, "invitations"),
        false,
      );
    add(
      "activity",
      "lucide:history",
      projectSettingsPath(workspaceId, slug, "activity"),
    );
    if (PROJECT_SETTINGS_PERMISSIONS.some((key) => pr.has(key)))
      add(
        "settings",
        "lucide:settings",
        projectSettingsPath(workspaceId, slug, ""),
      );
  } else {
    add("board", "lucide:kanban", workspacePath(workspaceId, "issues"));
    add(
      "list",
      "lucide:list",
      workspacePath(workspaceId, "issues/list"),
      false,
    );
    add(
      "myIssues",
      "lucide:circle-user",
      workspacePath(workspaceId, "my"),
      false,
    );
    if (createdByMe)
      add(
        "createdByMe",
        "lucide:pen-line",
        viewPath(workspaceId, null, createdByMe),
        false,
      );
    add("inbox", "lucide:inbox", workspacePath(workspaceId, "inbox"), false);
    add("projects", "lucide:folders", workspacePath(workspaceId, "projects"));
    add("views", "lucide:layers", workspacePath(workspaceId, "views"));
    add("teams", "lucide:users-round", workspacePath(workspaceId, "teams"));
    if (ws.has("member.view"))
      add("members", "lucide:users", workspacePath(workspaceId, "members"));
    if (ws.has("role.manage"))
      add("roles", "lucide:shield", workspacePath(workspaceId, "roles"), false);
    if (ws.has("label.create"))
      add(
        "labels",
        "lucide:tag",
        workspaceSettingsPath(workspaceId, "labels"),
        false,
      );
    if (ws.has("member.invite"))
      add(
        "invitations",
        "lucide:mail-plus",
        workspaceSettingsPath(workspaceId, "invitations"),
        false,
      );
    if (ws.has("audit.view"))
      add(
        "activity",
        "lucide:history",
        workspaceSettingsPath(workspaceId, "activity"),
        false,
      );
    if (ws.has("webhook.manage"))
      add(
        "webhooks",
        "lucide:webhook",
        workspaceSettingsPath(workspaceId, "webhooks"),
        false,
      );
    if (WORKSPACE_SETTINGS_PERMISSIONS.some((key) => ws.has(key)))
      add(
        "settings",
        "lucide:settings",
        workspaceSettingsPath(workspaceId, ""),
      );
  }
  // Your own corner — on every dashboard, off by default.
  add(
    "notifications",
    "lucide:bell",
    accountPath(workspaceId, "notifications"),
    false,
  );
  add("account", "lucide:user-cog", accountPath(workspaceId, ""), false);
  return { type: "shortcuts", items };
}

async function widgetData(ctx: Ctx, widget: Widget): Promise<WidgetData> {
  const { config } = widget;
  const own = await filterWhere(config.filter);
  const where: Where = { AND: [ctx.base, own] };
  const { resolved } = ctx;

  switch (widget.type) {
    case "kpi":
      return kpi(
        ctx,
        where,
        config.metric ?? "open",
        config.filter,
        config.measure ?? "count",
        widget,
      );
    case "progress": {
      const measure = config.measure ?? "count";
      const canceled = ctx.closed.filter((id) => !ctx.completed.includes(id));
      const notCanceled: Where = {
        AND: [where, { status: { notIn: canceled } }],
      };
      const extra: [string, string][] = [["statusCategory.not", "canceled"]];
      const base = await progress(ctx, where, measure);
      const [href, second, recent] = await Promise.all([
        boardHref(ctx, config.filter, extra),
        secondNumber(ctx, notCanceled, widget, extra, measure),
        // Forecast: the pace of the range, applied to what's left.
        elementOf(widget, "forecast")
          ? measureOf(
              {
                AND: [
                  where,
                  { status: { in: ctx.completed } },
                  { closedAt: { gte: ctx.window.from, lt: ctx.window.to } },
                ],
              },
              measure,
            )
          : Promise.resolve(0),
      ]);
      const days = Math.max(
        1,
        (ctx.window.to.getTime() - ctx.window.from.getTime()) / DAY,
      );
      const left =
        base.type === "progress" ? Math.max(0, base.total - base.done) : 0;
      return {
        ...(base as Extract<WidgetData, { type: "progress" }>),
        href,
        second,
        forecastDays:
          elementOf(widget, "forecast") && recent > 0
            ? Math.ceil(left / (recent / days))
            : null,
      };
    }
    case "distribution":
      return distribution(
        ctx,
        where,
        config.groupBy ?? "status",
        config.openOnly ?? false,
        config.filter,
        config.measure ?? "count",
      );
    case "attention":
      return attention(ctx, where);
    case "issues":
      return issues(ctx, where, config.sort, config.openOnly ?? true, widget);
    case "flow":
      return flow(ctx, where, config.filter, config);
    case "burnup":
      return burnup(ctx, where);
    case "cycle":
      return cycle(ctx, where);
    case "workload":
      return workload(ctx, where, config.filter);
    case "matrix":
      return matrix(
        ctx,
        where,
        config.groupBy ?? "assignee",
        config.groupBy2 ?? "status",
        config.openOnly ?? true,
        config.measure ?? "count",
      );
    case "age":
      return age(ctx, where);
    case "about":
      return {
        type: "about",
        about: await aboutFor(resolved.workspaceId, resolved.projectId),
      };
    case "activity": {
      const view = resolved.projectId
        ? await getProjectActivity(resolved.projectId, 20)
        : await getWorkspaceActivity(resolved.workspaceId, 20);
      return { type: "activity", entries: view.entries };
    }
    case "members":
      return members(ctx);
    case "teams":
      return teams(ctx);
    case "labels":
      return labels(ctx);
    case "projects":
      return projects(ctx);
    case "links":
      return links(resolved.workspaceId);
    case "shortcuts":
      return shortcuts(resolved.workspaceId, resolved.projectId);
    case "note": {
      // Only this person's own text — never anyone else's.
      const row = await db.dashboardNote.findUnique({
        where: { key: `${ctx.targetKey}:${widget.id}:${ctx.userId}` },
        select: { pages: true },
      });
      const pages = notePagesSchema.safeParse(row?.pages);
      return {
        type: "note",
        pages: pages.success ? pages.data : [{ id: "p1" }],
      };
    }
  }
}

/** Data for the given widgets — the page's load and the edit mode's
 *  refresh after a widget was added or reconfigured. */
export async function computeWidgets(
  target: DashboardTarget,
  widgets: Widget[],
  range: RangeKey,
  scope: DashboardScope,
): Promise<WidgetDataMap | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const resolved = await resolveTarget(target.kind, target.id);
  if (!resolved) return null;
  const effective: DashboardScope = resolved.canViewAll ? scope : "mine";
  const ctx = await buildCtx(target, resolved, userId, range, effective);

  const entries = await Promise.all(
    widgets.map(async (widget) => {
      try {
        return [widget.id, await widgetData(ctx, widget)] as const;
      } catch (error) {
        // One broken widget (a filter pointing at something gone) must not
        // take the whole dashboard down — it shows as empty.
        console.error("dashboard widget failed", widget.type, error);
        return [widget.id, null] as const;
      }
    }),
  );
  return Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, WidgetData] => !!entry[1],
    ),
  );
}

/**
 * A whole dashboard. Range and scope follow the usual precedence: the
 * address, then what the person last chose, then the default.
 */
export async function getDashboard(
  target: DashboardTarget,
  params: { range?: string; scope?: string } = {},
): Promise<DashboardView | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const resolved = await resolveTarget(target.kind, target.id);
  if (!resolved) return null;

  const stored = await storedPrefs(target, userId);
  const range = toRange(params.range ?? stored.range ?? undefined);
  const wanted = toDashboardScope(params.scope, stored.scope);
  const scope: DashboardScope = resolved.canViewAll ? wanted : "mine";
  const layout = await layoutFor(target, resolved, userId, scope);

  const [data, customWidgets] = await Promise.all([
    computeWidgets(target, layout.widgets, range, scope).then((d) => d ?? {}),
    customWidgetsFor(resolved.workspaceId, userId),
  ]);

  return {
    target,
    range,
    unit: windowFor(range).unit,
    scope,
    canViewAll: resolved.canViewAll,
    layout: {
      ...layout,
      canEdit: resolved.canEdit,
      canEditShared: resolved.canEditShared,
    },
    data,
    customWidgets,
  };
}

/** The viewer's own custom widgets and the ones others share in the
 *  workspace — the gallery's last section. */
async function customWidgetsFor(
  workspaceId: string,
  userId: string,
): Promise<CustomWidgetEntry[]> {
  const rows = await db.customWidget.findMany({
    where: { workspaceId, OR: [{ userId }, { shared: true }] },
    select: { id: true, name: true, widget: true, shared: true, userId: true },
    orderBy: [{ name: "asc" }],
  });
  return rows.flatMap((row) => {
    // Stored without an id (every placement gets its own) — the entry's
    // own id stands in while it's in the gallery.
    const widget = parseWidgets([
      { ...(row.widget as Record<string, unknown>), id: row.id },
    ])?.[0];
    return widget
      ? [
          {
            id: row.id,
            name: row.name,
            widget,
            shared: row.shared,
            mine: row.userId === userId,
          },
        ]
      : [];
  });
}

/** For the server actions: may the current user see, edit (own or view), or
 *  set the shared default of this dashboard? */
export async function dashboardAccess(target: DashboardTarget) {
  const resolved = await resolveTarget(target.kind, target.id);
  return resolved
    ? {
        workspaceId: resolved.workspaceId,
        projectId: resolved.projectId,
        canEdit: resolved.canEdit,
        canEditShared: resolved.canEditShared,
      }
    : null;
}
