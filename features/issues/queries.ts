import { cache } from "react";
import { listAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { issueShareUrl } from "@/lib/issue-share";
import {
  accessFor,
  accessibleProjectIds,
  currentUserCanEnterWorkspace,
  currentUserId,
  hasPermission,
  visibleProjectIds,
} from "@/lib/permissions";
import {
  type ResolvedAttachmentRef,
  withResolvedAttachments,
} from "@/lib/richtext/attachments";
import { toDoc } from "@/lib/richtext/doc";
import type { PMDoc } from "@/lib/richtext/types";
import { resolveAttachmentUrl, resolveAvatarUrl } from "@/lib/storage";
import type {
  ContentSource,
  Issue,
  IssueAccess,
  IssueAttachment,
  IssueDetail,
  IssueRelationRef,
  IssueType,
  Label,
  LinkedIssue,
  Priority,
  Project,
  Role,
  SearchableIssue,
  Status,
  Team,
  User,
} from "@/types";

// ── Shared DB → client mappers ────────────────────────────────────────────────

function mapIssue(
  i: {
    id: string;
    key: number;
    title: string;
    status: string;
    priority: number;
    // `JsonValue` from the database: whatever's in the column is arbitrary
    // JSON at first. `toDoc` turns it into a valid document — or an empty
    // one, if the row is corrupted.
    description: unknown;
    type: string;
    labels: string[];
    rank: number;
    assigneeId: string | null;
    reporterId: string;
    projectId: string;
    created: Date;
    updated: Date;
    source: ContentSource;
    comments: {
      id: string;
      body: unknown;
      authorId: string;
      created: Date;
      updated: Date | null;
      parentId: string | null;
      reactions: { userId: string; emoji: string }[];
      source: ContentSource;
    }[];
    shareToken?: string | null;
  },
  // For `reactedByMe` — whoever isn't logged in (there are no public calls
  // here, but the type stays honest) sees no reaction as their own.
  viewerId: string | null,
): Issue {
  return {
    id: i.id,
    key: i.key,
    title: i.title,
    status: i.status,
    priority: i.priority,
    description: toDoc(i.description),
    type: i.type,
    labels: i.labels,
    rank: i.rank,
    assignee: i.assigneeId,
    reporter: i.reporterId,
    project: i.projectId,
    created: i.created.getTime(),
    updated: i.updated.getTime(),
    source: i.source,
    comments: i.comments.map((c) => ({
      id: c.id,
      body: toDoc(c.body),
      author: c.authorId,
      time: c.created.getTime(),
      updated: c.updated ? c.updated.getTime() : null,
      parentId: c.parentId,
      reactions: groupReactions(c.reactions, viewerId),
      source: c.source,
    })),
    shareUrl: i.shareToken ? issueShareUrl(i.shareToken) : null,
  };
}

/** Raw reaction rows grouped by emoji — the comment bar only shows the
 *  summary, never the individual people behind it. */
function groupReactions(
  reactions: { userId: string; emoji: string }[],
  viewerId: string | null,
): { emoji: string; count: number; reactedByMe: boolean }[] {
  const byEmoji = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const r of reactions) {
    const entry = byEmoji.get(r.emoji) ?? { count: 0, reactedByMe: false };
    entry.count += 1;
    if (viewerId && r.userId === viewerId) entry.reactedByMe = true;
    byEmoji.set(r.emoji, entry);
  }
  return [...byEmoji.entries()].map(([emoji, v]) => ({ emoji, ...v }));
}

/**
 * Resolves an issue's attachments — only for the two genuine detail-view
 * loaders (`getIssueById`, `getIssueByRef`), not for the board/list
 * (`getIssuesByProject`, `getMyIssues`): the full description is never
 * rendered there, so extra storage calls would be wasted.
 *
 * `kind: "file"` needs a presigned URL (`resolveAttachmentUrl`, generated
 * fresh per render like avatars, no cache); `kind: "link"` already carries
 * the finished external address in the column.
 */
async function resolveIssueAttachments(
  rows: {
    id: string;
    kind: string;
    name: string;
    key: string | null;
    url: string | null;
    mimeType: string | null;
    size: number | null;
    created: Date;
    authorId: string;
  }[],
): Promise<IssueAttachment[]> {
  return Promise.all(
    rows.map(async (a) => ({
      id: a.id,
      kind: a.kind === "link" ? ("link" as const) : ("file" as const),
      name: a.name,
      url: a.kind === "link" ? a.url : await resolveAttachmentUrl(a.key),
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.created.getTime(),
      authorId: a.authorId,
    })),
  );
}

/**
 * Connects attachments to the issue: builds the lookup table for
 * `withResolvedAttachments` and enriches the description with it. Runs
 * after `mapIssue`, because it needs its `description` (already
 * `toDoc`-validated).
 */
function withIssueAttachments(
  issue: Issue,
  attachments: IssueAttachment[],
): Issue & { attachments: IssueAttachment[] } {
  const byId: Record<string, ResolvedAttachmentRef> = {};
  for (const a of attachments) {
    if (a.url) {
      byId[a.id] = {
        url: a.url,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
      };
    }
  }
  return {
    ...issue,
    description: withResolvedAttachments(issue.description, byId),
    attachments,
  };
}

// ── Cached queries (deduplicated per request) ─────────────────────────────────
//
// Every query checks for itself — a layout only protects the pages beneath
// it, not every function call (see docs/rbac.md, "Enforcement"). Two checks
// occur here:
//
//   `currentUserCanEnterWorkspace`  does this person belong in the workspace at all?
//   `visibleProjectIds`             which projects are they allowed to see in it?
//
// Both fail empty instead of throwing: these queries run in server
// components that render in parallel with the layout — an exception there
// would surface as a 500 before the layout's `notFound()` can take effect.
// Empty data, by contrast, leads to the correct result via the existing
// `if (!me) notFound()` paths.

export const getWorkspace = cache(async (id: string) => {
  // Suspended workspaces (locked by a platform admin) are unreachable
  // through normal app access → the layouts handle them via notFound().
  const workspace = await db.workspace.findFirst({
    where: { id, suspended: false },
    select: { id: true, name: true, color: true, avatarKey: true },
  });
  if (!workspace) return null;

  const { avatarKey, ...rest } = workspace;
  return { ...rest, avatarUrl: await resolveAvatarUrl(avatarKey) };
});

export const getUserWorkspaces = cache(async (userId: string) => {
  const rows = await db.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        select: { id: true, name: true, color: true, avatarKey: true },
      },
    },
    orderBy: { workspace: { name: "asc" } },
  });
  return Promise.all(
    rows.map(async (r) => {
      const { avatarKey, ...rest } = r.workspace;
      return { ...rest, avatarUrl: await resolveAvatarUrl(avatarKey) };
    }),
  );
});

export const getProjects = cache(
  async (workspaceId: string): Promise<Project[]> => {
    // The project list is the navigation for the entire app — whatever's
    // missing here also won't show up in the sidebar, tab bar, or search.
    // That's why the visibility rule belongs here, not scattered across
    // every individual page.
    const visible = await visibleProjectIds(workspaceId);
    if (visible.size === 0) return [];

    const rows = await db.project.findMany({
      where: { workspaceId, id: { in: [...visible] } },
      orderBy: { name: "asc" },
    });
    return Promise.all(
      rows.map(async (p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        prefix: p.prefix,
        color: p.color,
        avatarUrl: await resolveAvatarUrl(p.avatarKey),
      })),
    );
  },
);

export const getMembers = cache(
  async (workspaceId: string): Promise<User[]> => {
    // The member list carries names and email addresses — it's nobody
    // outside's business. `getMe()` also reads it, so an empty list leads
    // straight to the pages' `notFound()` there too.
    if (!(await currentUserCanEnterWorkspace(workspaceId))) return [];

    const rows = await db.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true, role: { select: { key: true, rank: true } } },
      orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
    });
    return Promise.all(
      rows.map(async (m) => {
        const image =
          (await resolveAvatarUrl(m.user.avatarKey)) ?? m.user.image;
        return {
          id: m.user.id,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          handle: m.user.handle,
          email: m.user.email,
          color: m.user.color,
          ...(image ? { image } : {}),
          role: m.role.key,
          roleRank: m.role.rank,
          pending: m.pending,
        };
      }),
    );
  },
);

export const getLabels = cache(
  async (workspaceId: string): Promise<Label[]> => {
    // Workspace labels apply everywhere, project labels only there — and a
    // project someone isn't allowed to see doesn't reveal its labels either.
    const visible = await visibleProjectIds(workspaceId);
    const rows = await db.label.findMany({
      where: {
        workspaceId,
        OR: [{ projectId: null }, { projectId: { in: [...visible] } }],
      },
      orderBy: { name: "asc" },
      // Where a workspace label is hidden belongs to the label — the
      // picker on an issue knows only this one list and needs to be able
      // to tell from it what applies in its own project.
      include: { hiddenIn: { select: { projectId: true } } },
    });
    return rows.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      color: l.color,
      projectId: l.projectId ?? null,
      hiddenIn: l.hiddenIn.map((h) => h.projectId),
    }));
  },
);

export const getStatuses = cache(
  async (workspaceId: string): Promise<Status[]> => {
    const rows = await db.status.findMany({
      where: { workspaces: { some: { workspaceId } } },
      orderBy: { position: "asc" },
    });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      short: s.short,
      color: s.color,
      isColumn: s.isColumn,
    }));
  },
);

export const getPriorities = cache(
  async (workspaceId: string): Promise<Priority[]> => {
    const rows = await db.priority.findMany({
      where: { workspaces: { some: { workspaceId } } },
      orderBy: { position: "asc" },
    });
    return rows.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      color: p.color,
    }));
  },
);

export const getIssueTypes = cache(
  async (workspaceId: string): Promise<IssueType[]> => {
    const rows = await db.issueType.findMany({
      where: { workspaces: { some: { workspaceId } } },
      orderBy: { position: "asc" },
    });
    return rows.map((t) => ({ id: t.id, name: t.name, color: t.color }));
  },
);

/**
 * The roles assignable in the workspace: the shared system roles of the
 * WORKSPACE scope plus this workspace's own custom-created ones. For
 * project roles, see `getProjectMembersView`.
 */
export const getRoles = cache(async (workspaceId: string): Promise<Role[]> => {
  const rows = await db.role.findMany({
    where: { scope: "WORKSPACE", OR: [{ system: true }, { workspaceId }] },
    orderBy: { rank: "desc" },
  });
  // `id` is the stable role key that the UI uses as its value.
  return rows.map((r) => ({
    id: r.key,
    name: r.name,
    desc: r.desc,
    rank: r.rank,
  }));
});

export const getTeams = cache(async (workspaceId: string): Promise<Team[]> => {
  // Same as the member list: a team names its members.
  if (!(await currentUserCanEnterWorkspace(workspaceId))) return [];

  const rows = await db.team.findMany({
    where: { workspaceId },
    include: {
      members: { select: { userId: true } },
      projects: { select: { projectId: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    key: t.key,
    color: t.color,
    desc: t.desc,
    lead: t.leadId,
    members: t.members.map((m) => m.userId),
    projects: t.projects.map((p) => p.projectId),
  }));
});

/**
 * The topbar's filters, exactly as they appear in the URL: comma-separated,
 * human-readable slugs. Board, list, and "my issues" carry the same ones —
 * only the scope they search within differs.
 */
export interface IssueFilters {
  status?: string;
  priority?: string;
  assignee?: string;
  label?: string;
  /** Only populated in cross-project views (see `getMyIssues`). */
  project?: string;
  q?: string;
}

/**
 * Ranked full-text matches for a search string: title (weight A) and
 * descriptionText (weight B) via `Issue.searchVector`, plus any issue that
 * has a matching comment (`Comment.searchVector`), ranked at that comment's
 * own score. Both columns are Postgres-generated (see migration
 * `add_fulltext_search`), so they can't fall out of sync with the text they
 * were built from.
 *
 * Not scoped by project — callers already AND the returned ids into a
 * project-restricted `where` (or, for `searchWorkspaceIssues`, an explicit
 * visibility filter), and a single GIN-indexed top-N pass is cheap enough at
 * this scale not to need scoping twice. `websearch_to_tsquery` turns an
 * empty/punctuation-only `q` into an empty tsquery, which matches nothing —
 * the same "no results" a blank substring search produced before.
 */
async function searchIssueIds(q: string): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ id: string; rank: number }[]>`
    WITH query AS (SELECT websearch_to_tsquery('simple', ${q}) AS tsq)
    SELECT i.id,
           GREATEST(
             MAX(ts_rank(i."searchVector", query.tsq)),
             COALESCE(MAX(ts_rank(c."searchVector", query.tsq)), 0)
           ) AS rank
      FROM "Issue" i
      CROSS JOIN query
      LEFT JOIN "Comment" c
        ON c."issueId" = i.id
       AND c."searchVector" @@ query.tsq
     WHERE i."searchVector" @@ query.tsq OR c.id IS NOT NULL
     GROUP BY i.id
     ORDER BY rank DESC
     LIMIT 500
  `;
  return new Map(rows.map((r) => [r.id, Number(r.rank)]));
}

/**
 * Translates the slugs from the URL into the issue's internal values and
 * builds the `where` conditions from them — once for all views, so the
 * same filter means the same thing everywhere.
 *
 * The projects come back separately: the caller knows its own scope (a
 * single project, or a workspace's visible ones) and needs to intersect
 * the filter with it rather than overwrite it.
 *
 * A slug that matches nothing is dropped — the view then shows everything
 * instead of nothing. That's the rule for every one of these filters, so a
 * stale link doesn't end up on an empty page.
 */
async function resolveIssueFilters(
  filters: IssueFilters,
  scope: { projectId: string } | { workspaceId: string },
): Promise<{
  where: Record<string, unknown>;
  /** `null` when not filtering by project. */
  projectIds: string[] | null;
}> {
  const list = (value?: string) => value?.split(",").filter(Boolean) ?? [];

  // Status slug == status id, that one needs no lookup.
  const statuses = list(filters.status);
  const prioritySlugs = list(filters.priority);
  const assigneeSlugs = list(filters.assignee);
  const labelSlugs = list(filters.label);
  const projectSlugs = "workspaceId" in scope ? list(filters.project) : [];

  const [priorityRows, assigneeRows, labelRows, projectRows] =
    await Promise.all([
      prioritySlugs.length
        ? db.priority.findMany({
            where: { key: { in: prioritySlugs } },
            select: { id: true },
          })
        : Promise.resolve([]),
      assigneeSlugs.length
        ? db.user.findMany({
            where: { handle: { in: assigneeSlugs } },
            select: { id: true },
          })
        : Promise.resolve([]),
      labelSlugs.length
        ? db.label.findMany({
            where: {
              slug: { in: labelSlugs },
              ...("projectId" in scope
                ? { workspace: { projects: { some: { id: scope.projectId } } } }
                : { workspaceId: scope.workspaceId }),
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      projectSlugs.length && "workspaceId" in scope
        ? db.project.findMany({
            where: {
              slug: { in: projectSlugs },
              workspaceId: scope.workspaceId,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

  const priorities = priorityRows.map((p) => p.id);
  const assignees = assigneeRows.map((u) => u.id);
  const labels = labelRows.map((l) => l.id);

  // The search filters "by title or ID": `ORB-12` or `12` additionally
  // matches the issue number. The digit count is capped so nothing exceeds
  // the column's int range.
  const q = filters.q?.trim();
  const keyDigits = q?.match(/^(?:[a-z]+-)?(\d{1,9})$/i)?.[1];
  const key = keyDigits ? Number(keyDigits) : undefined;
  // Full-text match against title/descriptionText/comments (see
  // `searchIssueIds`) — resolved to a concrete id list here so it can sit
  // in the same `OR` as the exact key match. Board/list order stays
  // `rank`/`created` regardless (see `getIssuesByProject`): a search filters
  // which rows show up, it doesn't reshuffle a manually-ordered board.
  const matchedIds = q ? await searchIssueIds(q) : null;

  return {
    where: {
      ...(statuses.length && { status: { in: statuses } }),
      ...(priorities.length && { priority: { in: priorities } }),
      ...(assignees.length && { assigneeId: { in: assignees } }),
      ...(labels.length && { labels: { hasSome: labels } }),
      ...(q && {
        OR: [
          { id: { in: matchedIds ? [...matchedIds.keys()] : [] } },
          ...(key !== undefined ? [{ key }] : []),
        ],
      }),
    },
    projectIds: projectRows.length ? projectRows.map((p) => p.id) : null,
  };
}

export async function getIssuesByProject(
  projectId: string,
  filters: IssueFilters = {},
): Promise<IssueDetail[]> {
  // The issues are the project's content — without `project.view` they
  // don't exist. This also applies to `blocked`: the role forbids
  // everything, including reading, not just writing.
  if (!(await hasPermission("project.view", { projectId }))) return [];

  const { where } = await resolveIssueFilters(filters, { projectId });

  const rows = await db.issue.findMany({
    // The scope sits behind the filters: no slug in the URL can override it.
    where: { ...where, projectId },
    include: {
      comments: {
        orderBy: { created: "asc" },
        include: { reactions: true },
      },
    },
    orderBy: [{ rank: "asc" }, { created: "asc" }],
  });
  const viewerId = await currentUserId();
  // `issueAccessFor` resolves once per project and is `cache()`d — for all
  // rows of the same project this costs no further database query. Without
  // it, the board and list would show title, status, priority, and
  // assignee as controls that the server would reject anyway
  // (`updateIssue`). No attachments here: the board/list never render the
  // full description, so extra storage calls for every row would be
  // wasted (see `resolveIssueAttachments`).
  return Promise.all(
    rows.map(async (i) => ({
      ...mapIssue(i, viewerId),
      access: await issueAccessFor(i),
      attachments: [],
      // Sub-issues/relations are a detail-view concern (`getIssueById`/
      // `getIssueByRef`) — the board/list never show them, so no extra
      // queries are wasted resolving them for every row.
      parent: null,
      children: [],
      relations: [],
      activity: [],
    })),
  );
}

// Even "my issues" stays bound to the project: someone removed from a
// project no longer sees the issue just because their name is on it.
export async function getMyIssues(
  userId: string,
  workspaceId: string,
  filters: IssueFilters = {},
): Promise<IssueDetail[]> {
  const visible = await accessibleProjectIds(userId, workspaceId);
  if (visible.size === 0) return [];

  const { where, projectIds } = await resolveIssueFilters(filters, {
    workspaceId,
  });
  // The project filter narrows down within the visible projects, never
  // beyond them: a project id in the URL doesn't open anything that would
  // otherwise be closed.
  const scoped = projectIds
    ? [...visible].filter((id) => projectIds.includes(id))
    : [...visible];
  if (scoped.length === 0) return [];

  const rows = await db.issue.findMany({
    // Assignee and scope sit behind the filters — an `?assignee=` in the
    // address can't turn "my" tasks into someone else's.
    where: { ...where, assigneeId: userId, projectId: { in: scoped } },
    include: {
      comments: {
        orderBy: { created: "asc" },
        include: { reactions: true },
      },
    },
    // Same as within a project: by rank, so a dragged row stays where it
    // was dropped.
    orderBy: [{ rank: "asc" }, { created: "asc" }],
  });
  // Across multiple projects, `issueAccessFor` resolves once per project
  // that occurs (`cache()`), not per row. No attachments — see
  // `getIssuesByProject`.
  return Promise.all(
    rows.map(async (i) => ({
      ...mapIssue(i, userId),
      access: await issueAccessFor(i),
      attachments: [],
      // Sub-issues/relations are a detail-view concern (`getIssueById`/
      // `getIssueByRef`) — the board/list never show them, so no extra
      // queries are wasted resolving them for every row.
      parent: null,
      children: [],
      relations: [],
      activity: [],
    })),
  );
}

/**
 * What the current user is allowed to do with exactly this issue.
 *
 * Mirrors `updateIssue`/`deleteIssue` (`features/issues/actions.ts`) line
 * for line — the detail view (title, description, type, status, priority,
 * assignee, delete) therefore never offers a control that the server would
 * reject with `PermissionError` anyway. `issue.update.own`/
 * `issue.delete.own` depend on ownership, not just the role — hence this
 * lives here and not in `mapIssue` (which knows neither the user nor access).
 */
async function issueAccessFor(issue: {
  reporterId: string;
  assigneeId: string | null;
  projectId: string;
}): Promise<IssueAccess> {
  const userId = await currentUserId();
  if (!userId)
    return {
      canEdit: false,
      canAssign: false,
      canDelete: false,
      canShare: false,
      canUpdateAnyComment: false,
      canDeleteAnyComment: false,
    };

  const access = await accessFor(userId, { projectId: issue.projectId });
  const isOwner = userId === issue.reporterId || userId === issue.assigneeId;

  const canEdit =
    access.has("issue.update.any") ||
    (access.has("issue.update.own") && isOwner);
  const canDelete =
    access.has("issue.delete.any") ||
    (access.has("issue.delete.own") && isOwner);

  return {
    canEdit,
    canAssign: canEdit && access.has("issue.assign"),
    canDelete,
    canShare: access.has("issue.share.manage"),
    canUpdateAnyComment: access.has("comment.update.any"),
    canDeleteAnyComment: access.has("comment.delete.any"),
  };
}

/** What `loadIssueRelations` below needs to build a `LinkedIssue`, including
 *  `reporterId` — `issueAccessFor` needs it to resolve `access`. */
const relationRefSelect = {
  id: true,
  key: true,
  title: true,
  status: true,
  projectId: true,
  assigneeId: true,
  reporterId: true,
} as const;

type RelationRefRow = {
  id: string;
  key: number;
  title: string;
  status: string;
  projectId: string;
  assigneeId: string | null;
  reporterId: string;
};

/**
 * Parent, sub-issues, and blocks/relates-to/duplicates edges for the detail
 * view (BARY-1) — a separate query from `mapIssue` since only the genuine
 * detail loaders (`getIssueById`, `getIssueByRef`) need it, same reasoning
 * as `resolveIssueAttachments`.
 *
 * A related issue outside the projects the viewer can see is dropped rather
 * than shown as a bare id: the relation itself isn't secret (it's on *this*
 * issue, which the viewer can already see), but the other issue's title and
 * status would be — same restraint as `getSearchIssues`.
 */
async function loadIssueRelations(
  issueId: string,
  parentId: string | null,
  workspaceId: string,
): Promise<{
  parent: LinkedIssue | null;
  children: LinkedIssue[];
  relations: IssueRelationRef[];
}> {
  const visible = await visibleProjectIds(workspaceId);
  // Async, unlike `mapIssue`'s own helpers: `access` depends on
  // `issueAccessFor`, which resolves permissions per project — cheap here
  // since `accessFor` underneath is itself `cache()`d per (user, project).
  const toLinkedIssue = async (
    row: RelationRefRow,
  ): Promise<LinkedIssue | null> => {
    if (!visible.has(row.projectId)) return null;
    return {
      id: row.id,
      key: row.key,
      title: row.title,
      status: row.status,
      project: row.projectId,
      assignee: row.assigneeId,
      access: await issueAccessFor(row),
    };
  };

  const [parentRow, childRows, outgoing, incoming] = await Promise.all([
    parentId
      ? db.issue.findUnique({
          where: { id: parentId },
          select: relationRefSelect,
        })
      : Promise.resolve(null),
    db.issue.findMany({
      where: { parentId: issueId },
      select: relationRefSelect,
      orderBy: { created: "asc" },
    }),
    db.issueRelation.findMany({
      where: { issueId },
      select: { id: true, type: true, related: { select: relationRefSelect } },
      orderBy: { created: "asc" },
    }),
    db.issueRelation.findMany({
      where: { relatedId: issueId },
      select: { id: true, type: true, issue: { select: relationRefSelect } },
      orderBy: { created: "asc" },
    }),
  ]);

  const relations: IssueRelationRef[] = (
    await Promise.all([
      ...outgoing.map(async (r) => {
        const issue = await toLinkedIssue(r.related);
        return issue
          ? { id: r.id, type: r.type, direction: "outgoing" as const, issue }
          : null;
      }),
      ...incoming.map(async (r) => {
        const issue = await toLinkedIssue(r.issue);
        return issue
          ? { id: r.id, type: r.type, direction: "incoming" as const, issue }
          : null;
      }),
    ])
  ).filter((r): r is IssueRelationRef => r !== null);

  const [parent, children] = await Promise.all([
    parentRow ? toLinkedIssue(parentRow) : Promise.resolve(null),
    Promise.all(childRows.map(toLinkedIssue)).then((rows) =>
      rows.filter((c): c is LinkedIssue => c !== null),
    ),
  ]);

  return { parent, children, relations };
}

export async function getIssueById(id: string): Promise<IssueDetail | null> {
  const i = await db.issue.findUnique({
    where: { id },
    include: {
      comments: {
        orderBy: { created: "asc" },
        include: { reactions: true },
      },
      attachments: { orderBy: { created: "asc" } },
      project: { select: { workspaceId: true } },
    },
  });
  if (!i) return null;
  // A single issue by its id — the most direct route to someone else's
  // content, if nothing guards it here. `null` instead of an exception: the
  // callers turn that into a 404, and a 404 doesn't reveal that the issue exists.
  if (!(await hasPermission("project.view", { projectId: i.projectId })))
    return null;
  const access = await issueAccessFor(i);
  const attachments = await resolveIssueAttachments(i.attachments);
  const viewerId = await currentUserId();
  const [relations, activity] = await Promise.all([
    loadIssueRelations(i.id, i.parentId, i.project.workspaceId),
    listAudit({ targetId: i.id, projectId: i.projectId }),
  ]);
  return {
    ...withIssueAttachments(mapIssue(i, viewerId), attachments),
    access,
    ...relations,
    activity,
  };
}

/**
 * Resolves a reference of the form "PREFIX-123" within a workspace.
 *
 * Wrapped in `cache()`, because the detail page needs it twice within the
 * same request: once for `generateMetadata` (tab title) and once for the
 * page itself.
 */
export const getIssueByRef = cache(
  async (
    workspaceId: string,
    issueRef: string,
  ): Promise<IssueDetail | null> => {
    const match = issueRef.match(/^([A-Z0-9]+)-(\d+)$/i);
    if (!match) return null;
    const prefix = match[1].toUpperCase();
    const key = parseInt(match[2], 10);

    const project = await db.project.findFirst({
      where: { workspaceId, prefix },
    });
    if (!project) return null;
    if (!(await hasPermission("project.view", { projectId: project.id })))
      return null;

    const i = await db.issue.findUnique({
      where: { projectId_key: { projectId: project.id, key } },
      include: {
        comments: {
          orderBy: { created: "asc" },
          include: { reactions: true },
        },
        attachments: { orderBy: { created: "asc" } },
      },
    });
    if (!i) return null;
    const access = await issueAccessFor(i);
    const attachments = await resolveIssueAttachments(i.attachments);
    const viewerId = await currentUserId();
    const [relations, activity] = await Promise.all([
      loadIssueRelations(i.id, i.parentId, workspaceId),
      listAudit({ targetId: i.id, projectId: project.id }),
    ]);
    return {
      ...withIssueAttachments(mapIssue(i, viewerId), attachments),
      access,
      ...relations,
      activity,
    };
  },
);

/** A minimal, deliberately incomplete projection for the public issue page
 *  — no `access`, no internal ids in the response except the ones the
 *  display itself needs. The page must be structurally incapable of
 *  rendering any editing UI. */
/** Enough for `components/ui/atoms/Avatar` (`PersonAvatarData`) — defined
 *  locally here instead of imported from there, so this query doesn't pick
 *  up a UI dependency. */
interface PublicPerson {
  firstName: string;
  lastName: string;
  color: string;
  image?: string;
}

async function toPerson<
  T extends {
    firstName: string;
    lastName: string;
    color: string;
    image: string | null;
    avatarKey: string | null;
  },
>(u: T): Promise<PublicPerson> {
  return {
    firstName: u.firstName,
    lastName: u.lastName,
    color: u.color,
    image: (await resolveAvatarUrl(u.avatarKey)) ?? u.image ?? undefined,
  };
}

export interface PublicSharedIssue {
  identifier: string;
  /** For the way back into the app if the viewing person already has
   *  access (`SharedIssuePage`, redirect via `getIssueByRef`). */
  workspaceId: string;
  title: string;
  description: PMDoc;
  status: { name: string; color: string } | null;
  priority: { name: string; color: string } | null;
  type: { name: string; color: string } | null;
  labels: { id: string; name: string; color: string }[];
  projectName: string;
  workspaceName: string;
  assignee: PublicPerson | null;
  reporter: PublicPerson;
  /** Who created the link — `null` if the account has since been removed
   *  (`onDelete: SetNull`). */
  sharedBy: PublicPerson | null;
  sharedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  comments: {
    id: string;
    body: PMDoc;
    author: PublicPerson;
    created: Date;
  }[];
}

/**
 * Resolves a public issue link. `null` means the same thing in every case:
 * unknown, disabled, expired, or never-activated token — the same
 * restraint as `openInvitation`/`resolveInviteLink`.
 */
export async function getIssueByShareToken(
  token: string,
  now: Date = new Date(),
): Promise<PublicSharedIssue | null> {
  if (!token) return null;

  const personSelect = {
    firstName: true,
    lastName: true,
    color: true,
    image: true,
    avatarKey: true,
  } as const;

  const issue = await db.issue.findUnique({
    where: { shareToken: token },
    select: {
      key: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      type: true,
      labels: true,
      created: true,
      updated: true,
      shareTokenCreatedAt: true,
      shareTokenExpiresAt: true,
      assignee: { select: personSelect },
      reporter: { select: personSelect },
      sharedBy: { select: personSelect },
      project: {
        select: {
          name: true,
          prefix: true,
          workspaceId: true,
          workspace: { select: { name: true } },
        },
      },
      comments: {
        orderBy: { created: "asc" },
        select: {
          id: true,
          body: true,
          created: true,
          author: { select: personSelect },
        },
      },
    },
  });
  if (!issue) return null;
  if (issue.shareTokenExpiresAt && issue.shareTokenExpiresAt <= now)
    return null;

  const [statuses, priorities, types, labelRows] = await Promise.all([
    getStatuses(issue.project.workspaceId),
    getPriorities(issue.project.workspaceId),
    getIssueTypes(issue.project.workspaceId),
    issue.labels.length > 0
      ? db.label.findMany({
          where: { id: { in: issue.labels } },
          select: { id: true, name: true, color: true },
        })
      : Promise.resolve([]),
  ]);

  const status = statuses.find((s) => s.id === issue.status) ?? null;
  const priority = priorities.find((p) => p.id === issue.priority) ?? null;
  const type = types.find((t) => t.id === issue.type) ?? null;

  return {
    identifier: `${issue.project.prefix}-${issue.key}`,
    workspaceId: issue.project.workspaceId,
    title: issue.title,
    description: toDoc(issue.description),
    status: status ? { name: status.name, color: status.color } : null,
    priority: priority ? { name: priority.name, color: priority.color } : null,
    type: type ? { name: type.name, color: type.color } : null,
    labels: labelRows,
    projectName: issue.project.name,
    workspaceName: issue.project.workspace.name,
    assignee: issue.assignee ? await toPerson(issue.assignee) : null,
    reporter: await toPerson(issue.reporter),
    sharedBy: issue.sharedBy ? await toPerson(issue.sharedBy) : null,
    sharedAt: issue.shareTokenCreatedAt,
    expiresAt: issue.shareTokenExpiresAt,
    createdAt: issue.created,
    updatedAt: issue.updated,
    comments: await Promise.all(
      issue.comments.map(async (c) => ({
        id: c.id,
        body: toDoc(c.body),
        author: await toPerson(c.author),
        created: c.created,
      })),
    ),
  };
}

export const getSearchIssues = cache(
  async (workspaceId: string): Promise<SearchableIssue[]> => {
    // Search reaches across all of the workspace's projects — exactly why
    // visibility needs to be enforced here and not only at display time.
    const visible = await visibleProjectIds(workspaceId);
    if (visible.size === 0) return [];

    const rows = await db.issue.findMany({
      where: { projectId: { in: [...visible] } },
      select: {
        id: true,
        key: true,
        title: true,
        status: true,
        projectId: true,
      },
      orderBy: { updated: "desc" },
      take: 500,
    });
    return rows.map((i) => ({
      id: i.id,
      key: i.key,
      title: i.title,
      status: i.status,
      project: i.projectId,
    }));
  },
);

/**
 * Ranked, cross-project issue search for the command palette (`⌘K`) —
 * unlike `getSearchIssues` (an unranked snapshot of up to 500 issues, meant
 * for local substring-filtering and the `#` mention trigger, both of which
 * need an instant, already-in-memory list rather than a round trip per
 * keystroke), this runs `searchIssueIds` server-side per query and returns
 * only actual matches, best match first.
 *
 * A bare number or `PREFIX-12` additionally does an exact key lookup, same
 * shortcut `resolveIssueFilters` gives the topbar filter — full-text search
 * alone wouldn't find an issue by its number, since the key isn't part of
 * `searchVector`. Ranked above every text match (arbitrarily high score):
 * typing an exact identifier means you already know which issue you want.
 */
export async function searchWorkspaceIssues(
  workspaceId: string,
  q: string,
): Promise<SearchableIssue[]> {
  const query = q.trim();
  if (!query) return [];

  const visible = await visibleProjectIds(workspaceId);
  if (visible.size === 0) return [];

  const keyDigits = query.match(/^(?:[a-z]+-)?(\d{1,9})$/i)?.[1];
  const key = keyDigits ? Number(keyDigits) : undefined;
  const matches = await searchIssueIds(query);
  if (matches.size === 0 && key === undefined) return [];

  const rows = await db.issue.findMany({
    where: {
      projectId: { in: [...visible] },
      OR: [
        ...(matches.size ? [{ id: { in: [...matches.keys()] } }] : []),
        ...(key !== undefined ? [{ key }] : []),
      ],
    },
    select: { id: true, key: true, title: true, status: true, projectId: true },
  });

  const rankOf = (row: { id: string; key: number }) =>
    key !== undefined && row.key === key ? 1000 : (matches.get(row.id) ?? 0);

  return rows
    .sort((a, b) => rankOf(b) - rankOf(a))
    .slice(0, 20)
    .map((i) => ({
      id: i.id,
      key: i.key,
      title: i.title,
      status: i.status,
      project: i.projectId,
    }));
}
