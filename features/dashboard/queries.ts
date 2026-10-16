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
  defaultWidgets,
  type GroupField,
  type KpiMetric,
  layoutKey,
  parseWidgets,
  type Widget,
} from "@/features/dashboard/widgets";
import type { IssueFilter } from "@/features/issues/filter";
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
    widgets: personal ?? shared ?? defaultWidgets(target.kind),
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
}

/** Turn a list of filter nodes into one `where`, or `{}` when empty. */
async function filterWhere(filter: IssueFilter | null | undefined) {
  if (!filter || filter.rules.length === 0) return {};
  return toIssueWhere(filter, await filterContext());
}

async function buildCtx(
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

  return {
    resolved,
    userId,
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
  }))();
}

const todayStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

// ── Time series helpers ─────────────────────────────────────────────────────

/** Count dates per bucket of `window`, every bucket present. */
function bucketCounts(dates: Date[], window: Window): number[] {
  const index = new Map(window.keys.map((key, i) => [key, i]));
  const counts = window.keys.map(() => 0);
  for (const date of dates) {
    const i = index.get(bucketKey(truncate(date, window.unit)));
    if (i !== undefined) counts[i]++;
  }
  return counts;
}

async function datesIn(
  where: Where,
  column: "created" | "closedAt",
  from: Date,
  to: Date,
): Promise<Date[]> {
  const rows = await db.issue.findMany({
    where: { AND: [where, { [column]: { gte: from, lt: to } }] },
    select: { [column]: true },
  });
  return rows
    .map((row) => (row as unknown as Record<string, Date | null>)[column])
    .filter((d): d is Date => !!d);
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
): Promise<WidgetData> {
  const { window, previous } = ctx;
  const open: Where = { status: { notIn: ctx.closed } };
  const count = (extra: Where) =>
    db.issue.count({ where: { AND: [where, extra] } });

  switch (metric) {
    case "open": {
      const [now, created, closed] = await Promise.all([
        count(open),
        datesIn(where, "created", window.from, window.to),
        datesIn(where, "closedAt", window.from, window.to),
      ]);
      // Walk back from now: the open pile at each bucket's end.
      const c = bucketCounts(created, window);
      const d = bucketCounts(closed, window);
      const spark = window.keys.map(() => 0);
      let level = now;
      for (let i = window.keys.length - 1; i >= 0; i--) {
        spark[i] = level;
        level -= c[i] - d[i];
      }
      return { type: "kpi", value: now, previous: level, spark };
    }
    case "created":
    case "closed": {
      const column = metric === "created" ? "created" : "closedAt";
      const [dates, before] = await Promise.all([
        datesIn(where, column, window.from, window.to),
        count({ [column]: { gte: previous.from, lt: previous.to } }),
      ]);
      return {
        type: "kpi",
        value: dates.length,
        previous: before,
        spark: bucketCounts(dates, window),
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
      };
    }
    case "inProgress":
      return stock(await count({ status: { in: ctx.started } }));
    case "inReview":
      return stock(await count({ status: "in_review" }));
    case "overdue":
      return stock(await count({ ...open, dueDate: { lt: todayStart() } }));
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

async function progress(ctx: Ctx, where: Where): Promise<WidgetData> {
  const canceled = ctx.closed.filter((id) => !ctx.completed.includes(id));
  const scoped: Where = { AND: [where, { status: { notIn: canceled } }] };
  const [total, done, inProgress] = await Promise.all([
    db.issue.count({ where: scoped }),
    db.issue.count({
      where: { AND: [where, { status: { in: ctx.completed } }] },
    }),
    db.issue.count({
      where: { AND: [where, { status: { in: ctx.started } }] },
    }),
  ]);
  return { type: "progress", total, done, inProgress };
}

const COLUMN: Record<
  Exclude<GroupField, "label">,
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

/** Counts per key of one field. */
async function countsBy(
  where: Where,
  field: GroupField,
): Promise<Map<string, number>> {
  if (field === "label") {
    const rows = await db.issue.findMany({ where, select: { labels: true } });
    const counts = new Map<string, number>();
    for (const row of rows) {
      const keys = row.labels.length ? row.labels : ["_none"];
      for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }
  const column = COLUMN[field];
  const rows = await db.issue.groupBy({
    by: [column],
    where,
    _count: { _all: true },
  });
  return new Map(
    rows.map((row) => [
      String((row as Record<string, unknown>)[column] ?? "_none"),
      row._count._all,
    ]),
  );
}

/** Ladder fields keep their order; people, projects and labels go by size. */
const LADDER = new Set<GroupField>(["status", "priority", "type"]);

async function distribution(
  ctx: Ctx,
  where: Where,
  field: GroupField,
  openOnly: boolean,
): Promise<WidgetData> {
  const scoped = openOnly
    ? { AND: [where, { status: { notIn: ctx.closed } }] }
    : where;
  const counts = await countsBy(scoped, field);
  const axis = await axisFor(ctx, field, [...counts.keys()]);
  let slices = axis
    .map((slice) => ({ ...slice, count: counts.get(slice.key) ?? 0 }))
    .filter((slice) => slice.count > 0);
  if (!LADDER.has(field)) slices.sort((a, b) => b.count - a.count);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (slices.length > SLICE_LIMIT) {
    const rest = slices.slice(SLICE_LIMIT - 1);
    slices = [
      ...slices.slice(0, SLICE_LIMIT - 1),
      {
        key: "_other",
        label: "",
        color: "#8a9099",
        count: rest.reduce((a, b) => a + b.count, 0),
      },
    ];
  }
  return { type: "distribution", slices, total };
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
      take: LIST_LIMIT,
    }),
    db.issue.count({ where: scoped }),
  ]);
  return {
    type: "issues",
    total,
    issues: await Promise.all(rows.map((row) => mapIssue(ctx, row))),
  };
}

async function flow(ctx: Ctx, where: Where): Promise<WidgetData> {
  const { window } = ctx;
  const [created, closed] = await Promise.all([
    datesIn(where, "created", window.from, window.to),
    datesIn(where, "closedAt", window.from, window.to),
  ]);
  const c = bucketCounts(created, window);
  const d = bucketCounts(closed, window);
  return {
    type: "flow",
    points: window.keys.map((date, i) => ({
      date,
      created: c[i],
      closed: d[i],
    })),
    created: created.length,
    closed: closed.length,
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
  const c = bucketCounts(created, window);
  const d = bucketCounts(closed, window);
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

async function workload(ctx: Ctx, where: Where): Promise<WidgetData> {
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
  return { type: "workload", rows: list };
}

async function matrix(
  ctx: Ctx,
  where: Where,
  rowField: GroupField,
  colField: GroupField,
  openOnly: boolean,
): Promise<WidgetData> {
  // Labels can't be an axis (see `MATRIX_FIELDS`); fall back to status.
  const rf = rowField === "label" ? "status" : rowField;
  const cf =
    colField === "label" || colField === rf
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
  });
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
    if (i >= 0 && j >= 0) cells[i][j] += row._count._all;
  }
  for (const [i, s] of rowsUsed.entries())
    s.count = cells[i].reduce((a, b) => a + b, 0);
  for (const [j, s] of colsUsed.entries())
    s.count = cells.reduce((a, row) => a + row[j], 0);
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
      return kpi(ctx, where, config.metric ?? "open");
    case "progress":
      return progress(ctx, where);
    case "distribution":
      return distribution(
        ctx,
        where,
        config.groupBy ?? "status",
        config.openOnly ?? false,
      );
    case "attention":
      return attention(ctx, where);
    case "issues":
      return issues(ctx, where, config.sort, config.openOnly ?? true);
    case "flow":
      return flow(ctx, where);
    case "burnup":
      return burnup(ctx, where);
    case "cycle":
      return cycle(ctx, where);
    case "workload":
      return workload(ctx, where);
    case "matrix":
      return matrix(
        ctx,
        where,
        config.groupBy ?? "assignee",
        config.groupBy2 ?? "status",
        config.openOnly ?? true,
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
    case "note":
      return { type: "note" };
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
  const ctx = await buildCtx(resolved, userId, range, effective);

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

  const [layout, stored] = await Promise.all([
    layoutFor(target, resolved, userId),
    storedPrefs(target, userId),
  ]);
  const range = toRange(params.range ?? stored.range ?? undefined);
  const wanted = toDashboardScope(params.scope, stored.scope);
  const scope: DashboardScope = resolved.canViewAll ? wanted : "mine";

  const data =
    (await computeWidgets(target, layout.widgets, range, scope)) ?? {};

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
  };
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
