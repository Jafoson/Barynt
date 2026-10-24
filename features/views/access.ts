import type { ViewVisibility } from "./schema";

/**
 * Who may see, create and change a saved view (BARY-163) — the rules as pure
 * functions over facts the server looked up first. Kept apart from the
 * lookups so every combination is testable without a database.
 *
 * The scope of a view is its project, or its workspace for a cross-project
 * view. `view.share` and `view.manage` are checked in that scope.
 */
export interface ViewAccessFacts {
  userId: string;
  /** May the viewer see the scope at all — `project.view` on the project,
   *  or entry to the workspace for a cross-project view. */
  canSeeScope: boolean;
  /** `view.share` in the view's scope. */
  canShare: boolean;
  /** `view.manage` in the view's scope. */
  canManage: boolean;
}

interface ViewRef {
  visibility: ViewVisibility;
  ownerId: string | null;
  /** Set on a workspace's system views (V8). */
  systemKey?: string | null;
}

/**
 * A shared view lives at exactly one level: `PROJECT` views belong to a
 * project, `WORKSPACE` views to none. `PRIVATE` fits both. The database has
 * the same rule as a CHECK constraint.
 */
export function visibilityFitsScope(
  visibility: ViewVisibility,
  projectId: string | null,
): boolean {
  if (visibility === "PROJECT") return projectId !== null;
  if (visibility === "WORKSPACE") return projectId === null;
  return true;
}

/** A private view only for its owner; a shared one for everyone who sees
 *  the scope. Nobody sees a view in a scope they've lost access to. */
export function canSeeView(view: ViewRef, facts: ViewAccessFacts): boolean {
  if (!facts.canSeeScope) return false;
  return view.visibility !== "PRIVATE" || view.ownerId === facts.userId;
}

/**
 * Edit and delete. A private view: its owner. A shared view: its creator
 * while they still hold `view.share`, or anyone with `view.manage`. Without
 * that, the way to change a shared view is "save as new view" — a private
 * copy (`duplicateView`).
 */
export function canEditView(view: ViewRef, facts: ViewAccessFacts): boolean {
  if (!canSeeView(view, facts)) return false;
  // A system view belongs to nobody and stays as it is (V8) — "save as new
  // view" is the way to a changed copy.
  if (view.systemKey) return false;
  if (view.visibility === "PRIVATE") return view.ownerId === facts.userId;
  if (facts.canManage) return true;
  return view.ownerId === facts.userId && facts.canShare;
}

/**
 * Change who sees an existing view. On top of `canEditView`: sharing needs
 * `view.share` like creating a shared view does, and only the creator may
 * take a shared view back to private — otherwise a manager could pull a
 * view away from the team and into someone else's private list.
 */
export function canChangeVisibility(
  view: ViewRef & { projectId: string | null },
  next: ViewVisibility,
  facts: ViewAccessFacts,
): boolean {
  if (!canEditView(view, facts)) return false;
  if (next === view.visibility) return true;
  if (!visibilityFitsScope(next, view.projectId)) return false;
  if (next === "PRIVATE") return view.ownerId === facts.userId;
  return facts.canShare;
}

/** Create a view with this visibility — private for anyone who sees the
 *  scope, shared only with `view.share`. */
export function canCreateView(
  visibility: ViewVisibility,
  projectId: string | null,
  facts: ViewAccessFacts,
): boolean {
  if (!facts.canSeeScope) return false;
  if (!visibilityFitsScope(visibility, projectId)) return false;
  return visibility === "PRIVATE" || facts.canShare;
}
