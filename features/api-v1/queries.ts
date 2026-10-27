import "server-only";
import type { IssueFilter } from "@/features/issues/filter";
import { toIssueWhere } from "@/features/issues/filter-where";
import { filterContext, getUserWorkspaces } from "@/features/issues/queries";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  accessibleProjectIds,
  can,
  canEnterWorkspace,
} from "@/lib/permissions";
import { mentionedUserIds, toMarkdown } from "@/lib/richtext";
import type { StatusCategory } from "@/lib/status-category";
import { GET_EXPIRES_IN, resolveAttachmentUrl } from "@/lib/storage";
import { fullName } from "@/lib/utils/string";

// Read helpers for the public API (`app/api/v1`), explicitly parameterized
// by `userId` — unlike most of `features/issues/queries.ts`, which resolves
// the actor from the cookie session (`currentUserId()`/`hasPermission()`)
// and would silently return nothing for a token-authenticated request.
// `getUserWorkspaces` and `accessibleProjectIds` are the two exceptions
// already `userId`-parameterized, reused here directly.

/** All workspaces the caller belongs to. */
export const listWorkspacesForUser = getUserWorkspaces;

export interface ApiWorkspace {
  id: string;
  name: string;
  color: string;
  avatarUrl: string | null;
}

export interface ApiProject {
  id: string;
  name: string;
  slug: string;
  prefix: string;
  color: string;
}

/** Projects of a workspace the caller may see — same visibility rule as
 *  the app's own project switcher (`accessibleProjectIds`). */
export async function listProjectsForUser(
  userId: string,
  workspaceId: string,
): Promise<ApiProject[]> {
  const visible = await accessibleProjectIds(userId, workspaceId);
  if (visible.size === 0) return [];
  return db.project.findMany({
    where: { workspaceId, id: { in: [...visible] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, prefix: true, color: true },
  });
}

/** A user, reduced to what's useful in someone else's response — not the
 *  full account (no email, no color). `handle` is included so a caller can
 *  `@mention` this person in a later write (`features/api-v1/richtext.ts`)
 *  without a dedicated members endpoint to look it up from. */
export interface ApiUserRef {
  id: string;
  name: string;
  handle: string;
}

const userRefSelect = {
  id: true,
  firstName: true,
  lastName: true,
  handle: true,
} satisfies Prisma.UserSelect;

export function mapUserRef(user: {
  id: string;
  firstName: string;
  lastName: string;
  handle: string;
}): ApiUserRef {
  return { id: user.id, name: fullName(user), handle: user.handle };
}

/** How an issue or comment was created — `APP` for the web app itself,
 *  `API`/`MCP` for the two `features/api-v1/mutations.ts` callers
 *  (`app/api/v1`, `app/api/mcp`). Mirrors the `ContentSource` Prisma enum as
 *  a plain string union, same convention as `ProjectVisibility`
 *  (`features/projects/types.ts`) — callers never see the generated enum. */
export type ApiContentSource = "APP" | "API" | "MCP";

/** A label as embedded in `ApiIssue.labels` — just enough to identify it.
 *  Its color is a display detail of the label itself, not something an
 *  issue's payload needs to carry; `GET .../labels` (`ApiLabelDetail`)
 *  carries it for whoever's actually managing labels. */
export interface ApiLabel {
  id: string;
  name: string;
}

/**
 * `Issue.labels` is a plain `String[]` of label ids, not a Prisma relation
 * — there's no `include` for it. Resolving names in a loop (one query per
 * issue) would be an N+1 for `listIssuesForUser`, so every caller here
 * batches instead: collect every id that appears across the page, fetch
 * them once, then look each issue's ids up in the result. A stale id (the
 * label was deleted after being applied) simply drops out silently rather
 * than crashing the response.
 */
async function resolveLabels(
  labelIdLists: string[][],
): Promise<Map<string, ApiLabel>> {
  const ids = [...new Set(labelIdLists.flat())];
  if (ids.length === 0) return new Map();

  const rows = await db.label.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/** The project embedded in an `ApiIssue` — just enough to identify it, not
 *  the full resource shape `listProjectsForUser` returns. Anyone who needs
 *  slug/prefix/color for the project itself calls the dedicated endpoint. */
export interface ApiProjectRef {
  id: string;
  name: string;
}

const projectRefSelect = {
  id: true,
  name: true,
  /** Not exposed on `ApiIssue.project` — kept in the select only to build
   *  `ref` ("PREFIX-123") in `mapApiIssue`. */
  prefix: true,
} satisfies Prisma.ProjectSelect;

/** What building an `ApiIssueRef` (parent/sub-issue/related issue) needs —
 *  `projectId` stays out of the mapped shape, it's only here for the
 *  per-project visibility check in `toApiIssueRef`. */
const issueRefSelect = {
  id: true,
  key: true,
  title: true,
  status: true,
  projectId: true,
  project: { select: { prefix: true } },
} satisfies Prisma.IssueSelect;

type IssueRefRow = Prisma.IssueGetPayload<{ select: typeof issueRefSelect }>;

/** A parent/sub-issue/related issue as embedded in `ApiIssue` — just enough
 *  to identify and open it, the same restraint as `ApiProjectRef`/`ApiLabel`. */
export interface ApiIssueRef {
  id: string;
  ref: string;
  title: string;
  status: string;
}

/**
 * `null` when the caller can't see the project this issue lives in — same
 * restraint as the app's own `loadIssueRelations`
 * (`features/issues/queries.ts`): the relation itself isn't secret (it's on
 * an issue the caller can already see), but the other issue's title/status
 * would be if it sat in a project they have no business in.
 */
async function toApiIssueRef(
  row: IssueRefRow,
  canView: (projectId: string) => Promise<boolean>,
): Promise<ApiIssueRef | null> {
  if (!(await canView(row.projectId))) return null;
  return {
    id: row.id,
    ref: `${row.project.prefix}-${row.key}`,
    title: row.title,
    status: row.status,
  };
}

/** `IssueRelation.type` (Prisma enum) as a plain string union — same
 *  convention as `ApiContentSource`. */
export type ApiIssueRelationKind = "BLOCKS" | "RELATES_TO" | "DUPLICATES";

/** One relation edge from the issue's own point of view — see
 *  `IssueRelationRef` (`types/issue.ts`) for the full direction semantics,
 *  identical here. */
export interface ApiIssueRelation {
  id: string;
  type: ApiIssueRelationKind;
  direction: "outgoing" | "incoming";
  issue: ApiIssueRef;
}

/**
 * Memoizes `project.view` per project for the lifetime of one call —
 * `can()` isn't request-deduplicated the way the session-based
 * `hasPermission()` is (`cache()`, `features/issues/queries.ts`), and a
 * row's parent/sub-issues/relations often share its own project.
 */
function makeProjectVisibility(
  userId: string,
): (projectId: string) => Promise<boolean> {
  const cache = new Map<string, Promise<boolean>>();
  return (projectId: string) => {
    let result = cache.get(projectId);
    if (!result) {
      result = can(userId, "project.view", { projectId });
      cache.set(projectId, result);
    }
    return result;
  };
}

export const issueSelect = {
  id: true,
  key: true,
  title: true,
  status: true,
  priority: true,
  type: true,
  labels: true,
  assignee: { select: userRefSelect },
  reporter: { select: userRefSelect },
  /** Kept alongside the `project` relation below — `can()` checks
   *  (`project.view`) need the plain FK, not the full embedded object. */
  projectId: true,
  description: true,
  created: true,
  updated: true,
  closedAt: true,
  dueDate: true,
  storyPoints: true,
  estimateHours: true,
  estimateUnit: true,
  source: true,
  project: { select: projectRefSelect },
  parent: { select: issueRefSelect },
  _count: { select: { comments: true, attachments: true } },
  subIssues: { select: issueRefSelect, orderBy: { created: "asc" } },
  relationsFrom: {
    select: { id: true, type: true, related: { select: issueRefSelect } },
    orderBy: { created: "asc" },
  },
  relationsTo: {
    select: { id: true, type: true, issue: { select: issueRefSelect } },
    orderBy: { created: "asc" },
  },
} satisfies Prisma.IssueSelect;

type IssueRow = Prisma.IssueGetPayload<{ select: typeof issueSelect }>;

export interface ApiIssue {
  id: string;
  /** "PREFIX-123" — the human-facing identifier shown in the app. */
  ref: string;
  title: string;
  status: string;
  /** The status's category (BARY-161): "backlog" | "unstarted" | "started"
   *  | "completed" | "canceled" — stable across workspaces, unlike status
   *  ids and names. `null` for a status that no longer exists. */
  statusCategory: StatusCategory | null;
  priority: number;
  type: string;
  labels: ApiLabel[];
  assignee: ApiUserRef | null;
  reporter: ApiUserRef;
  project: ApiProjectRef;
  /** Markdown, the same dialect `description` is written in — not the
   *  internal ProseMirror document, which is an editor format, not a public
   *  API contract. */
  description: string;
  created: Date;
  updated: Date;
  closedAt: Date | null;
  dueDate: Date | null;
  storyPoints: number | null;
  estimateHours: number | null;
  /** "hours" | "days" | "weeks" | "months" | "years" (`EstimateUnit`) — a
   *  display hint for `estimateHours`, which itself always stays a
   *  normalized hour value. */
  estimateUnit: string | null;
  /** How many comments the issue has (replies included). They aren't
   *  embedded — fetch them from the comments endpoint when this is > 0. */
  commentCount: number;
  /** How many attachments (files and links) the issue has. The list itself,
   *  with links to view each one, only comes with a single issue
   *  (`attachments`) or from the attachments endpoint. */
  attachmentCount: number;
  /** Only on a single-issue fetch (`getIssueForUser`) — a page of issues
   *  would otherwise sign a URL for every file of every row. */
  attachments?: ApiAttachment[];
  source: ApiContentSource;
  /** `null` for a top-level issue. */
  parent: ApiIssueRef | null;
  /** Issues that have this one as their parent. */
  children: ApiIssueRef[];
  /** Blocks/relates to/duplicates edges, both directions. */
  relations: ApiIssueRelation[];
}

/** The category of each status among `rows` — one query per response. */
export async function statusCategories(
  rows: { status: string }[],
): Promise<Map<string, StatusCategory>> {
  const ids = [...new Set(rows.map((row) => row.status))];
  if (ids.length === 0) return new Map();
  const statuses = await db.status.findMany({
    where: { id: { in: ids } },
    select: { id: true, category: true },
  });
  return new Map(statuses.map((s) => [s.id, s.category]));
}

/** Member id → `handle` for every mention in `docs` — one query per
 *  response, so `toMarkdown` can write `@handle` (what the API accepts back)
 *  instead of the display name. */
async function resolveMentionHandles(
  docs: unknown[],
): Promise<Map<string, string>> {
  const ids = [...new Set(docs.flatMap((doc) => mentionedUserIds(doc)))];
  if (ids.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, handle: true },
  });
  return new Map(users.map((u) => [u.id, u.handle]));
}

export async function mapApiIssue(
  row: IssueRow,
  labelMap: Map<string, ApiLabel>,
  canView: (projectId: string) => Promise<boolean>,
  categories: Map<string, StatusCategory>,
  handles: Map<string, string>,
): Promise<ApiIssue> {
  const [parent, children, relations] = await Promise.all([
    row.parent ? toApiIssueRef(row.parent, canView) : Promise.resolve(null),
    Promise.all(row.subIssues.map((r) => toApiIssueRef(r, canView))).then(
      (rows) => rows.filter((r): r is ApiIssueRef => r !== null),
    ),
    Promise.all([
      ...row.relationsFrom.map(async (r) => {
        const issue = await toApiIssueRef(r.related, canView);
        return issue
          ? { id: r.id, type: r.type, direction: "outgoing" as const, issue }
          : null;
      }),
      ...row.relationsTo.map(async (r) => {
        const issue = await toApiIssueRef(r.issue, canView);
        return issue
          ? { id: r.id, type: r.type, direction: "incoming" as const, issue }
          : null;
      }),
    ]).then((rows) => rows.filter((r): r is ApiIssueRelation => r !== null)),
  ]);

  return {
    id: row.id,
    ref: `${row.project.prefix}-${row.key}`,
    title: row.title,
    status: row.status,
    statusCategory: categories.get(row.status) ?? null,
    priority: row.priority,
    type: row.type,
    labels: row.labels.map((id) => labelMap.get(id)).filter((l) => l != null),
    assignee: row.assignee ? mapUserRef(row.assignee) : null,
    reporter: mapUserRef(row.reporter),
    project: { id: row.project.id, name: row.project.name },
    description: toMarkdown(row.description, {
      mentionHandle: (id) => handles.get(id),
    }),
    created: row.created,
    updated: row.updated,
    closedAt: row.closedAt,
    dueDate: row.dueDate,
    storyPoints: row.storyPoints,
    estimateHours: row.estimateHours,
    estimateUnit: row.estimateUnit,
    commentCount: row._count.comments,
    attachmentCount: row._count.attachments,
    source: row.source,
    parent,
    children,
    relations,
  };
}

/** A page of rows as the API returns them, seen by `userId`. */
export async function mapApiIssues(
  userId: string,
  rows: IssueRow[],
): Promise<ApiIssue[]> {
  const [labelMap, categories, handles] = await Promise.all([
    resolveLabels(rows.map((row) => row.labels)),
    statusCategories(rows),
    resolveMentionHandles(rows.map((row) => row.description)),
  ]);
  const canView = makeProjectVisibility(userId);
  return Promise.all(
    rows.map((row) => mapApiIssue(row, labelMap, canView, categories, handles)),
  );
}

/** "PREFIX-123", the same shorthand `getIssueForUser` also accepts instead
 *  of the internal id — mirrors the web app's own `REF` check
 *  (`app/api/issues/[id]/route.ts`). */
const REF_PATTERN = /^([A-Za-z0-9]+)-(\d+)$/;

/**
 * Resolves a "PREFIX-123" ref to an issue id, scoped to the caller's own
 * projects. A prefix is only unique *within* a workspace
 * (`@@unique([workspaceId, prefix])`), so this checks every one of the
 * caller's workspaces that happens to have a project with that prefix — in
 * the near-certain case they don't reuse the same prefix across two of
 * their own workspaces, that's unambiguous. `null` if none match, or the
 * caller can't see the one that does.
 */
async function resolveIssueRef(
  userId: string,
  ref: string,
): Promise<string | null> {
  const match = ref.match(REF_PATTERN);
  if (!match) return null;
  const [, prefix, keyStr] = match;
  const key = Number(keyStr);

  const candidates = await db.project.findMany({
    where: {
      prefix: prefix.toUpperCase(),
      workspace: { members: { some: { userId } } },
    },
    select: { id: true },
  });

  for (const project of candidates) {
    if (!(await can(userId, "project.view", { projectId: project.id })))
      continue;
    const issue = await db.issue.findUnique({
      where: { projectId_key: { projectId: project.id, key } },
      select: { id: true },
    });
    if (issue) return issue.id;
  }
  return null;
}

/**
 * An issue's internal id for whatever the caller sent — an id or a
 * "PREFIX-123" ref. Anything that isn't ref-shaped passes through untouched
 * (no query), and a ref-shaped string is tried as an id first, like
 * `getIssueForUser`. When nothing matches the input comes back as it was, so
 * the caller's own lookup produces its usual 404.
 */
export async function resolveIssueId(
  userId: string,
  idOrRef: string,
): Promise<string> {
  if (!REF_PATTERN.test(idOrRef)) return idOrRef;
  const byId = await db.issue.findUnique({
    where: { id: idOrRef },
    select: { id: true },
  });
  if (byId) return idOrRef;
  return (await resolveIssueRef(userId, idOrRef)) ?? idOrRef;
}

/** `null` means "not visible to this user" — routes turn that into a 404,
 *  same as a project that doesn't exist. */
export async function listIssuesForUser(
  userId: string,
  projectId: string,
  options: {
    status?: string;
    assignee?: string;
    /** Case-insensitive substring match against title and description —
     *  the same two fields the internal search (`getSearchIssues`) checks,
     *  without pulling in its ranking/highlighting machinery. */
    q?: string;
    /** A filter tree, as a view stores it (BARY-172) — `@me` is the
     *  caller. */
    filter?: IssueFilter;
    cursor?: string;
    take: number;
  },
): Promise<{ rows: ApiIssue[]; hasMore: boolean } | null> {
  if (!(await can(userId, "project.view", { projectId }))) return null;

  const rows = await db.issue.findMany({
    where: {
      ...(options.filter
        ? await toIssueWhere(options.filter, await filterContext(userId))
        : {}),
      projectId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.assignee ? { assigneeId: options.assignee } : {}),
      ...(options.q
        ? {
            OR: [
              { title: { contains: options.q, mode: "insensitive" } },
              { descriptionText: { contains: options.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: issueSelect,
    orderBy: [{ created: "desc" }, { id: "desc" }],
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: options.take + 1,
  });

  const hasMore = rows.length > options.take;
  const page = rows.slice(0, options.take);
  return { rows: await mapApiIssues(userId, page), hasMore };
}

/**
 * `idOrRef` accepts either the internal id or a "PREFIX-123" ref
 * (`resolveIssueRef` above) — the same convenience the web app's own
 * `/api/issues/[id]` route offers, so a caller that only knows the
 * human-facing identifier doesn't need a separate lookup first.
 *
 * Tried as an id first, ref second — not dispatched by matching
 * `REF_PATTERN` upfront, deliberately: an internal id is opaque (`uid("i")`
 * produces `i` + a UUID, which never looks like "PREFIX-123"), but nothing
 * stops some *other* id scheme from coincidentally matching the pattern,
 * and a real id should never be misread as a ref just because it has a
 * hyphen and ends in a digit.
 */
export async function getIssueForUser(
  userId: string,
  idOrRef: string,
): Promise<ApiIssue | null> {
  let row = await db.issue.findUnique({
    where: { id: idOrRef },
    select: issueSelect,
  });
  if (!row) {
    const id = await resolveIssueRef(userId, idOrRef);
    if (!id) return null;
    row = await db.issue.findUnique({ where: { id }, select: issueSelect });
    if (!row) return null;
  }

  const canView = makeProjectVisibility(userId);
  if (!(await canView(row.projectId))) return null;
  const [labelMap, categories, handles, attachments] = await Promise.all([
    resolveLabels([row.labels]),
    statusCategories([row]),
    resolveMentionHandles([row.description]),
    issueAttachments(row.id),
  ]);
  return {
    ...(await mapApiIssue(row, labelMap, canView, categories, handles)),
    attachments,
  };
}

/**
 * Same shape as `getIssueForUser`, without the permission check — for
 * server-side callers that already established the actor is allowed to see
 * this issue (e.g. `features/issues/actions.ts`'s `createIssue`/
 * `updateIssue`, right after their own `requirePermission*` calls). Calling
 * `can()` again there would be redundant and, worse, drags in
 * `lib/permissions.ts`'s full resolution chain (an extra `db.project`
 * query) purely to build a webhook payload — not worth it when the caller
 * has already proven access a stricter way. Only the internal id is
 * accepted here, unlike `getIssueForUser` — every caller already has it.
 * Parent/sub-issues/relations are included unconditionally (no `userId` to
 * check visibility against): this is the trusted internal envelope of the
 * issue (webhook payloads), not a response shaped for one specific viewer.
 */
export async function getIssueUnchecked(id: string): Promise<ApiIssue | null> {
  const row = await db.issue.findUnique({ where: { id }, select: issueSelect });
  if (!row) return null;
  const [labelMap, categories, handles] = await Promise.all([
    resolveLabels([row.labels]),
    statusCategories([row]),
    resolveMentionHandles([row.description]),
  ]);
  return mapApiIssue(
    row,
    labelMap,
    () => Promise.resolve(true),
    categories,
    handles,
  );
}

export interface ApiComment {
  id: string;
  issueId: string;
  author: ApiUserRef;
  parentId: string | null;
  body: string;
  created: Date;
  updated: Date | null;
  source: ApiContentSource;
}

const commentSelect = {
  id: true,
  issueId: true,
  author: { select: userRefSelect },
  parentId: true,
  body: true,
  created: true,
  updated: true,
  source: true,
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

function mapApiComment(
  row: CommentRow,
  handles: Map<string, string>,
): ApiComment {
  return {
    id: row.id,
    issueId: row.issueId,
    author: mapUserRef(row.author),
    parentId: row.parentId,
    body: toMarkdown(row.body, { mentionHandle: (id) => handles.get(id) }),
    created: row.created,
    updated: row.updated,
    source: row.source,
  };
}

/** `null` means the issue doesn't exist or isn't visible — routes turn
 *  that into a 404. */
export async function listCommentsForUser(
  userId: string,
  idOrRef: string,
): Promise<ApiComment[] | null> {
  const issueId = await resolveIssueId(userId, idOrRef);
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: { projectId: true },
  });
  if (!issue) return null;
  if (!(await can(userId, "project.view", { projectId: issue.projectId })))
    return null;

  const rows = await db.comment.findMany({
    where: { issueId },
    orderBy: { created: "asc" },
    select: commentSelect,
  });
  const handles = await resolveMentionHandles(rows.map((r) => r.body));
  return rows.map((row) => mapApiComment(row, handles));
}

/** Same shape as `listCommentsForUser`'s rows, without the permission
 *  check — for server-side callers (`addComment`/`createCommentForUser`)
 *  that already established access a stricter way. Mirrors
 *  `getIssueUnchecked`'s reasoning exactly. */
export async function getCommentUnchecked(
  id: string,
): Promise<ApiComment | null> {
  const row = await db.comment.findUnique({
    where: { id },
    select: commentSelect,
  });
  if (!row) return null;
  return mapApiComment(row, await resolveMentionHandles([row.body]));
}

export interface ApiAttachment {
  id: string;
  issueId: string;
  /** "file" — uploaded, stored by Barynt; "link" — an external address. */
  kind: "file" | "link";
  name: string;
  /** Where to view it. A link's own address; for a file a signed download
   *  URL that needs no token but stops working at `urlExpiresAt` — fetch
   *  the attachment again for a fresh one. `null` when file storage isn't
   *  configured on this instance. */
  url: string | null;
  /** When a file's `url` expires. `null` for a link (it doesn't). */
  urlExpiresAt: Date | null;
  mimeType: string | null;
  /** Bytes. Only for files. */
  size: number | null;
  author: ApiUserRef;
  created: Date;
}

export const attachmentSelect = {
  id: true,
  issueId: true,
  kind: true,
  name: true,
  key: true,
  url: true,
  mimeType: true,
  size: true,
  created: true,
  author: { select: userRefSelect },
} satisfies Prisma.AttachmentSelect;

export type AttachmentRow = Prisma.AttachmentGetPayload<{
  select: typeof attachmentSelect;
}>;

export async function mapApiAttachment(
  row: AttachmentRow,
): Promise<ApiAttachment> {
  const isFile = row.kind === "file";
  const url = isFile ? await resolveAttachmentUrl(row.key) : row.url;
  return {
    id: row.id,
    issueId: row.issueId,
    kind: isFile ? "file" : "link",
    name: row.name,
    url,
    urlExpiresAt:
      isFile && url ? new Date(Date.now() + GET_EXPIRES_IN * 1000) : null,
    mimeType: row.mimeType,
    size: row.size,
    author: mapUserRef(row.author),
    created: row.created,
  };
}

/** An issue's attachments, oldest first — the app's order
 *  (`IssueAttachments`). No permission check: callers have one. */
async function issueAttachments(issueId: string): Promise<ApiAttachment[]> {
  const rows = await db.attachment.findMany({
    where: { issueId },
    orderBy: { created: "asc" },
    select: attachmentSelect,
  });
  return Promise.all(rows.map(mapApiAttachment));
}

/** `null` means the issue doesn't exist or isn't visible — routes turn
 *  that into a 404. Same visibility rule as the issue itself. */
export async function listAttachmentsForUser(
  userId: string,
  idOrRef: string,
): Promise<ApiAttachment[] | null> {
  const issueId = await resolveIssueId(userId, idOrRef);
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: { projectId: true },
  });
  if (!issue) return null;
  if (!(await can(userId, "project.view", { projectId: issue.projectId })))
    return null;
  return issueAttachments(issueId);
}

/** One attachment with a freshly signed URL — `null` when it doesn't exist
 *  or its issue isn't visible. Also returns the stored object key for
 *  callers that read the file itself (`get_attachment` with content); the
 *  key never leaves the server. */
export async function getAttachmentForUser(
  userId: string,
  attachmentId: string,
): Promise<{ attachment: ApiAttachment; key: string | null } | null> {
  const row = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: { ...attachmentSelect, issue: { select: { projectId: true } } },
  });
  if (!row) return null;
  if (!(await can(userId, "project.view", { projectId: row.issue.projectId })))
    return null;
  return { attachment: await mapApiAttachment(row), key: row.key };
}

/** A label, with enough to tell where it applies — unlike the minimal
 *  `ApiLabel` embedded in `ApiIssue.labels`, this is the full resource shape
 *  for the dedicated label endpoints. */
export interface ApiLabelDetail {
  id: string;
  name: string;
  slug: string;
  color: string;
  /** `null` for a workspace-wide label. */
  projectId: string | null;
}

/** Every label visible in the workspace: workspace-wide ones plus those
 *  belonging to a project the caller can see — same rule as the app's own
 *  label picker (`getLabels`, `features/issues/queries.ts`), just
 *  `userId`-parameterized instead of session-based. `null` means the
 *  workspace doesn't exist or isn't visible to this user. */
export async function listLabelsForUser(
  userId: string,
  workspaceId: string,
): Promise<ApiLabelDetail[] | null> {
  // Unlike `getLabels` (session-based, called only from pages already
  // behind `canEnterWorkspace` at the layout level), a route handler here
  // gets the workspace id straight from the URL — nothing upstream has
  // proven the caller belongs to it. Without this check, a workspace-wide
  // label (`projectId: null`) would leak to anyone who can guess an id: the
  // `OR` below only filters *project*-scoped labels by visibility.
  if (!(await canEnterWorkspace(userId, workspaceId))) return null;

  const visible = await accessibleProjectIds(userId, workspaceId);
  const rows = await db.label.findMany({
    where: {
      workspaceId,
      OR: [{ projectId: null }, { projectId: { in: [...visible] } }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, color: true, projectId: true },
  });
  return rows;
}

// ─── Members ─────────────────────────────────────────────────────────────────

/** A workspace or project member — `handle` so a caller can `@mention` them
 *  in a later write (`features/api-v1/richtext.ts`), `role` the stable role
 *  key (`Role.key`, e.g. `"admin"`), not the editable display name. */
export interface ApiMember {
  id: string;
  name: string;
  email: string | null;
  handle: string;
  role: string;
}

const memberUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  handle: true,
} satisfies Prisma.UserSelect;

function mapApiMember(row: {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    handle: string;
  };
  role: { key: string };
}): ApiMember {
  return {
    id: row.user.id,
    name: fullName(row.user),
    email: row.user.email,
    handle: row.user.handle,
    role: row.role.key,
  };
}

/** Every member of a workspace. `null` means the workspace doesn't exist or
 *  isn't visible to this user. */
export async function listWorkspaceMembersForUser(
  userId: string,
  workspaceId: string,
): Promise<ApiMember[] | null> {
  if (!(await canEnterWorkspace(userId, workspaceId))) return null;

  const rows = await db.workspaceMember.findMany({
    where: { workspaceId },
    select: {
      user: { select: memberUserSelect },
      role: { select: { key: true } },
    },
    orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
  });
  return rows.map(mapApiMember);
}

/**
 * Every member of a project — the `ProjectMember` rows themselves, not the
 * full effective access list: a workspace owner/admin who can reach into a
 * *private* project without an explicit row there (`getProjectMembersView`,
 * `features/projects/queries.ts`) won't appear here. Known simplification,
 * same category as the rest of `features/api-v1` — revisit if it turns out
 * to matter once there's real API usage to look at. `null` means the
 * project doesn't exist or isn't visible to this user.
 */
export async function listProjectMembersForUser(
  userId: string,
  projectId: string,
): Promise<ApiMember[] | null> {
  if (!(await can(userId, "project.view", { projectId }))) return null;

  const rows = await db.projectMember.findMany({
    where: { projectId },
    select: {
      user: { select: memberUserSelect },
      role: { select: { key: true } },
    },
    orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
  });
  return rows.map(mapApiMember);
}
