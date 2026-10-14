import "server-only";
import { EMPTY_FILTER, parseIssueFilter } from "@/features/issues/filter";
import { isGroupKey } from "@/features/issues/group";
import { isSortKey } from "@/features/issues/sort";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can, canEnterWorkspace, currentUserId } from "@/lib/permissions";
import { canEditView, canSeeView, type ViewAccessFacts } from "./access";
import {
  type SavedView,
  SORT_DIRS,
  type SortDir,
  VIEW_LAYOUTS,
  type ViewLayout,
  viewDisplaySchema,
} from "./schema";

/**
 * The facts `access.ts` decides on, for one user and one scope — the
 * view's project, or its workspace for a cross-project view.
 */
export async function viewAccessFacts(
  userId: string,
  scope: { workspaceId: string; projectId: string | null },
): Promise<ViewAccessFacts> {
  const ctx = scope.projectId
    ? { projectId: scope.projectId }
    : { workspaceId: scope.workspaceId };
  const [canSeeScope, canShare, canManage] = await Promise.all([
    scope.projectId
      ? can(userId, "project.view", { projectId: scope.projectId })
      : canEnterWorkspace(userId, scope.workspaceId),
    can(userId, "view.share", ctx),
    can(userId, "view.manage", ctx),
  ]);
  return { userId, canSeeScope, canShare, canManage };
}

const viewInclude = (userId: string) =>
  ({
    userStates: { where: { userId } },
  }) satisfies Prisma.SavedViewInclude;

type ViewRow = Prisma.SavedViewGetPayload<{
  include: ReturnType<typeof viewInclude>;
}>;

/**
 * A row as the app reads it. Filter and display are validated again on the
 * way out: a row written by an older version — or by hand — never reaches
 * the query builder unchecked. What doesn't parse falls back to "no
 * filter" / the layout's defaults instead of breaking the page.
 */
export function mapView(row: ViewRow, facts: ViewAccessFacts): SavedView {
  const state = row.userStates[0];
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    ownerId: row.ownerId,
    visibility: row.visibility,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    color: row.color,
    position: row.position,
    layout: (VIEW_LAYOUTS as readonly string[]).includes(row.layout)
      ? (row.layout as ViewLayout)
      : "list",
    filter: parseIssueFilter(row.filter) ?? EMPTY_FILTER,
    groupBy: row.groupBy && isGroupKey(row.groupBy) ? row.groupBy : null,
    subGroupBy:
      row.subGroupBy && isGroupKey(row.subGroupBy) ? row.subGroupBy : null,
    sortBy: isSortKey(row.sortBy) ? row.sortBy : "manual",
    sortDir: (SORT_DIRS as readonly string[]).includes(row.sortDir)
      ? (row.sortDir as SortDir)
      : "asc",
    display: viewDisplaySchema.safeParse(row.display).data ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pinned: state?.pinned ?? false,
    favorite: state?.favorite ?? false,
    favoritePosition: state?.favoritePosition ?? null,
    collapsedGroups: state?.collapsedGroups ?? [],
    canEdit: canEditView(row, facts),
  };
}

const ORDER = [
  { position: "asc" },
  { createdAt: "asc" },
] satisfies Prisma.SavedViewOrderByWithRelationInput[];

/**
 * The views of a project the current user sees: the shared ones and their
 * own private ones. Empty without `project.view` — the views are as much the
 * project's content as its issues.
 */
export async function getProjectViews(
  workspaceId: string,
  projectId: string,
): Promise<SavedView[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const facts = await viewAccessFacts(userId, { workspaceId, projectId });
  if (!facts.canSeeScope) return [];

  const rows = await db.savedView.findMany({
    where: {
      workspaceId,
      projectId,
      OR: [
        { visibility: "PROJECT" },
        { visibility: "PRIVATE", ownerId: userId },
      ],
    },
    include: viewInclude(userId),
    orderBy: ORDER,
  });
  return rows.map((row) => mapView(row, facts));
}

/** The cross-project views of a workspace the current user sees. */
export async function getWorkspaceViews(
  workspaceId: string,
): Promise<SavedView[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const facts = await viewAccessFacts(userId, {
    workspaceId,
    projectId: null,
  });
  if (!facts.canSeeScope) return [];

  const rows = await db.savedView.findMany({
    where: {
      workspaceId,
      projectId: null,
      OR: [
        { visibility: "WORKSPACE" },
        { visibility: "PRIVATE", ownerId: userId },
      ],
    },
    include: viewInclude(userId),
    orderBy: ORDER,
  });
  return rows.map((row) => mapView(row, facts));
}

/**
 * One view by its address. `null` both when it doesn't exist and when the
 * user may not see it — the page turns either into a 404, without telling
 * which.
 */
export async function getViewBySlug(
  workspaceId: string,
  slug: string,
): Promise<SavedView | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const row = await db.savedView.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    include: viewInclude(userId),
  });
  if (!row) return null;

  const facts = await viewAccessFacts(userId, {
    workspaceId,
    projectId: row.projectId,
  });
  return canSeeView(row, facts) ? mapView(row, facts) : null;
}
