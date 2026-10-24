import "server-only";
import {
  EMPTY_FILTER,
  type IssueFilter,
  narrowProjects,
  parseIssueFilter,
} from "@/features/issues/filter";
import { toIssueWhere } from "@/features/issues/filter-where";
import { filterContext } from "@/features/issues/queries";
import { canEditView, canSeeView } from "@/features/views/access";
import {
  createViewFor,
  deleteViewFor,
  updateViewFor,
  type ViewResult,
} from "@/features/views/core";
import { viewAccessFacts } from "@/features/views/queries";
import { isSystemViewKey } from "@/features/views/schema";
import { ensureSystemViews } from "@/features/views/system";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  accessibleProjectIds,
  can,
  canEnterWorkspace,
} from "@/lib/permissions";
import type { StatusCategory } from "@/lib/status-category";
import type { MutationResult } from "./mutations";
import {
  type ApiIssue,
  type ApiProjectRef,
  type ApiUserRef,
  issueSelect,
  mapApiIssues,
  mapUserRef,
} from "./queries";

// Saved views in the public API and MCP (BARY-172). Same rules as in the
// app — `features/views/access.ts` decides who sees and changes what, and
// creating, changing and deleting go through `features/views/core.ts`. A
// view the caller can't see is a 404, never a 403.

/** A workspace's system views by their key — English, like the rest of the
 *  API's wire format. */
const SYSTEM_VIEW_NAMES: Record<string, string> = {
  "my-issues": "My issues",
  "created-by-me": "Created by me",
};

export interface ApiView {
  id: string;
  name: string;
  /** Part of the view's address in the app (`…/view/<slug>`). */
  slug: string;
  /** "my-issues" | "created-by-me" for a workspace's built-in views — they
   *  belong to nobody and can't be changed. `null` otherwise. */
  systemKey: string | null;
  workspaceId: string;
  /** `null` for a cross-project (workspace) view. */
  project: ApiProjectRef | null;
  /** `null` for a system view, or when the creator's account is gone. */
  owner: ApiUserRef | null;
  visibility: "PRIVATE" | "PROJECT" | "WORKSPACE";
  layout: string;
  icon: string | null;
  color: string | null;
  /** The filter tree — the same shape `list_issues`/`?filter=` accept.
   *  `@me` stays as written; it means whoever asks. */
  filter: IssueFilter;
  groupBy: string | null;
  subGroupBy: string | null;
  sortBy: string;
  sortDir: string;
  createdAt: Date;
  updatedAt: Date;
  /** May the caller change or delete it. */
  canEdit: boolean;
}

const viewSelect = {
  id: true,
  name: true,
  slug: true,
  systemKey: true,
  workspaceId: true,
  projectId: true,
  ownerId: true,
  visibility: true,
  layout: true,
  icon: true,
  color: true,
  filter: true,
  groupBy: true,
  subGroupBy: true,
  sortBy: true,
  sortDir: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, name: true } },
  owner: {
    select: { id: true, firstName: true, lastName: true, handle: true },
  },
} satisfies Prisma.SavedViewSelect;

type ViewRow = Prisma.SavedViewGetPayload<{ select: typeof viewSelect }>;

function mapApiView(row: ViewRow, canEdit: boolean): ApiView {
  return {
    id: row.id,
    name: (row.systemKey && SYSTEM_VIEW_NAMES[row.systemKey]) || row.name,
    slug: row.slug,
    systemKey: isSystemViewKey(row.systemKey) ? row.systemKey : null,
    workspaceId: row.workspaceId,
    project: row.project
      ? { id: row.project.id, name: row.project.name }
      : null,
    owner: row.owner ? mapUserRef(row.owner) : null,
    visibility: row.visibility,
    layout: row.layout,
    icon: row.icon,
    color: row.color,
    filter: parseIssueFilter(row.filter) ?? EMPTY_FILTER,
    groupBy: row.groupBy,
    subGroupBy: row.subGroupBy,
    sortBy: row.sortBy,
    sortDir: row.sortDir,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canEdit,
  };
}

/** The rows of one scope the caller may see, in tab order. */
async function visibleViews(
  userId: string,
  scope: { workspaceId: string; projectId: string | null },
): Promise<ApiView[]> {
  const facts = await viewAccessFacts(userId, scope);
  if (!facts.canSeeScope) return [];
  const rows = await db.savedView.findMany({
    where: { workspaceId: scope.workspaceId, projectId: scope.projectId },
    select: viewSelect,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return rows
    .filter((row) => canSeeView(row, facts))
    .map((row) => mapApiView(row, canEditView(row, facts)));
}

/** A project's views the caller sees. `null`: no such project for them. */
export async function listProjectViewsForUser(
  userId: string,
  projectId: string,
): Promise<ApiView[] | null> {
  if (!(await can(userId, "project.view", { projectId }))) return null;
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project) return null;
  return visibleViews(userId, { workspaceId: project.workspaceId, projectId });
}

/** A workspace's cross-project views (system views included). */
export async function listWorkspaceViewsForUser(
  userId: string,
  workspaceId: string,
): Promise<ApiView[] | null> {
  if (!(await canEnterWorkspace(userId, workspaceId))) return null;
  // The built-in views exist on first use in the app — same here.
  await ensureSystemViews(workspaceId);
  return visibleViews(userId, { workspaceId, projectId: null });
}

/** One view, if the caller may see it. */
export async function getViewForUser(
  userId: string,
  id: string,
): Promise<ApiView | null> {
  const row = await db.savedView.findUnique({
    where: { id },
    select: viewSelect,
  });
  if (!row) return null;
  const facts = await viewAccessFacts(userId, row);
  if (!canSeeView(row, facts)) return null;
  return mapApiView(row, canEditView(row, facts));
}

/**
 * The `where` for a filter in a scope, seen by `userId`: their `@me`, only
 * projects they may see, and a system view's fixed condition. `null` when
 * nothing can match (no visible project left).
 */
async function scopedWhere(
  userId: string,
  filter: IssueFilter,
  scope: { workspaceId: string; projectId: string | null },
  systemKey: string | null,
): Promise<Prisma.IssueWhereInput | null> {
  let projects: Prisma.IssueWhereInput;
  if (scope.projectId) {
    projects = { projectId: scope.projectId };
  } else {
    const visible = await accessibleProjectIds(userId, scope.workspaceId);
    const narrowed = narrowProjects(filter, visible);
    if (narrowed.length === 0) return null;
    projects = { projectId: { in: narrowed } };
  }
  const where = await toIssueWhere(filter, await filterContext(userId));
  return {
    AND: [
      where,
      projects,
      // "My issues" / "Created by me": the fixed condition sits behind the
      // filter, like in the app — it can't be widened.
      ...(systemKey === "my-issues" ? [{ assigneeId: userId }] : []),
      ...(systemKey === "created-by-me" ? [{ reporterId: userId }] : []),
    ],
  };
}

/** A page of issues as a where would give them, newest first. */
async function issuePage(
  userId: string,
  where: Prisma.IssueWhereInput | null,
  options: { cursor?: string; take: number },
): Promise<{ rows: ApiIssue[]; hasMore: boolean }> {
  if (!where) return { rows: [], hasMore: false };
  const rows = await db.issue.findMany({
    where,
    select: issueSelect,
    orderBy: [{ created: "desc" }, { id: "desc" }],
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: options.take + 1,
  });
  const hasMore = rows.length > options.take;
  return {
    rows: await mapApiIssues(userId, rows.slice(0, options.take)),
    hasMore,
  };
}

/**
 * The issues a view shows, as the caller would see them in the app:
 * its filter (with their `@me`), its project or their visible projects,
 * a system view's fixed condition. Newest first — paging needs a stable
 * order; the view's own sort is for the board and list.
 */
export async function listViewIssuesForUser(
  userId: string,
  viewId: string,
  options: { cursor?: string; take: number },
): Promise<{ rows: ApiIssue[]; hasMore: boolean } | null> {
  const view = await getViewForUser(userId, viewId);
  if (!view) return null;
  const where = await scopedWhere(
    userId,
    view.filter,
    { workspaceId: view.workspaceId, projectId: view.project?.id ?? null },
    view.systemKey,
  );
  return issuePage(userId, where, options);
}

// ─── Statuses ────────────────────────────────────────────────────────────────

export interface ApiStatus {
  id: string;
  name: string;
  short: string;
  color: string;
  /** "backlog" | "unstarted" | "started" | "completed" | "canceled". */
  category: StatusCategory;
  /** Shown as a board column. */
  isColumn: boolean;
  position: number;
}

/** A workspace's statuses in board order. `null`: not a member. */
export async function listStatusesForUser(
  userId: string,
  workspaceId: string,
): Promise<ApiStatus[] | null> {
  if (!(await canEnterWorkspace(userId, workspaceId))) return null;
  const rows = await db.workspaceStatus.findMany({
    where: { workspaceId },
    select: {
      status: {
        select: {
          id: true,
          name: true,
          short: true,
          color: true,
          category: true,
          isColumn: true,
          position: true,
        },
      },
    },
  });
  return rows.map((r) => r.status).sort((a, b) => a.position - b.position);
}

// ─── Writing ─────────────────────────────────────────────────────────────────

/** A `ViewResult` as the API answers it: not visible → 404, not allowed →
 *  403, bad input → 422. */
function asMutation<T, U>(
  result: ViewResult<T>,
  map: (data: T) => U,
): MutationResult<U> {
  if (result.ok) return { ok: true, data: map(result.data) };
  if (result.error === "forbidden") return { ok: false, status: 403 };
  if (result.error === "invalid") return { ok: false, status: 422 };
  return { ok: false, status: 404 };
}

const object = (input: unknown): Record<string, unknown> =>
  input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};

/** Create a view in a project (`projectId`) or a workspace (cross-project).
 *  Private by default; shared needs `view.share`, as in the app. */
export async function createViewForApi(
  userId: string,
  scope: { projectId: string } | { workspaceId: string },
  input: unknown,
): Promise<MutationResult<ApiView>> {
  const body = object(input);
  // The scope comes from the path, never from the body.
  const result = await createViewFor(userId, {
    ...body,
    ...("projectId" in scope
      ? // The workspace comes from the project (`createViewFor`) — this
        // only satisfies the schema.
        { projectId: scope.projectId, workspaceId: "-" }
      : { projectId: null, workspaceId: scope.workspaceId }),
  } as Parameters<typeof createViewFor>[1]);
  if (!result.ok) return asMutation(result, () => null as never);
  const view = await getViewForUser(userId, result.data.id);
  return view ? { ok: true, data: view } : { ok: false, status: 404 };
}

export async function updateViewForApi(
  userId: string,
  id: string,
  input: unknown,
): Promise<MutationResult<ApiView>> {
  const result = await updateViewFor(
    userId,
    id,
    object(input) as Parameters<typeof updateViewFor>[2],
  );
  if (!result.ok) return asMutation(result, () => null as never);
  const view = await getViewForUser(userId, id);
  return view ? { ok: true, data: view } : { ok: false, status: 404 };
}

export async function deleteViewForApi(
  userId: string,
  id: string,
): Promise<MutationResult<{ id: string }>> {
  return asMutation(await deleteViewFor(userId, id), () => ({ id }));
}
