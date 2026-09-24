// ─── RBAC: system roles ────────────────────────────────────────────────────────
//
// The default roles exist **exactly once each** in the database — with no
// binding to a workspace or a project. All tenants point at the same rows.
// This keeps the database free of copies and makes a change to a default
// role take effect everywhere at once.
//
// The deliberate cost: a system role isn't editable. Anyone who needs
// "Member, but without labels" creates a new role in their own workspace
// (`role.manage`) — that one then belongs to the workspace or the project.
//
// `scope` says where a role may be granted; `rank` models the hierarchy
// within a scope and drives the "at most your own role can be assigned"
// rule.
//
// Each context resolves exactly one role: the project role in a project, the
// workspace role in a workspace, the platform role on the platform. That's
// why a workspace role no longer carries any issue or comment permissions —
// the registry simply doesn't allow that in scope WORKSPACE. Whoever needs
// to reach into their workspace's projects gets `project.admin.all` for
// that. The evaluation lives in `lib/permissions.ts`.
//
// A role only ever lists what it allows. There's no opposite: since each
// context resolves exactly one role, "not listed" already is the denial.

import { type Permission, permissionsFor, type RoleScope } from "./permissions";

export interface SystemRole {
  key: string;
  scope: RoleScope;
  name: string;
  desc: string;
  rank: number;
  allow: Permission[];
  /**
   * Workspace roles only: the project role that a holder of this role is
   * enrolled with when joining a project of the workspace.
   *
   * Since the levels were separated, this can no longer be derived from the
   * workspace permissions — those no longer say anything about issues or
   * comments. So it's stated explicitly here instead of being guessed
   * (`lib/project-membership.ts`).
   */
  defaultProjectRoleKey?: string;
}

const PLATFORM_PERMS = permissionsFor("PLATFORM");
const WORKSPACE_PERMS = permissionsFor("WORKSPACE");
const PROJECT_PERMS = permissionsFor("PROJECT");

const READ_AND_COMMENT: Permission[] = [
  "project.view",
  "comment.create",
  "comment.delete.own",
  "comment.update.own",
  "comment.react",
];

const CONTRIBUTE: Permission[] = [
  "project.view",
  "issue.create",
  "issue.update.own",
  "issue.delete.own",
  "issue.assign",
  "issue.share.manage",
  "comment.create",
  "comment.delete.own",
  "comment.update.own",
  "comment.react",
  "label.create",
  "label.update",
];

// ─── Scope PLATFORM ───────────────────────────────────────────────────────────
//
// Sits above all workspaces (SaaS operator). Access to tenant content hinges
// solely on `tenant.access` — `platform_admin` deliberately does NOT have
// it. Whoever needs to see other tenants' issues gets `platform_support`
// explicitly instead.

const PLATFORM_ROLES: SystemRole[] = [
  {
    key: "platform_admin",
    scope: "PLATFORM",
    name: "Platform Admin",
    desc: "Manages the platform: user accounts, workspaces, global roles. No access to workspace content.",
    rank: 2,
    allow: PLATFORM_PERMS.filter((p) => p !== "tenant.access"),
  },
  {
    key: "platform_support",
    scope: "PLATFORM",
    name: "Platform Support",
    desc: "May view and act inside every workspace for troubleshooting. No management of accounts or roles.",
    rank: 1,
    allow: ["platform.access", "tenant.access"],
  },
  {
    key: "platform_member",
    scope: "PLATFORM",
    name: "Platform Member",
    desc: "Normal user with no platform permissions. The default for every new account.",
    rank: 0,
    allow: [],
  },
];

// ─── Scope WORKSPACE ──────────────────────────────────────────────────────────
//
// These roles carry **only** workspace permissions: the workspace itself,
// its configuration, teams, workspace-wide labels, members, and roles. They
// say nothing about a project's content — that's what the project role is
// for.
//
// The exception is the two master keys. `project.admin.all` grants full
// permissions in every project, `project.view.all` only read access. They're
// the way to keep a workspace's leadership capable of acting in its
// projects without softening the separation of levels — and they're
// independent of whether someone is enrolled in the project.
//
// `defaultProjectRoleKey` says which project role a holder of this role is
// enrolled with when joining a project. For holders of a master key, this is
// now just cosmetic in the member list; their permissions don't depend on
// it.

const WORKSPACE_ROLES: SystemRole[] = [
  {
    key: "owner",
    scope: "WORKSPACE",
    name: "Owner",
    desc: "The workspace's creator. The only one with the right to delete the workspace. Has every permission in every project.",
    rank: 6,
    allow: WORKSPACE_PERMS,
    defaultProjectRoleKey: "project_admin",
  },
  {
    key: "admin",
    scope: "WORKSPACE",
    name: "Admin",
    desc: "Full access. Manages roles and permissions and has every permission in every project, but can't delete the workspace.",
    rank: 5,
    allow: WORKSPACE_PERMS.filter((p) => p !== "workspace.delete"),
    defaultProjectRoleKey: "project_admin",
  },
  {
    key: "manager",
    scope: "WORKSPACE",
    name: "Manager",
    desc: "Manages settings, members, teams, and configuration. No role management, no plugins, no reach-through into the projects.",
    rank: 4,
    // No `plugin.enable`: switching on a plugin lets its code work with the
    // workspace's data, which is the leadership's call, not configuration.
    allow: WORKSPACE_PERMS.filter(
      (p) =>
        p !== "workspace.delete" &&
        p !== "role.manage" &&
        p !== "plugin.enable" &&
        p !== "project.view.all" &&
        p !== "project.admin.all",
    ),
    defaultProjectRoleKey: "project_admin",
  },
  {
    key: "project_lead",
    scope: "WORKSPACE",
    name: "Project Lead",
    desc: "Full access to every project of the workspace, including their members and content. No workspace administration.",
    rank: 3,
    allow: [
      "project.create",
      "project.view.all",
      "project.admin.all",
      "dashboard.view.all",
      "member.view",
      "member.invite",
      "member.remove",
      "member.role.update",
      "label.create",
      "label.update",
      "label.delete",
    ],
    defaultProjectRoleKey: "project_admin",
  },
  {
    key: "member",
    scope: "WORKSPACE",
    name: "Member",
    desc: "The default role. Creates workspace-wide labels; what it may do in a project is decided by the project role there.",
    rank: 2,
    allow: ["label.create", "label.update"],
    defaultProjectRoleKey: "contributor",
  },
  {
    key: "viewer",
    scope: "WORKSPACE",
    name: "Viewer",
    desc: "Read access to the workspace. Enrolled as a reader in projects.",
    rank: 1,
    allow: [],
    defaultProjectRoleKey: "project_viewer",
  },
  {
    key: "guest",
    scope: "WORKSPACE",
    name: "Guest",
    desc: "Joined from outside. Sees only what they were explicitly invited to.",
    rank: 0,
    allow: [],
    defaultProjectRoleKey: "project_viewer",
  },
];

// ─── Scope PROJECT ────────────────────────────────────────────────────────────
//
// These roles are the whole truth within the project: whatever isn't listed
// here doesn't apply there. A newly introduced project permission is thus
// automatically blocked, without anyone having to maintain a deny list.
//
// They're powerless only against the workspace's master keys: whoever
// carries `project.admin.all` isn't shut out by `blocked`. That's
// deliberate — otherwise a project admin could lock the workspace's
// leadership out of their own project, and no one could reach member
// management anymore.

const PROJECT_ROLES: SystemRole[] = [
  {
    key: "project_admin",
    scope: "PROJECT",
    name: "Project Admin",
    desc: "Full access to this project, including settings, members, and project-owned roles.",
    rank: 4,
    allow: PROJECT_PERMS,
  },
  {
    key: "contributor",
    scope: "PROJECT",
    name: "Contributor",
    desc: "Works in the project: creates issues, edits their own, comments.",
    rank: 3,
    allow: CONTRIBUTE,
  },
  {
    key: "project_viewer",
    scope: "PROJECT",
    name: "Viewer",
    desc: "Reads along and comments. Everything else that writes is locked in this project.",
    rank: 2,
    allow: READ_AND_COMMENT,
  },
  {
    key: "project_guest",
    scope: "PROJECT",
    name: "Guest",
    desc: "Invited from outside to exactly this project. Same permissions as a viewer, without workspace membership.",
    rank: 1,
    allow: READ_AND_COMMENT,
  },
  {
    key: "blocked",
    scope: "PROJECT",
    name: "Blocked",
    desc: "Explicit exclusion from this project. Has no effect against the workspace's leadership (project.admin.all).",
    rank: 0,
    allow: [],
  },
];

/** All system roles across all scopes — exactly these rows live in the database. */
export const SYSTEM_ROLES: SystemRole[] = [
  ...PLATFORM_ROLES,
  ...WORKSPACE_ROLES,
  ...PROJECT_ROLES,
];

/** The system roles of a scope. */
export function systemRolesIn(scope: RoleScope): SystemRole[] {
  return SYSTEM_ROLES.filter((r) => r.scope === scope);
}

/**
 * The project role that a system workspace role is enrolled with when
 * joining a project — or null for a custom role, which naturally isn't
 * listed here.
 */
export function defaultProjectRoleKeyOf(
  workspaceRoleKey: string,
): string | null {
  const role = SYSTEM_ROLES.find(
    (r) => r.scope === "WORKSPACE" && r.key === workspaceRoleKey,
  );
  return role?.defaultProjectRoleKey ?? null;
}

/** Role that every new account gets. */
export const DEFAULT_PLATFORM_ROLE_KEY = "platform_member";
/** Manages the platform — core data and suspension of every workspace, no content access. */
export const PLATFORM_ADMIN_ROLE_KEY = "platform_admin";
/** Carries `tenant.access` — support reach-through into every workspace. */
export const PLATFORM_SUPPORT_ROLE_KEY = "platform_support";
/** Role that the creator of a workspace gets. */
export const OWNER_ROLE_KEY = "owner";
/** Workspace role for freshly invited members, unless something else is chosen. */
export const DEFAULT_WORKSPACE_ROLE_KEY = "member";
/** Read access to the workspace, without contributing. */
export const WORKSPACE_VIEWER_ROLE_KEY = "viewer";
/** Joined the workspace from outside. */
export const WORKSPACE_GUEST_ROLE_KEY = "guest";
/** Default choice when joining a project. */
export const DEFAULT_PROJECT_ROLE_KEY = "contributor";
/** Project role for guests without workspace membership. */
export const PROJECT_GUEST_ROLE_KEY = "project_guest";
/** Full control over a project. */
export const PROJECT_ADMIN_ROLE_KEY = "project_admin";
/** Read and comment, nothing else. */
export const PROJECT_VIEWER_ROLE_KEY = "project_viewer";
/** Explicit exclusion from a project. */
export const PROJECT_BLOCKED_ROLE_KEY = "blocked";

/**
 * Color of the role dot in the UI.
 *
 * Derived from the rank instead of from a table per key: this way even
 * custom roles get a color matching their level of power, without anyone
 * having to maintain it.
 */
export function roleColor(rank: number): string {
  if (rank >= 5) return "var(--purple)"; // Owner, Admin — full administration
  if (rank >= 3) return "var(--blue)"; // Manager, Project Lead
  if (rank === 2) return "var(--green)"; // the common case
  if (rank <= 0) return "var(--amber)"; // Guest, Blocked — from outside or locked out
  return "var(--outline)";
}
