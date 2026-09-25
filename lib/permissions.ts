import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  isPermissionAllowedIn,
  type PERMISSIONS,
  type Permission,
  permissionsFor,
  type RoleScope,
  toPermission,
} from "@/lib/rbac";
import { getSession } from "@/lib/session";

export type { Permission } from "@/lib/rbac";

// ─── Permission checks across three scopes ────────────────────────────────────
//
// A user has at most one role per scope: one on the platform, one in the
// workspace (`WorkspaceMember`), one per project (`ProjectMember`).
//
// **Each context resolves exactly one of these roles.** Nothing is merged:
//
//     Platform context:  platform role
//     Workspace context:  workspace role
//     Project context:    project role
//
// So only project permissions apply in a project, only workspace permissions
// in a workspace. What the level above allows is irrelevant to the level
// below — no row in `ProjectMember` means no project permissions, even for a
// workspace owner. There is no "deny" and none is needed: a role lists what
// it allows, and "not listed" already is the denial.
//
// Two safeguards enforce this even if the database claims otherwise:
// `collect()` only takes the keys from a role that the registry actually
// permits for it, and `permissionsFor(scope)` bounds every result. A stale or
// hand-edited `RolePermission` row in the wrong scope is thus harmless rather
// than dangerous.
//
// ── The master keys ──
//
// Strict separation alone would lock a workspace's leadership out of its own
// projects. That's what these three keys are for, and they're the only thing
// that crosses the boundary — downward, never upward:
//
//     tenant.access      (PLATFORM)   everything in every workspace and project
//     project.admin.all  (WORKSPACE)  everything in every project of the workspace
//     project.view.all   (WORKSPACE)  read access to every project of the workspace
//
// They're checked **before** the lower level's role is even loaded. That's
// exactly the guarantee: a `blocked` entry on a workspace admin isn't a
// demotion, just an inert row. No data state changes that.
//
// A permission key only names the object and action. That `label.create` on a
// workspace role means the workspace-wide label and on a project role means
// the project's own label follows purely from which role it's attached to.

// ─── Context ──────────────────────────────────────────────────────────────────

/** Context of a check — exactly one scope. */
export type PermissionContext =
  | { scope: "platform" }
  | { workspaceId: string }
  | { projectId: string };

/** The platform context as a constant, so call sites don't need to build a literal. */
export const PLATFORM = { scope: "platform" } as const;

/** Which context shape belongs to which scope. */
interface ScopeContext {
  PLATFORM: { scope: "platform" };
  WORKSPACE: { workspaceId: string };
  PROJECT: { projectId: string };
}

/**
 * The context in which a permission may be checked — derived from the
 * registry's `scopes`. This makes the type follow the data definition: if a
 * permission carries `["WORKSPACE", "PROJECT"]`, both contexts are allowed;
 * if only `["WORKSPACE"]` is listed, `{ projectId }` is a compile error
 * instead of a silent `false` answer.
 */
export type ContextFor<P extends Permission> =
  ScopeContext[(typeof PERMISSIONS)[P]["scopes"][number]];

/** Thrown when a check fails. Actions thus fail closed. */
export class PermissionError extends Error {
  constructor(public permission: string) {
    super(`Permission denied: ${permission}`);
    this.name = "PermissionError";
  }
}

// ─── Logged-in user ─────────────────────────────────────────────────────────

/** User id of the current session, or null. */
export async function currentUserId(): Promise<string | null> {
  return (await getSession())?.userId ?? null;
}

async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new PermissionError("auth.required");
  return userId;
}

// ─── Cached DB lookups (deduplicated per request) ─────────────────────────────

// `satisfies` instead of just `as const`: a selection stored in a variable no
// longer gets TypeScript's excess-property check on assignment — only object
// literals written directly get that check. Without this assertion, a field
// that no longer exists in the schema would survive every type check and
// only fail at runtime.
const roleSelect = {
  key: true,
  rank: true,
  permissions: { select: { permissionKey: true } },
} as const satisfies Prisma.RoleSelect;

type GrantRow = { permissionKey: string };
type RoleWithGrants = { key: string; rank: number; permissions: GrantRow[] };

/**
 * Platform role and account state in one query.
 *
 * Both together, because both are needed on every path and come from the
 * same row: the role for the permissions, `deactivated` as the gate in front
 * of it. A deactivated account gets nothing — not on the platform, not in any
 * workspace, not in any project. That's why the lock comes before any role
 * resolution rather than alongside it.
 */
const loadPlatformState = cache(
  async (
    userId: string,
  ): Promise<{ role: RoleWithGrants | null; deactivated: boolean }> => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { deactivatedAt: true, platformRole: { select: roleSelect } },
    });
    return {
      role: user?.platformRole ?? null,
      deactivated: user?.deactivatedAt != null,
    };
  },
);

const loadWorkspaceRole = cache(
  async (
    workspaceId: string,
    userId: string,
  ): Promise<{ pending: boolean; role: RoleWithGrants } | null> => {
    return db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { pending: true, role: { select: roleSelect } },
    });
  },
);

const loadWorkspaceMeta = cache(async (workspaceId: string) => {
  return db.workspace.findUnique({
    where: { id: workspaceId },
    select: { suspended: true },
  });
});

// `visibility` is deliberately absent here: access is decided solely by the
// project role. Visibility only determines who gets auto-enrolled when a
// project is created (lib/project-membership.ts).
const loadProjectMeta = cache(async (projectId: string) => {
  return db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
});

/**
 * The user's **own** project role, or null.
 *
 * `ProjectMember` holds everyone who's in the project. A row without a
 * `roleId` records only that membership — the permissions then come solely
 * from the workspace, and for evaluation purposes it's effectively no row at
 * all.
 */
const loadProjectRole = cache(
  async (projectId: string, userId: string): Promise<RoleWithGrants | null> => {
    const member = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: { select: roleSelect } },
    });
    return member?.role ?? null;
  },
);

/** Is this person in at least one project of this workspace? */
const inAnyProject = cache(
  async (userId: string, workspaceId: string): Promise<boolean> => {
    const row = await db.projectMember.findFirst({
      where: { userId, project: { workspaceId } },
      select: { projectId: true },
    });
    return row !== null;
  },
);

// ─── Result ─────────────────────────────────────────────────────────────────

/** Which permissions apply, and which roles they come from. */
export interface Access {
  /** Does this permission hold in the resolved context? */
  has(permission: Permission): boolean;
  /** Rank of the effective role of a scope, or -1. Comes from the DB. */
  rank(scope: RoleScope): number;
  /** Key of the effective role of a scope, or null. */
  roleKey(scope: RoleScope): string | null;
  workspaceId: string | null;
  projectId: string | null;
}

interface ScopeRole {
  key: string;
  rank: number;
}

function makeAccess(
  granted: Set<Permission>,
  roles: Partial<Record<RoleScope, ScopeRole>>,
  workspaceId: string | null,
  projectId: string | null,
): Access {
  return {
    has: (permission) => granted.has(permission),
    rank: (scope) => roles[scope]?.rank ?? -1,
    roleKey: (scope) => roles[scope]?.key ?? null,
    workspaceId,
    projectId,
  };
}

/**
 * The permissions of a role, as far as they can even apply in this scope.
 *
 * The scope filter is what actually separates the levels: whatever a role of
 * this scope isn't allowed to carry per the registry is skipped. A row in
 * `RolePermission` left over from an earlier version, or set by hand,
 * therefore becomes inert — it doesn't need to be cleaned up first for the
 * separation to hold.
 */
function collect(
  role: RoleWithGrants | null | undefined,
  scope: RoleScope,
): Set<Permission> {
  const granted = new Set<Permission>();
  if (!role) return granted;
  for (const grant of role.permissions) {
    const permission = toPermission(grant.permissionKey);
    if (!permission) continue;
    if (!isPermissionAllowedIn(permission, scope)) continue;
    granted.add(permission);
  }
  return granted;
}

function grants(role: RoleWithGrants | null, permission: Permission): boolean {
  return role?.permissions.some((g) => g.permissionKey === permission) ?? false;
}

// ─── Resolution ────────────────────────────────────────────────────────────────

const EMPTY: Access = makeAccess(new Set(), {}, null, null);

/** What the workspace level yields — the foundation for both tenant contexts. */
interface Base {
  /** WORKSPACE keys only, from the workspace role only. */
  granted: Set<Permission>;
  roles: Partial<Record<RoleScope, ScopeRole>>;
  /** `tenant.access`: support master key, overrides all rules. */
  master: boolean;
  /** Workspace suspended or invitation still pending — the tenant yields nothing. */
  closed: boolean;
}

/**
 * Collect the workspace level.
 *
 * Both tenant contexts need this: the workspace context as its result, the
 * project context for the master keys and the lockout reasons. The platform
 * role is deliberately **not** collected here — within a tenant it only acts
 * through `tenant.access`. Its key and rank still appear in the result so the
 * UI can display them.
 */
async function loadBase(userId: string, workspaceId: string): Promise<Base> {
  let granted = new Set<Permission>();
  const roles: Partial<Record<RoleScope, ScopeRole>> = {};

  // ── Support access ─────────────────────────────────────────────────────────
  //
  // `tenant.access` is the master key into foreign workspaces. It can only
  // live on a platform role — tenant permissions aren't assignable in this
  // scope per the registry, so there's no finer-grained path. Whoever holds
  // it gets everything in the tenant and is exempt from the rules below:
  // support needs to be able to see in precisely when a workspace is
  // suspended or a project is private. `platform_admin` deliberately does
  // NOT have it.
  const platform = await loadPlatformState(userId);

  // Deactivated: nothing, and before anything else. Even the master key
  // below no longer applies for such an account.
  if (platform.deactivated)
    return { granted, roles, master: false, closed: true };

  const platformRole = platform.role;
  if (platformRole) {
    roles.PLATFORM = { key: platformRole.key, rank: platformRole.rank };
  }
  if (grants(platformRole, "tenant.access"))
    return { granted, roles, master: true, closed: false };

  // ── Suspended, or not yet accepted ────────────────────────────────────────
  //
  // This check happens BEFORE the workspace role is collected. Collecting
  // nothing here means there's nothing wrong to hold on to either.
  const [workspace, membership] = await Promise.all([
    loadWorkspaceMeta(workspaceId),
    loadWorkspaceRole(workspaceId, userId),
  ]);

  if (!workspace || workspace.suspended || membership?.pending)
    return { granted, roles, master: false, closed: true };

  // ── Scope WORKSPACE ─────────────────────────────────────────────────────────
  if (membership) {
    roles.WORKSPACE = { key: membership.role.key, rank: membership.role.rank };
    granted = collect(membership.role, "WORKSPACE");
  }

  return { granted, roles, master: false, closed: false };
}

/** Does the workspace role carry this master key? */
function opens(
  base: Base,
  key: "project.admin.all" | "project.view.all",
): boolean {
  return base.granted.has(key);
}

async function resolve(
  userId: string | null,
  ctx: PermissionContext,
): Promise<Access> {
  if (!userId) return EMPTY;

  // ── Context PLATFORM ────────────────────────────────────────────────────────
  if ("scope" in ctx) {
    const platform = await loadPlatformState(userId);
    if (platform.deactivated) return EMPTY;

    const roles: Partial<Record<RoleScope, ScopeRole>> = {};
    if (platform.role) {
      roles.PLATFORM = { key: platform.role.key, rank: platform.role.rank };
    }
    return makeAccess(collect(platform.role, "PLATFORM"), roles, null, null);
  }

  // ── Context WORKSPACE ───────────────────────────────────────────────────────
  if (!("projectId" in ctx)) {
    const base = await loadBase(userId, ctx.workspaceId);
    const granted = base.master
      ? new Set<Permission>(permissionsFor("WORKSPACE"))
      : base.granted;
    return makeAccess(granted, base.roles, ctx.workspaceId, null);
  }

  // ── Context PROJECT ─────────────────────────────────────────────────────────
  //
  // Four rules, in this order. The first three decide without consulting the
  // project role — so no project role can override them.
  const project = await loadProjectMeta(ctx.projectId);
  if (!project) return EMPTY;

  const base = await loadBase(userId, project.workspaceId);
  const where = [project.workspaceId, ctx.projectId] as const;

  // 1. Support sees into every project of every tenant.
  if (base.master)
    return makeAccess(new Set(permissionsFor("PROJECT")), base.roles, ...where);

  // 2. Suspended workspace or pending invitation: nothing.
  if (base.closed) return makeAccess(new Set(), base.roles, ...where);

  // 3. The workspace's master key. The project role is never even loaded —
  //    and `roles.PROJECT` stays empty so `assignmentCeiling` remains
  //    unbounded above. Otherwise an owner someone had set to `blocked`
  //    could no longer undo that demotion.
  if (opens(base, "project.admin.all"))
    return makeAccess(new Set(permissionsFor("PROJECT")), base.roles, ...where);

  // 4. Otherwise the project role decides alone. No row in `ProjectMember`
  //    means no project permissions — even for a public project and even for
  //    a workspace member.
  const projectRole = await loadProjectRole(ctx.projectId, userId);
  if (projectRole)
    base.roles.PROJECT = { key: projectRole.key, rank: projectRole.rank };

  const granted = collect(projectRole, "PROJECT");

  // The weaker master key: see yes, touch no. It's applied after the project
  // role but acts alongside it like the others — a `blocked` doesn't hide a
  // project from someone the workspace role allows to see everything.
  if (opens(base, "project.view.all")) granted.add("project.view");

  return makeAccess(granted, base.roles, ...where);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * All of a user's permissions in a context at once.
 *
 * For UIs that need many flags simultaneously, and for loops — one
 * resolution instead of one query per permission.
 */
export async function accessFor(
  userId: string | null,
  ctx: PermissionContext,
): Promise<Access> {
  return resolve(userId, ctx);
}

/** Like `accessFor`, but for the logged-in user. */
export async function getAccess(ctx: PermissionContext): Promise<Access> {
  return resolve(await currentUserId(), ctx);
}

/** Does `userId` have this permission in the given context? Does not throw. */
export async function can<P extends Permission>(
  userId: string,
  permission: P,
  ctx: ContextFor<P>,
): Promise<boolean> {
  const access = await resolve(userId, ctx as PermissionContext);
  return access.has(permission);
}

/** Does the logged-in user have this permission? Does not throw (false with no session). */
export async function hasPermission<P extends Permission>(
  permission: P,
  ctx: ContextFor<P>,
): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  return can(userId, permission, ctx);
}

export interface PermissionCheck<P extends Permission = Permission> {
  permission: P;
  ctx: ContextFor<P>;
  /**
   * For `.own` permissions: list of owner ids (e.g. [reporterId, assigneeId]).
   * The check only applies if the current user is in this list.
   */
  ownerIds?: (string | null | undefined)[];
}

/**
 * Satisfied if at least one of the checks matches (for `.own`/`.any` pairs).
 * Throws `PermissionError`, otherwise returns the user id.
 *
 * The mapped type over the tuple keeps each entry checked individually:
 * TypeScript derives the permissions from the `permission` fields and
 * requires the matching context for each.
 */
export async function requirePermissionOr<T extends readonly Permission[]>(
  checks: { [K in keyof T]: PermissionCheck<T[K] & Permission> },
): Promise<string> {
  const userId = await requireUserId();
  for (const check of checks as readonly PermissionCheck[]) {
    if (check.ownerIds && !check.ownerIds.includes(userId)) continue;
    if (await can(userId, check.permission, check.ctx as never)) return userId;
  }
  const first = (checks as readonly PermissionCheck[])[0];
  throw new PermissionError(first?.permission ?? "unknown");
}

/** Requires a single permission. Throws `PermissionError`, otherwise returns the user id. */
export async function requirePermission<P extends Permission>(
  permission: P,
  ctx: ContextFor<P>,
): Promise<string> {
  const userId = await requireUserId();
  if (await can(userId, permission, ctx)) return userId;
  throw new PermissionError(permission);
}

// ─── Tenant entry ────────────────────────────────────────────────────────────

/**
 * Is someone allowed to enter the workspace at all?
 *
 * There's no permission key for this: entry belongs to whoever belongs.
 * Three paths lead in, and none of them is a permission —
 *
 *   1. `tenant.access` (support master key),
 *   2. an accepted membership in the workspace,
 *   3. a project membership without being in the workspace (project guest).
 *
 * Path 3 is why a plain `WorkspaceMember` query isn't enough here: a guest is
 * explicitly invited to exactly one project and would otherwise be locked
 * out of the shell that project lives in.
 *
 * A pending invitation doesn't count: `loadBase` grants such a row no
 * permissions, so the pages would be empty anyway.
 */
export const canEnterWorkspace = cache(
  async (userId: string | null, workspaceId: string): Promise<boolean> => {
    if (!userId) return false;
    const base = await loadBase(userId, workspaceId);
    if (base.master) return true;
    if (base.closed) return false;
    if (base.roles.WORKSPACE) return true;
    return inAnyProject(userId, workspaceId);
  },
);

/** Like `canEnterWorkspace`, but for the logged-in user. */
export async function currentUserCanEnterWorkspace(
  workspaceId: string,
): Promise<boolean> {
  return canEnterWorkspace(await currentUserId(), workspaceId);
}

// ─── Rank hierarchy ──────────────────────────────────────────────────────────

/**
 * Up to which rank someone may assign roles of a scope.
 *
 * The basic rule stays "at most one's own role". But ranks are only
 * comparable within a single scope — a workspace owner (rank 6) and a
 * project admin (rank 4) have no shared ordering. Whoever holds no role at
 * all in the relevant scope derives their authority from the scope above and
 * is thus unbounded above: a workspace admin without their own project role
 * may assign any project role.
 */
export function assignmentCeiling(access: Access, scope: RoleScope): number {
  return access.roleKey(scope) === null
    ? Number.POSITIVE_INFINITY
    : access.rank(scope);
}

// ─── Bulk: visible projects ─────────────────────────────────────────────────

/**
 * The projects of a workspace that `userId` is allowed to see.
 *
 * The bulk variant of `can(…, "project.view", { projectId })`: lists and
 * navigation would otherwise need one resolution per project. The master
 * keys apply equally to all projects and are resolved once; otherwise the
 * project role decides per project — the same four rules as in `resolve`,
 * just across all projects at once.
 */
export const accessibleProjectIds = cache(async function accessibleProjectIds(
  userId: string | null,
  workspaceId: string,
): Promise<Set<string>> {
  const visible = new Set<string>();
  if (!userId) return visible;

  const [base, projects, memberships] = await Promise.all([
    loadBase(userId, workspaceId),
    db.project.findMany({ where: { workspaceId }, select: { id: true } }),
    db.projectMember.findMany({
      where: { userId, project: { workspaceId } },
      select: { projectId: true, role: { select: roleSelect } },
    }),
  ]);

  // Rules 1 and 3: support and the workspace's leadership see every project,
  // even without a role in it.
  if (
    base.master ||
    opens(base, "project.admin.all") ||
    opens(base, "project.view.all")
  ) {
    for (const project of projects) visible.add(project.id);
    return visible;
  }
  // Rule 2.
  if (base.closed) return visible;

  const ownRole = new Map(memberships.map((m) => [m.projectId, m.role]));

  // Rule 4: no project role means no access — `ProjectMember` is the list of
  // who's in the project.
  for (const project of projects) {
    const role = ownRole.get(project.id);
    if (!role) continue;
    if (collect(role, "PROJECT").has("project.view")) visible.add(project.id);
  }

  return visible;
});

/**
 * The projects of a workspace in which `userId` holds `permission`.
 *
 * The bulk variant of `can(userId, permission, { projectId })`, for a list that would otherwise
 * need one resolution per project (which projects' plugins someone may set up). The same rules as
 * in `resolve`, across all projects at once: support and `project.admin.all` hold everything in
 * every project, a suspended workspace or a pending invitation nothing, and otherwise the project
 * role decides alone. `project.view.all` opens no other permission than seeing, so it counts only
 * for `project.view`, as it does in `resolve`.
 */
export const projectIdsWith = cache(async function projectIdsWith(
  userId: string | null,
  workspaceId: string,
  permission: Permission,
): Promise<Set<string>> {
  const found = new Set<string>();
  // A permission that cannot hold in a project is held in none, whoever asks.
  if (!userId || !isPermissionAllowedIn(permission, "PROJECT")) return found;

  const [base, projects, memberships] = await Promise.all([
    loadBase(userId, workspaceId),
    db.project.findMany({ where: { workspaceId }, select: { id: true } }),
    db.projectMember.findMany({
      where: { userId, project: { workspaceId } },
      select: { projectId: true, role: { select: roleSelect } },
    }),
  ]);

  // Rules 1 and 3: support and the workspace's leadership hold every project permission.
  if (
    base.master ||
    opens(base, "project.admin.all") ||
    (permission === "project.view" && opens(base, "project.view.all"))
  ) {
    for (const project of projects) found.add(project.id);
    return found;
  }
  // Rule 2.
  if (base.closed) return found;

  const ownRole = new Map(memberships.map((m) => [m.projectId, m.role]));

  // Rule 4: the project role decides, and no role means no permission.
  for (const project of projects) {
    const role = ownRole.get(project.id);
    if (role && collect(role, "PROJECT").has(permission)) found.add(project.id);
  }

  return found;
});

/** Like `accessibleProjectIds`, but for the logged-in user. */
export async function visibleProjectIds(
  workspaceId: string,
): Promise<Set<string>> {
  return accessibleProjectIds(await currentUserId(), workspaceId);
}
