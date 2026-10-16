import "server-only";
import { cache } from "react";
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
import { viewPath } from "./url";

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
    startView: state?.startView ?? false,
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

/** One view by id, if the current user may see it — the check behind a
 *  start view chosen in the settings (V7). */
export async function getVisibleViewById(
  id: string,
): Promise<SavedView | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const row = await db.savedView.findUnique({
    where: { id },
    include: viewInclude(userId),
  });
  if (!row) return null;
  const facts = await viewAccessFacts(userId, {
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  return canSeeView(row, facts) ? mapView(row, facts) : null;
}

// ─── Navigation (V7) ────────────────────────────────────────────────────────

/** A view as the navigation needs it. */
export interface NavView {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  layout: ViewLayout;
  projectId: string | null;
  pinned: boolean;
  favorite: boolean;
  favoritePosition: number | null;
  startView: boolean;
}

/**
 * The views the current user pinned, starred or made a project's start
 * view in a workspace — only those they can still see. A view that went
 * private or whose project they left drops out here and nowhere else.
 */
export const getNavViews = cache(async function getNavViews(
  workspaceId: string,
): Promise<NavView[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const states = await db.savedViewUserState.findMany({
    where: {
      userId,
      view: { workspaceId },
      OR: [{ pinned: true }, { favorite: true }, { startView: true }],
    },
    include: { view: true },
  });

  // One access lookup per scope, not per view.
  const scopes = new Map<string, Promise<ViewAccessFacts>>();
  const factsFor = (projectId: string | null) => {
    const key = projectId ?? "";
    let facts = scopes.get(key);
    if (!facts) {
      facts = viewAccessFacts(userId, { workspaceId, projectId });
      scopes.set(key, facts);
    }
    return facts;
  };

  const visible = await Promise.all(
    states.map(async (s) =>
      canSeeView(s.view, await factsFor(s.view.projectId)) ? s : null,
    ),
  );
  return visible
    .filter((s): s is (typeof states)[number] => s !== null)
    .sort(
      (a, b) =>
        a.view.position - b.view.position ||
        a.view.createdAt.getTime() - b.view.createdAt.getTime(),
    )
    .map((s) => ({
      id: s.view.id,
      name: s.view.name,
      slug: s.view.slug,
      icon: s.view.icon,
      color: s.view.color,
      layout: (VIEW_LAYOUTS as readonly string[]).includes(s.view.layout)
        ? (s.view.layout as ViewLayout)
        : "list",
      projectId: s.view.projectId,
      pinned: s.pinned,
      favorite: s.favorite,
      favoritePosition: s.favoritePosition,
      startView: s.startView,
    }));
});

/** The projects the current user starred, with their place in the list. */
export async function getFavoriteProjects(
  projectIds: string[],
): Promise<{ projectId: string; favoritePosition: number | null }[]> {
  const userId = await currentUserId();
  if (!userId || !projectIds.length) return [];
  return db.projectUserState.findMany({
    where: { userId, projectId: { in: projectIds }, favorite: true },
    select: { projectId: true, favoritePosition: true },
  });
}

/** Where a start view lives — `null` once it's gone, out of sight, or (until
 *  V8 gives them pages) not in a project. */
export async function startViewTarget(id: string): Promise<string | null> {
  const view = await getVisibleViewById(id);
  if (!view?.projectId) return null;
  const project = await db.project.findUnique({
    where: { id: view.projectId },
    select: { slug: true },
  });
  return project ? viewPath(view.workspaceId, project.slug, view.slug) : null;
}

/** A project view as pickers list it — the view switcher (V) and the
 *  start page choice (V7). */
export interface ProjectViewEntry {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  layout: ViewLayout;
  favorite: boolean;
  projectId: string;
  projectSlug: string;
  projectName: string;
}

/** Every project view the current user sees in a workspace, by project
 *  name, then in tab order. */
export async function getVisibleProjectViews(
  workspaceId: string,
): Promise<ProjectViewEntry[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const rows = await db.savedView.findMany({
    where: {
      workspaceId,
      projectId: { not: null },
      OR: [
        { visibility: "PROJECT" },
        { visibility: "PRIVATE", ownerId: userId },
      ],
    },
    include: {
      project: { select: { slug: true, name: true } },
      userStates: { where: { userId }, select: { favorite: true } },
    },
    orderBy: [{ project: { name: "asc" } }, ...ORDER],
  });
  const seen = new Map<string, Promise<ViewAccessFacts>>();
  const visible = await Promise.all(
    rows.map(async (row) => {
      const projectId = row.projectId as string;
      let facts = seen.get(projectId);
      if (!facts) {
        facts = viewAccessFacts(userId, { workspaceId, projectId });
        seen.set(projectId, facts);
      }
      return canSeeView(row, await facts) ? row : null;
    }),
  );
  return visible.flatMap((row) =>
    row?.project
      ? [
          {
            id: row.id,
            name: row.name,
            slug: row.slug,
            icon: row.icon,
            color: row.color,
            layout: (VIEW_LAYOUTS as readonly string[]).includes(row.layout)
              ? (row.layout as ViewLayout)
              : "list",
            favorite: row.userStates[0]?.favorite ?? false,
            projectId: row.projectId as string,
            projectSlug: row.project.slug,
            projectName: row.project.name,
          },
        ]
      : [],
  );
}

/** The views a start page can be set to. */
export async function getStartViewChoices(
  workspaceId: string,
): Promise<{ id: string; name: string; projectName: string }[]> {
  return (await getVisibleProjectViews(workspaceId)).map((v) => ({
    id: v.id,
    name: v.name,
    projectName: v.projectName,
  }));
}
