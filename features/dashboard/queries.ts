import "server-only";
import { cache } from "react";
import type { DashboardScope } from "@/features/dashboard/scope";
import type {
  AttentionIssue,
  AttentionReason,
  DashboardStats,
  PrioritySlice,
  ProjectDashboardData,
  ProjectDashboardView,
  ProjectProfile,
  ProjectRoleGroup,
  StatusSlice,
  ThroughputPoint,
  WorkloadRow,
  WorkspaceDashboardData,
  WorkspaceDashboardView,
  WorkspaceProfile,
  WorkspaceProjectSummary,
} from "@/features/dashboard/types";
import { resolveLayout } from "@/features/dashboard/widgets";
import { getPriorities, getStatuses } from "@/features/issues/queries";
import {
  type BucketUnit,
  bucketKey,
  type RangeKey,
  windowFor,
} from "@/lib/buckets";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  PROJECT_SETTINGS_PERMISSIONS,
  WORKSPACE_SETTINGS_PERMISSIONS,
} from "@/lib/nav";
import {
  accessFor,
  currentUserCanEnterWorkspace,
  currentUserId,
  hasPermission,
  visibleProjectIds,
} from "@/lib/permissions";
import {
  DEFAULT_PROJECT_ROLE_KEY,
  DEFAULT_WORKSPACE_ROLE_KEY,
  PROJECT_BLOCKED_ROLE_KEY,
  PROJECT_GUEST_ROLE_KEY,
  PROJECT_VIEWER_ROLE_KEY,
  systemRolesIn,
  WORKSPACE_GUEST_ROLE_KEY,
  WORKSPACE_VIEWER_ROLE_KEY,
} from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { closedStatusIds } from "@/lib/statuses";
import { resolveAvatarUrl } from "@/lib/storage";
import type { User } from "@/types";

// ─── A project's dashboard ─────────────────────────────────────────────────────
//
// Counting happens in the database, not in memory. The obvious approach —
// load every issue in the project and group in JavaScript — would, for a
// project that's grown, transfer thousands of rows including their
// descriptions, just to show a dozen numbers in the end. The only queries
// that fetch whole rows are the two lists further down, and those have a
// `take`.
//
// The time axis, by contrast, is built in code (`lib/buckets.ts`): a
// `GROUP BY` only knows buckets that have something in them, and a quiet
// week would otherwise not be a zero but a gap in the chart.
//
// **Permissions.** Everything here hangs off `project.view` — the numbers
// are the project's content, in condensed form. Anyone not allowed to see
// the issues also isn't allowed to know how many there are. As everywhere,
// `null` returns what "doesn't exist for you"; the page turns that into a
// 404, without revealing whether the project is missing or access is.

/** After how long an in-progress issue counts as stale. */
const STALE_DAYS = 14;

/** How many rows the two lists below show at most. */
const LIST_LIMIT = 6;

/**
 * The contributor rank — the lower threshold above which a role is called
 * out individually in the profile card (see `groupByRole`).
 *
 * Pulled from the registry rather than written as a number: the ranks live
 * in `lib/rbac/roles.ts`, and a second copy here would be exactly the kind
 * of number that silently goes wrong when the roles are reordered.
 */
const CONTRIBUTOR_RANK =
  systemRolesIn("PROJECT").find((role) => role.key === DEFAULT_PROJECT_ROLE_KEY)
    ?.rank ?? 3;

/**
 * The system roles that mean "contributes" or "reads along". They appear in
 * the profile card as a list, not as individually named people.
 *
 * Why a list of keys and not just a rank cutoff: ranks are integers, and
 * there's no room between `contributor` (3) and `project_admin` (4). A
 * project-specific "Moderator" role would in practice also get rank 3 — by
 * rank alone it couldn't be distinguished from a contributor and would
 * vanish into that list, even though it's exactly the kind of role you'd
 * want to see called out by name on an overview.
 *
 * The keys come as constants from the registry: a rename there breaks the
 * type check here instead of silently reshuffling a group.
 */
const ROSTER_ROLE_KEYS = new Set<string>([
  DEFAULT_PROJECT_ROLE_KEY,
  PROJECT_VIEWER_ROLE_KEY,
  PROJECT_GUEST_ROLE_KEY,
  PROJECT_BLOCKED_ROLE_KEY,
]);

/** Same thing one level up — being a contributor in the workspace instead of the project. */
const WS_CONTRIBUTOR_RANK =
  systemRolesIn("WORKSPACE").find(
    (role) => role.key === DEFAULT_WORKSPACE_ROLE_KEY,
  )?.rank ?? 2;

/** The workspace roles that mean "contributes" or "reads along". */
const WS_ROSTER_ROLE_KEYS = new Set<string>([
  DEFAULT_WORKSPACE_ROLE_KEY,
  WORKSPACE_VIEWER_ROLE_KEY,
  WORKSPACE_GUEST_ROLE_KEY,
]);

async function mapUser(user: {
  id: string;
  firstName: string;
  lastName: string;
  handle: string;
  email: string | null;
  color: string;
  image: string | null;
  avatarKey: string | null;
}): Promise<User> {
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

/** Person lists are alphabetical — as everywhere in this app. */
const byName = [
  { user: { firstName: "asc" as const } },
  { user: { lastName: "asc" as const } },
];

// ── The numbers up top ───────────────────────────────────────────────────────

/**
 * The project's key figures.
 *
 * Two kinds sit side by side here, and the difference matters enough for
 * this paragraph: `open`, `inProgress`, `urgent`, and `total` are stocks —
 * they hold *right now* and know no period. `created` and `closed` are
 * movements within the chosen window. A stock filtered by the period would
 * answer no question anyone actually asks: "how many are open" never means
 * "how many are open and were created in the last 30 days".
 */
async function statsFor(
  projectId: string,
  from: Date,
  to: Date,
  assigneeId: string | null,
): Promise<DashboardStats> {
  const closed = await closedStatusIds();
  const window = { gte: from, lt: to };
  // Narrowed to your own issues for "mine"; unchanged for "all" (`null`).
  const mine = assigneeId ? { assigneeId } : {};

  const [total, open, inProgress, inReview, created, urgent, urgentUnassigned] =
    await Promise.all([
      db.issue.count({ where: { projectId, ...mine } }),
      db.issue.count({
        where: { projectId, status: { notIn: closed }, ...mine },
      }),
      db.issue.count({ where: { projectId, status: "in_progress", ...mine } }),
      db.issue.count({ where: { projectId, status: "in_review", ...mine } }),
      db.issue.count({ where: { projectId, created: window, ...mine } }),
      db.issue.count({
        where: { projectId, status: { notIn: closed }, priority: 4, ...mine },
      }),
      // Assigned and unassigned at once is a contradiction — in your own
      // scope the answer is always 0, with no query needed for it.
      assigneeId
        ? Promise.resolve(0)
        : db.issue.count({
            where: {
              projectId,
              status: { notIn: closed },
              priority: 4,
              assigneeId: null,
            },
          }),
    ]);

  // Count and average of closed issues in one trip: both read the same
  // rows, and cycle time in SQL is a subtraction that in JavaScript would
  // mean a second round trip for the data.
  const [cycle] = await db.$queryRaw<
    { closed: bigint; avg_days: number | null }[]
  >`
    SELECT COUNT(*)                                                   AS closed,
           AVG(EXTRACT(EPOCH FROM ("closedAt" - "created")) / 86400.0) AS avg_days
      FROM "Issue"
     WHERE "projectId" = ${projectId}
       AND "closedAt" >= ${from}
       AND "closedAt" <  ${to}
       AND (${assigneeId}::text IS NULL OR "assigneeId" = ${assigneeId})
  `;

  return {
    total,
    open,
    inProgress,
    inReview,
    created,
    urgent,
    urgentUnassigned,
    closed: Number(cycle?.closed ?? 0),
    // To one decimal place: "19.0 days" is a figure, "19.04871" would be a
    // claim of precision this number doesn't have.
    cycleDays:
      cycle?.avg_days == null ? null : Math.round(cycle.avg_days * 10) / 10,
  };
}

// ── Distributions ────────────────────────────────────────────────────────────

/**
 * How all issues distribute across statuses.
 *
 * The order comes from the workspace's statuses, not from the result of the
 * `GROUP BY`: the bar chart is meant to mirror the ladder from "Backlog" to
 * "Canceled", and a status with no issues must not drop out — being empty is
 * the information.
 */
async function statusesFor(
  projectId: string,
  workspaceId: string,
  assigneeId: string | null,
): Promise<StatusSlice[]> {
  const [statuses, rows] = await Promise.all([
    getStatuses(workspaceId),
    db.issue.groupBy({
      by: ["status"],
      where: { projectId, ...(assigneeId ? { assigneeId } : {}) },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(rows.map((row) => [row.status, row._count._all]));
  return statuses.map((status) => ({
    id: status.id,
    name: status.name,
    short: status.short,
    color: status.color,
    count: counts.get(status.id) ?? 0,
  }));
}

/**
 * How the **open** issues distribute across priorities.
 *
 * Deliberately only the open ones: whatever's done was urgent once and isn't
 * anymore. The question behind this widget is "what's pending", not "what
 * was once pending".
 */
async function prioritiesFor(
  projectId: string,
  workspaceId: string,
  assigneeId: string | null,
): Promise<PrioritySlice[]> {
  const closed = await closedStatusIds();
  const [priorities, rows] = await Promise.all([
    getPriorities(workspaceId),
    db.issue.groupBy({
      by: ["priority"],
      where: {
        projectId,
        status: { notIn: closed },
        ...(assigneeId ? { assigneeId } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(rows.map((row) => [row.priority, row._count._all]));
  return (
    priorities
      .map((priority) => ({
        id: priority.id,
        key: priority.key,
        name: priority.name,
        color: priority.color,
        count: counts.get(priority.id) ?? 0,
      }))
      // Descending: the most urgent row first. "No priority" ends up at the
      // bottom this way, where it belongs — it's not a null value, it's the
      // end of the ladder.
      .sort((a, b) => b.id - a.id)
  );
}

/**
 * Created and closed per marker on the time axis.
 *
 * Two series from two columns of the same table, hence two queries: a
 * `UNION` would save one round trip and cost readability. `date_trunc` gets
 * the unit as a parameter — the first argument is text, that's allowed;
 * identifiers stay fixed in the query.
 */
async function throughputFor(
  projectId: string,
  unit: BucketUnit,
  from: Date,
  to: Date,
  keys: string[],
  assigneeId: string | null,
): Promise<ThroughputPoint[]> {
  const countsIn = async (column: "created" | "closedAt") => {
    const rows = await db.$queryRaw<{ bucket: Date; count: bigint }[]>`
      SELECT date_trunc(${unit}, ${Prisma.raw(`"${column}"`)}) AS bucket,
             COUNT(*) AS count
        FROM "Issue"
       WHERE "projectId" = ${projectId}
         AND ${Prisma.raw(`"${column}"`)} >= ${from}
         AND ${Prisma.raw(`"${column}"`)} <  ${to}
         AND (${assigneeId}::text IS NULL OR "assigneeId" = ${assigneeId})
       GROUP BY 1
    `;
    return new Map(
      rows.map((row) => [bucketKey(row.bucket), Number(row.count)]),
    );
  };

  const [created, closed] = await Promise.all([
    countsIn("created"),
    countsIn("closedAt"),
  ]);

  // The axis leads, not the result of the `GROUP BY`: every bucket appears,
  // even the empty one.
  return keys.map((date) => ({
    date,
    created: created.get(date) ?? 0,
    closed: closed.get(date) ?? 0,
  }));
}

/**
 * Who's carrying how much open work.
 *
 * The unassigned pile is part of the list, not off to the side: it's the
 * quantity that matters when distributing work, and a project where it's
 * the tallest bar has exactly that as its finding.
 *
 * Counting happens across all issues, not project members: anyone who left
 * the project but is still on issues would otherwise vanish from the count,
 * even though their work stays behind.
 */
async function workloadFor(
  projectId: string,
  assigneeId: string | null,
): Promise<WorkloadRow[]> {
  const closed = await closedStatusIds();
  const rows = await db.issue.groupBy({
    by: ["assigneeId", "status"],
    where: {
      projectId,
      status: { notIn: closed },
      ...(assigneeId ? { assigneeId } : {}),
    },
    _count: { _all: true },
  });
  if (rows.length === 0) return [];

  const ids = [
    ...new Set(
      rows.map((row) => row.assigneeId).filter((id): id is string => !!id),
    ),
  ];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: USER_SELECT,
  });
  const byId = new Map(
    await Promise.all(
      users.map(async (user) => [user.id, await mapUser(user)] as const),
    ),
  );

  const totals = new Map<string, { open: number; inProgress: number }>();
  for (const row of rows) {
    // An empty key for "nobody" — `null` would work as a Map key, but would
    // be a second case in the Map's type that every reader further down
    // would have to keep in mind.
    const key = row.assigneeId ?? "";
    const entry = totals.get(key) ?? { open: 0, inProgress: 0 };
    entry.open += row._count._all;
    if (row.status === "in_progress") entry.inProgress += row._count._all;
    totals.set(key, entry);
  }

  return (
    [...totals.entries()]
      .map(([id, counts]) => ({
        user: id ? (byId.get(id) ?? null) : null,
        ...counts,
      }))
      // The biggest pile first; ties are broken by name, so the list
      // doesn't jump between two calls.
      .sort(
        (a, b) =>
          b.open - a.open ||
          (a.user?.firstName ?? "").localeCompare(b.user?.firstName ?? ""),
      )
  );
}

// ── The two lists ────────────────────────────────────────────────────────────

function issueRef(prefix: string, key: number): string {
  return `${prefix}-${key}`;
}

/**
 * What's at risk of falling by the wayside.
 *
 * Three reasons, in this order of precedence: urgent and unassigned, urgent
 * at all, in progress and untouched for two weeks. An issue can meet several
 * — the most severe one is shown, and it appears only once.
 *
 * Deliberately not a search over everything that could go wrong: the list is
 * short and meant to stay that way. A "needs attention" list with forty rows
 * no longer needs attention itself.
 */
async function attentionFor(
  projectId: string,
  prefix: string,
  statusColors: Map<string, string>,
  assigneeId: string | null,
): Promise<AttentionIssue[]> {
  const closed = await closedStatusIds();
  const staleBefore = new Date(Date.now() - STALE_DAYS * 86400_000);

  const rows = await db.issue.findMany({
    where: {
      projectId,
      status: { notIn: closed },
      ...(assigneeId ? { assigneeId } : {}),
      OR: [
        { priority: { gte: 3 } },
        { status: "in_progress", updated: { lt: staleBefore } },
      ],
    },
    select: {
      id: true,
      key: true,
      title: true,
      status: true,
      priority: true,
      updated: true,
      assignee: { select: USER_SELECT },
    },
    // Urgency before age: what's been sitting the longest isn't
    // automatically what's most urgent.
    orderBy: [{ priority: "desc" }, { updated: "asc" }],
    take: LIST_LIMIT,
  });

  return Promise.all(
    rows.map(async (row) => {
      const reason: AttentionReason =
        row.priority === 4 && !row.assignee
          ? "unassigned"
          : row.priority >= 3
            ? "urgent"
            : "stale";

      return {
        id: row.id,
        ref: issueRef(prefix, row.key),
        title: row.title,
        status: row.status,
        statusColor: statusColors.get(row.status) ?? "#8a9099",
        priority: row.priority,
        assignee: row.assignee ? await mapUser(row.assignee) : null,
        updated: row.updated.getTime(),
        reason,
      } satisfies AttentionIssue;
    }),
  );
}

// ── The profile card ─────────────────────────────────────────────────────────

/**
 * Bundle members by their project role, strongest role first.
 *
 * Grouping happens by what's in the database, not by a list of known roles
 * in code. That's not a convenience here, it's the point: besides the
 * system roles, there are project-specific ones (`Role.scope = PROJECT` with
 * a set `projectId`, see `prisma/schema.prisma`). If a workspace creates a
 * "Moderator" role, it appears here automatically as its own group with its
 * own name — with a fixed list, these are exactly the roles that would fall
 * through the cracks.
 *
 * `distinguished` separates the groups shown at the top with names and a
 * chip from those that run as a list below. Two conditions, both required:
 *
 *   - **at least the contributor rank.** A custom role below that
 *     ("Intern") isn't a distinction and belongs in the list.
 *   - **none of the system roles that mean contributing or reading along**
 *     (`ROSTER_ROLE_KEYS`). Otherwise every contributor would get their own
 *     row with a chip, and with forty people the card would be a wall.
 *
 * Taken together: leadership and anything a workspace has created for
 * itself besides that appears by name; contributors and readers appear as a
 * list.
 *
 * `contributorRank` and `rosterKeys` come in as parameters instead of being
 * fixed: the same procedure applies one level up for workspace membership,
 * just with different roles and a different rank for plain contribution
 * (`getWorkspaceDashboard`).
 */
export async function groupByRole(
  members: {
    user: Parameters<typeof mapUser>[0];
    role: { key: string; name: string; rank: number };
  }[],
  contributorRank: number = CONTRIBUTOR_RANK,
  rosterKeys: Set<string> = ROSTER_ROLE_KEYS,
): Promise<ProjectRoleGroup[]> {
  const groups = new Map<string, ProjectRoleGroup>();

  for (const member of members) {
    const existing = groups.get(member.role.key);
    if (existing) {
      existing.members.push(await mapUser(member.user));
      continue;
    }
    groups.set(member.role.key, {
      key: member.role.key,
      name: member.role.name,
      rank: member.role.rank,
      distinguished:
        member.role.rank >= contributorRank && !rosterKeys.has(member.role.key),
      members: [await mapUser(member.user)],
    });
  }

  // Descending by rank; same-rank ties by name, so the order doesn't jump
  // between two calls.
  return [...groups.values()].sort(
    (a, b) => b.rank - a.rank || a.name.localeCompare(b.name),
  );
}

/**
 * What the project is, independent of how it's currently doing.
 *
 * None of this has a time period, and that's exactly why it's not in
 * `ProjectDashboardData`: a reference prefix doesn't have 30 days. Both come
 * from a single call anyway — the page shows both views from the same data
 * and switches between them without a server round trip.
 *
 * The member list is `ProjectMember` and thus the same source
 * `lib/permissions.ts` uses to decide access. Workspace owners and admins
 * who can see every project without being entered in it are therefore
 * missing here — that's deliberate: the profile card shows who *works* in
 * the project, not who's allowed to look into everything. Anyone who needs
 * the full access list finds it under "Members" (`getProjectMembersView`).
 */
async function profileFor(projectId: string): Promise<ProjectProfile | null> {
  const userId = await currentUserId();
  // The same permission the settings page also checks
  // (`getProjectSettingsView`) — the button should appear exactly where it
  // actually leads somewhere.
  const access = await accessFor(userId, { projectId });

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      desc: true,
      prefix: true,
      visibility: true,
      createdAt: true,
      workspaceId: true,
      createdBy: { select: USER_SELECT },
      members: {
        select: {
          user: { select: USER_SELECT },
          role: { select: { key: true, name: true, rank: true } },
        },
        orderBy: byName,
      },
      teams: {
        select: {
          team: { select: { id: true, name: true, key: true, color: true } },
        },
      },
      labels: {
        select: { id: true, name: true, color: true, slug: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!project) return null;

  // Workspace labels apply in every project — except the ones this project
  // has hidden. Without this second part, the profile card would show only
  // the project's own labels and thereby claim there were no others.
  const shared = await db.label.findMany({
    where: {
      projectId: null,
      workspace: { projects: { some: { id: projectId } } },
      hiddenIn: { none: { projectId } },
    },
    select: { id: true, name: true, color: true, slug: true },
    orderBy: { name: "asc" },
  });

  // `team.project.manage` is a workspace permission (teams belong to the
  // workspace, not the project) — it doesn't exist at all in the project
  // context, hence a second, workspace-scoped lookup.
  const wsAccess = await accessFor(userId, {
    workspaceId: project.workspaceId,
  });

  return {
    desc: project.desc,
    prefix: project.prefix,
    visibility: project.visibility,
    createdAt: project.createdAt.getTime(),
    createdBy: project.createdBy ? await mapUser(project.createdBy) : null,
    canUpdate: access.has("project.update"),
    canViewSettings: PROJECT_SETTINGS_PERMISSIONS.some(access.has),
    canViewAllStats: access.has("dashboard.view.all"),
    canCreateLabel: access.has("label.create"),
    canManageTeams: wsAccess.has("team.project.manage"),
    roles: await groupByRole(project.members),
    memberCount: project.members.length,
    teams: project.teams.map((entry) => entry.team),
    labels: [
      ...project.labels.map((label) => ({ ...label, own: true })),
      ...shared.map((label) => ({ ...label, own: false })),
    ],
  };
}

// ── The layout, the way someone has set it up ───────────────────────────────

/**
 * Your own layout for this project.
 *
 * Without a row in the table, the default applies — `resolveLayout` doesn't
 * know the difference and doesn't need to. The period lives here too: it's
 * the one setting you'd otherwise have to re-choose every time you open the
 * page.
 */
export const getMyDashboardLayout = cache(
  async (
    projectId: string,
  ): Promise<{
    order: string[];
    hidden: string[];
    range: string | null;
    view: string | null;
    scope: string | null;
  }> => {
    const session = await getSession();
    if (!session) {
      return { order: [], hidden: [], range: null, view: null, scope: null };
    }

    const row = await db.dashboardPreference.findUnique({
      where: { userId_projectId: { userId: session.userId, projectId } },
    });
    return {
      order: row?.order ?? [],
      hidden: row?.hidden ?? [],
      range: row?.range ?? null,
      view: row?.view ?? null,
      scope: row?.scope ?? null,
    };
  },
);

// ── Everything together ─────────────────────────────────────────────────────

/**
 * A project's entire dashboard.
 *
 * Every widget is loaded, including the hidden ones. That's a deliberate
 * decision against the obvious approach: loading only what's visible saves a
 * few counting queries and, in exchange, means every show/hide toggle in the
 * customize dialog needs a fresh server round trip — the preview in the
 * dialog would then sit empty until it reloads. The queries are counts over
 * an index; the two most expensive lists have a `take` of six.
 */
export const getProjectDashboard = cache(
  async (
    projectId: string,
    range: RangeKey,
    scope: DashboardScope = "all",
  ): Promise<ProjectDashboardView | null> => {
    if (!(await hasPermission("project.view", { projectId }))) return null;
    const userId = await currentUserId();
    if (!userId) return null;

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        avatarKey: true,
        prefix: true,
        workspaceId: true,
      },
    });
    if (!project) return null;

    const window = windowFor(range);

    // Anyone without `dashboard.view.all` sees only their own numbers —
    // regardless of what `scope` requests. `effectiveScope` ends up in
    // `data.scope` and is therefore always what was actually delivered.
    const canViewAll = await hasPermission("dashboard.view.all", {
      projectId,
    });
    const effectiveScope: DashboardScope = canViewAll ? scope : "mine";
    const assigneeId = effectiveScope === "mine" ? userId : null;

    const [stats, statuses, priorities, throughput, workload, profile, layout] =
      await Promise.all([
        statsFor(projectId, window.from, window.to, assigneeId),
        statusesFor(projectId, project.workspaceId, assigneeId),
        prioritiesFor(projectId, project.workspaceId, assigneeId),
        throughputFor(
          projectId,
          window.unit,
          window.from,
          window.to,
          window.keys,
          assigneeId,
        ),
        workloadFor(projectId, assigneeId),
        profileFor(projectId),
        getMyDashboardLayout(projectId),
      ]);
    if (!profile) return null;

    // Needs the statuses' colors and therefore waits on `statuses` — a
    // second query against the same table would be the only way to
    // parallelize this.
    const attention = await attentionFor(
      projectId,
      project.prefix,
      new Map(statuses.map((status) => [status.id, status.color])),
      assigneeId,
    );

    const resolved = resolveLayout(layout.order, layout.hidden);

    const data: ProjectDashboardData = {
      range,
      unit: window.unit,
      scope: effectiveScope,
      stats,
      statuses,
      priorities,
      throughput,
      workload,
      attention,
    };

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        color: project.color,
        avatarUrl: await resolveAvatarUrl(project.avatarKey),
      },
      data,
      profile,
      order: resolved.visible,
      hidden: resolved.hidden,
    } satisfies ProjectDashboardView;
  },
);

/** The period the dashboard opens with when there's no `?range=` in the address. */
export async function getMyDashboardRange(
  projectId: string,
): Promise<string | null> {
  return (await getMyDashboardLayout(projectId)).range;
}

/**
 * The view the project page opens in when there's no `?view=` in the
 * address — the one last used. `null` as long as nobody has switched it.
 */
export async function getMyDashboardView(
  projectId: string,
): Promise<string | null> {
  return (await getMyDashboardLayout(projectId)).view;
}

// ─── The same, one level up: a workspace's dashboard ──────────────────────────
//
// The same widgets as for a project, just without the boundary to a single
// project: every count goes through `project.workspaceId` instead of
// `projectId`. Two separate routes instead of a toggle — see
// `WorkspaceDashboardPreference` in the schema — hence no `view` and no
// `setDashboardView` counterpart here.
//
// **Permissions.** `currentUserCanEnterWorkspace` instead of `project.view`:
// the numbers condense every project, and access to those can already
// differ — so who's allowed to see them is whoever can enter the workspace
// at all, not whoever could see each individual project.

async function wsStatsFor(
  workspaceId: string,
  from: Date,
  to: Date,
  assigneeId: string | null,
): Promise<DashboardStats> {
  const closed = await closedStatusIds();
  const window = { gte: from, lt: to };
  const project = { workspaceId };
  const mine = assigneeId ? { assigneeId } : {};

  const [total, open, inProgress, inReview, created, urgent, urgentUnassigned] =
    await Promise.all([
      db.issue.count({ where: { project, ...mine } }),
      db.issue.count({
        where: { project, status: { notIn: closed }, ...mine },
      }),
      db.issue.count({ where: { project, status: "in_progress", ...mine } }),
      db.issue.count({ where: { project, status: "in_review", ...mine } }),
      db.issue.count({ where: { project, created: window, ...mine } }),
      db.issue.count({
        where: { project, status: { notIn: closed }, priority: 4, ...mine },
      }),
      assigneeId
        ? Promise.resolve(0)
        : db.issue.count({
            where: {
              project,
              status: { notIn: closed },
              priority: 4,
              assigneeId: null,
            },
          }),
    ]);

  const [cycle] = await db.$queryRaw<
    { closed: bigint; avg_days: number | null }[]
  >`
    SELECT COUNT(*)                                                     AS closed,
           AVG(EXTRACT(EPOCH FROM (i."closedAt" - i."created")) / 86400.0) AS avg_days
      FROM "Issue" i
      JOIN "Project" p ON p.id = i."projectId"
     WHERE p."workspaceId" = ${workspaceId}
       AND i."closedAt" >= ${from}
       AND i."closedAt" <  ${to}
       AND (${assigneeId}::text IS NULL OR i."assigneeId" = ${assigneeId})
  `;

  return {
    total,
    open,
    inProgress,
    inReview,
    created,
    urgent,
    urgentUnassigned,
    closed: Number(cycle?.closed ?? 0),
    cycleDays:
      cycle?.avg_days == null ? null : Math.round(cycle.avg_days * 10) / 10,
  };
}

async function wsStatusesFor(
  workspaceId: string,
  assigneeId: string | null,
): Promise<StatusSlice[]> {
  const [statuses, rows] = await Promise.all([
    getStatuses(workspaceId),
    db.issue.groupBy({
      by: ["status"],
      where: {
        project: { workspaceId },
        ...(assigneeId ? { assigneeId } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(rows.map((row) => [row.status, row._count._all]));
  return statuses.map((status) => ({
    id: status.id,
    name: status.name,
    short: status.short,
    color: status.color,
    count: counts.get(status.id) ?? 0,
  }));
}

async function wsPrioritiesFor(
  workspaceId: string,
  assigneeId: string | null,
): Promise<PrioritySlice[]> {
  const closed = await closedStatusIds();
  const [priorities, rows] = await Promise.all([
    getPriorities(workspaceId),
    db.issue.groupBy({
      by: ["priority"],
      where: {
        project: { workspaceId },
        status: { notIn: closed },
        ...(assigneeId ? { assigneeId } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(rows.map((row) => [row.priority, row._count._all]));
  return priorities
    .map((priority) => ({
      id: priority.id,
      key: priority.key,
      name: priority.name,
      color: priority.color,
      count: counts.get(priority.id) ?? 0,
    }))
    .sort((a, b) => b.id - a.id);
}

async function wsThroughputFor(
  workspaceId: string,
  unit: BucketUnit,
  from: Date,
  to: Date,
  keys: string[],
  assigneeId: string | null,
): Promise<ThroughputPoint[]> {
  const countsIn = async (column: "created" | "closedAt") => {
    const rows = await db.$queryRaw<{ bucket: Date; count: bigint }[]>`
      SELECT date_trunc(${unit}, ${Prisma.raw(`i."${column}"`)}) AS bucket,
             COUNT(*) AS count
        FROM "Issue" i
        JOIN "Project" p ON p.id = i."projectId"
       WHERE p."workspaceId" = ${workspaceId}
         AND ${Prisma.raw(`i."${column}"`)} >= ${from}
         AND ${Prisma.raw(`i."${column}"`)} <  ${to}
         AND (${assigneeId}::text IS NULL OR i."assigneeId" = ${assigneeId})
       GROUP BY 1
    `;
    return new Map(
      rows.map((row) => [bucketKey(row.bucket), Number(row.count)]),
    );
  };

  const [created, closed] = await Promise.all([
    countsIn("created"),
    countsIn("closedAt"),
  ]);

  return keys.map((date) => ({
    date,
    created: created.get(date) ?? 0,
    closed: closed.get(date) ?? 0,
  }));
}

async function wsWorkloadFor(
  workspaceId: string,
  assigneeId: string | null,
): Promise<WorkloadRow[]> {
  const closed = await closedStatusIds();
  const rows = await db.issue.groupBy({
    by: ["assigneeId", "status"],
    where: {
      project: { workspaceId },
      status: { notIn: closed },
      ...(assigneeId ? { assigneeId } : {}),
    },
    _count: { _all: true },
  });
  if (rows.length === 0) return [];

  const ids = [
    ...new Set(
      rows.map((row) => row.assigneeId).filter((id): id is string => !!id),
    ),
  ];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: USER_SELECT,
  });
  const byId = new Map(
    await Promise.all(
      users.map(async (user) => [user.id, await mapUser(user)] as const),
    ),
  );

  const totals = new Map<string, { open: number; inProgress: number }>();
  for (const row of rows) {
    const key = row.assigneeId ?? "";
    const entry = totals.get(key) ?? { open: 0, inProgress: 0 };
    entry.open += row._count._all;
    if (row.status === "in_progress") entry.inProgress += row._count._all;
    totals.set(key, entry);
  }

  return [...totals.entries()]
    .map(([id, counts]) => ({
      user: id ? (byId.get(id) ?? null) : null,
      ...counts,
    }))
    .sort(
      (a, b) =>
        b.open - a.open ||
        (a.user?.firstName ?? "").localeCompare(b.user?.firstName ?? ""),
    );
}

/** Like `attentionFor`, just across all projects — the reference therefore needs the prefix of the project each issue belongs to, instead of a fixed one. */
async function wsAttentionFor(
  workspaceId: string,
  statusColors: Map<string, string>,
  assigneeId: string | null,
): Promise<AttentionIssue[]> {
  const closed = await closedStatusIds();
  const staleBefore = new Date(Date.now() - STALE_DAYS * 86400_000);

  const rows = await db.issue.findMany({
    where: {
      project: { workspaceId },
      status: { notIn: closed },
      ...(assigneeId ? { assigneeId } : {}),
      OR: [
        { priority: { gte: 3 } },
        { status: "in_progress", updated: { lt: staleBefore } },
      ],
    },
    select: {
      id: true,
      key: true,
      title: true,
      status: true,
      priority: true,
      updated: true,
      assignee: { select: USER_SELECT },
      project: { select: { prefix: true } },
    },
    orderBy: [{ priority: "desc" }, { updated: "asc" }],
    take: LIST_LIMIT,
  });

  return Promise.all(
    rows.map(async (row) => {
      const reason: AttentionReason =
        row.priority === 4 && !row.assignee
          ? "unassigned"
          : row.priority >= 3
            ? "urgent"
            : "stale";

      return {
        id: row.id,
        ref: issueRef(row.project.prefix, row.key),
        title: row.title,
        status: row.status,
        statusColor: statusColors.get(row.status) ?? "#8a9099",
        priority: row.priority,
        assignee: row.assignee ? await mapUser(row.assignee) : null,
        updated: row.updated.getTime(),
        reason,
      } satisfies AttentionIssue;
    }),
  );
}

/**
 * What the workspace is, independent of how it's currently doing — the
 * counterpart to `profileFor` one level down.
 *
 * No `desc`, no `prefix`: the workspace has neither. In their place, its
 * projects, which take the spot labels had in the project's profile card —
 * at this level, the question "what does this consist of" is answered by
 * the list of projects, not the list of labels.
 */
async function wsProfileFor(
  workspaceId: string,
): Promise<WorkspaceProfile | null> {
  const userId = await currentUserId();
  const access = await accessFor(userId, { workspaceId });
  // The same visibility rule as everywhere (`getProjects`): the profile
  // card is just another view, not a separate path around private projects.
  const visible = await visibleProjectIds(workspaceId);

  const [workspace, assignableProjectRoles] = await Promise.all([
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        desc: true,
        createdAt: true,
        // Anyone invited but not yet joined isn't part of the team yet —
        // the profile card shows who *has* access, not who's about to get it.
        members: {
          where: { pending: false },
          select: {
            user: { select: USER_SELECT },
            role: { select: { key: true, name: true, rank: true } },
          },
          orderBy: byName,
        },
        teams: {
          select: { id: true, name: true, key: true, color: true },
          orderBy: { name: "asc" },
        },
        projects: {
          where: { id: { in: [...visible] } },
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            avatarKey: true,
          },
          orderBy: { name: "asc" },
        },
        links: {
          select: { id: true, label: true, url: true },
          orderBy: { position: "asc" },
        },
      },
    }),
    // As in `getWorkspaceTeamsView`: only the project roles that apply
    // across every project in the workspace — see the comment on
    // `WorkspaceTeamsView.assignableProjectRoles`.
    db.role.findMany({
      where: {
        scope: "PROJECT",
        OR: [{ system: true }, { workspaceId, projectId: null }],
      },
      select: { key: true, name: true, rank: true },
      orderBy: { rank: "desc" },
    }),
  ]);
  if (!workspace) return null;

  const canViewMembers = access.has("member.view");
  const canViewSettings = WORKSPACE_SETTINGS_PERMISSIONS.some(access.has);

  // Who's in charge is not protected information — unlike the full roster
  // (member/viewer/guest), leadership stays visible even without
  // `member.view`, otherwise nobody in the workspace would know who's
  // running it. The rank and file behind them (`rest` in the view) drops out
  // below via the filter anyway, since only `distinguished` remains.
  const roles = await groupByRole(
    workspace.members,
    WS_CONTRIBUTOR_RANK,
    WS_ROSTER_ROLE_KEYS,
  );

  return {
    desc: workspace.desc,
    createdAt: workspace.createdAt.getTime(),
    canUpdate: access.has("workspace.update"),
    canViewMembers,
    canViewSettings,
    canViewAllStats: access.has("dashboard.view.all"),
    // Without `member.view`, only leadership (`distinguished`) — the
    // name-and-email profile of the other members stays hidden, otherwise
    // hiding the tab would be pointless (the overview would show it to
    // anyone allowed to enter the workspace).
    roles: canViewMembers ? roles : roles.filter((r) => r.distinguished),
    memberCount: workspace.members.length,
    teams: workspace.teams,
    projects: (await Promise.all(
      workspace.projects.map(async ({ avatarKey, ...project }) => ({
        ...project,
        avatarUrl: await resolveAvatarUrl(avatarKey),
      })),
    )) satisfies WorkspaceProjectSummary[],
    links: workspace.links,
    canCreateProject: access.has("project.create"),
    canCreateTeam: access.has("team.create"),
    canManageTeamMembers: access.has("team.member.manage"),
    canManageTeamProjects: access.has("team.project.manage"),
    assignableProjectRoles,
  };
}

/** Your own layout for this workspace — the counterpart to `getMyDashboardLayout`. */
export const getMyWorkspaceDashboardLayout = cache(
  async (
    workspaceId: string,
  ): Promise<{
    order: string[];
    hidden: string[];
    range: string | null;
    scope: string | null;
  }> => {
    const session = await getSession();
    if (!session) {
      return { order: [], hidden: [], range: null, scope: null };
    }

    const row = await db.workspaceDashboardPreference.findUnique({
      where: { userId_workspaceId: { userId: session.userId, workspaceId } },
    });
    return {
      order: row?.order ?? [],
      hidden: row?.hidden ?? [],
      range: row?.range ?? null,
      scope: row?.scope ?? null,
    };
  },
);

/** A workspace's entire dashboard — the counterpart to `getProjectDashboard`. */
export const getWorkspaceDashboard = cache(
  async (
    workspaceId: string,
    range: RangeKey,
    scope: DashboardScope = "all",
  ): Promise<WorkspaceDashboardView | null> => {
    if (!(await currentUserCanEnterWorkspace(workspaceId))) return null;
    const userId = await currentUserId();
    if (!userId) return null;

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        avatarKey: true,
      },
    });
    if (!workspace) return null;
    const workspaceAvatarUrl = await resolveAvatarUrl(workspace.avatarKey);

    const window = windowFor(range);

    const canViewAll = await hasPermission("dashboard.view.all", {
      workspaceId,
    });
    const effectiveScope: DashboardScope = canViewAll ? scope : "mine";
    const assigneeId = effectiveScope === "mine" ? userId : null;

    const [stats, statuses, priorities, throughput, workload, profile, layout] =
      await Promise.all([
        wsStatsFor(workspaceId, window.from, window.to, assigneeId),
        wsStatusesFor(workspaceId, assigneeId),
        wsPrioritiesFor(workspaceId, assigneeId),
        wsThroughputFor(
          workspaceId,
          window.unit,
          window.from,
          window.to,
          window.keys,
          assigneeId,
        ),
        wsWorkloadFor(workspaceId, assigneeId),
        wsProfileFor(workspaceId),
        getMyWorkspaceDashboardLayout(workspaceId),
      ]);
    if (!profile) return null;

    const attention = await wsAttentionFor(
      workspaceId,
      new Map(statuses.map((status) => [status.id, status.color])),
      assigneeId,
    );

    const resolved = resolveLayout(layout.order, layout.hidden);

    const data: WorkspaceDashboardData = {
      range,
      unit: window.unit,
      scope: effectiveScope,
      stats,
      statuses,
      priorities,
      throughput,
      workload,
      attention,
    };

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        color: workspace.color,
        avatarUrl: workspaceAvatarUrl,
      },
      data,
      profile,
      order: resolved.visible,
      hidden: resolved.hidden,
    } satisfies WorkspaceDashboardView;
  },
);

/** The period the workspace dashboard opens with when there's no `?range=` in the address. */
export async function getMyWorkspaceDashboardRange(
  workspaceId: string,
): Promise<string | null> {
  return (await getMyWorkspaceDashboardLayout(workspaceId)).range;
}
