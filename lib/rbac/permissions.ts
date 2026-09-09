// ─── RBAC: permission registry ────────────────────────────────────────────────
//
// Pure data definition — no DB access, no `server-only`, no Prisma imports.
// This file is imported by the runtime (lib/permissions.ts), by the seed
// (prisma/seed.ts), by provisioning (lib/rbac-provision.ts), and by the
// tests.
//
// A permission key names **object and action** — not the level. Where a
// permission takes effect is decided by the scope of the role that carries
// it:
//
//   label.create on a workspace role → labels across the whole workspace
//   label.create on a project role   → labels in that project
//
// That's why each permission records the scopes it may be granted in.
// `workspace.delete` on a project role would be meaningless and is blocked.
//
// This list also marks the boundary between the levels. Each context
// resolves **exactly one** role (`lib/permissions.ts`), and `collect()` only
// takes from it what the `scopes` field actually allows it to carry. A
// permission not enabled here for a scope therefore cannot take effect
// there — even if a stale row in `RolePermission` claims otherwise.
//
// Two keys deliberately cross that boundary, and only these two. They're the
// master keys with which one level unlocks the level below:
//
//   tenant.access      (PLATFORM)   → everything in every workspace and project
//   project.admin.all  (WORKSPACE)  → everything in every project of the workspace
//   project.view.all   (WORKSPACE)  → read access to every project of the workspace
//
// They're checked in the resolver before role resolution. That's exactly
// what backs the guarantee that a workspace's leadership can't be locked out
// of any of its projects: a project role is never even loaded for them.

/** The three scopes in which roles exist. */
export type RoleScope = "PLATFORM" | "WORKSPACE" | "PROJECT";

export const ROLE_SCOPES = [
  "PLATFORM",
  "WORKSPACE",
  "PROJECT",
] as const satisfies readonly RoleScope[];

interface PermissionDef {
  desc: string;
  /** Scopes in which this permission may be granted. */
  scopes: readonly RoleScope[];
}

const PLATFORM_ONLY = ["PLATFORM"] as const;
const WORKSPACE_ONLY = ["WORKSPACE"] as const;
const PROJECT_ONLY = ["PROJECT"] as const;
/**
 * For objects that genuinely exist at both levels: a workspace-wide label and
 * a project label, a workspace member and a project member. The key is the
 * same; which object is meant depends on which role carries it.
 *
 * This is not shorthand for "also applies in the project". Whatever exists
 * only in the project — issues, comments, the project itself — is
 * `PROJECT_ONLY`; otherwise a workspace role could reach past that boundary
 * and govern every project.
 */
const WORKSPACE_AND_PROJECT = ["WORKSPACE", "PROJECT"] as const;

export const PERMISSIONS = {
  // ── Platform ───────────────────────────────────────────────────────────────
  "platform.access": {
    desc: "Access the platform area (/admin)",
    scopes: PLATFORM_ONLY,
  },
  "user.manage": {
    desc: "Manage user accounts platform-wide: set platform role, deactivate accounts",
    scopes: PLATFORM_ONLY,
  },
  "tenant.access": {
    desc: "View and edit the content of every workspace (support access)",
    scopes: PLATFORM_ONLY,
  },
  "workspace.suspend": {
    desc: "Suspend and unsuspend workspaces",
    scopes: PLATFORM_ONLY,
  },
  "mail.template.manage": {
    desc: "Edit the subject, heading, and intro text of the mail templates",
    scopes: PLATFORM_ONLY,
  },

  // ── Platform: core data and break-glass ─────────────────────────────────────
  //
  // These two separate what a platform admin panel would otherwise conflate:
  // *that* a project exists, and *what's* in it.
  //
  // `project.metadata.view` shows the shell of every project — name,
  // workspace, creator, age, state — including private ones. That's exactly
  // what's needed to reassign orphaned projects and attribute costs.
  // Content is explicitly excluded: `features/admin/queries.ts` reads no
  // issues, no comments, no attachments.
  //
  // `project.breakglass` is the way in when it has to happen — and the only
  // one. It never enrolls anyone into a project covertly: it creates an
  // ordinary membership, requires a justification, and writes both to the
  // log (`features/admin/actions.ts`). Afterward, the platform's leadership
  // appears in the project's member list like anyone else — visible to
  // everyone working there.
  "project.metadata.view": {
    desc: "View the master data of every project, including private ones — without their content",
    scopes: PLATFORM_ONLY,
  },
  "project.metadata.manage": {
    desc: "Change a project's master data: reassign owner, archive it — still without seeing inside",
    scopes: PLATFORM_ONLY,
  },
  "project.breakglass": {
    desc: "Emergency access: add yourself to a foreign project with a justification (gets logged)",
    scopes: PLATFORM_ONLY,
  },

  // ── Workspace ────────────────────────────────────────────────────────────────
  "workspace.update": {
    desc: "Change the workspace's name, color, and slug",
    scopes: WORKSPACE_ONLY,
  },
  "workspace.delete": {
    desc: "Delete the workspace irrevocably",
    scopes: ["PLATFORM", "WORKSPACE"],
  },
  "config.manage": {
    desc: "Manage statuses, priorities, and issue types",
    scopes: WORKSPACE_ONLY,
  },
  "webhook.manage": {
    desc: "Create, edit, and delete the workspace's webhooks",
    scopes: WORKSPACE_ONLY,
  },
  // The same key in all three scopes, three slices of the same log: the
  // whole thing on the platform, only what happened there in the workspace,
  // only what happened there in the project. The permission doesn't set the
  // slice — the query does (`lib/audit/index.ts`).
  "audit.view": {
    desc: "View the audit log",
    scopes: ["PLATFORM", "WORKSPACE", "PROJECT"],
  },

  // ── Roles ───────────────────────────────────────────────────────────────────
  "role.manage": {
    desc: "Define roles of this scope and assign permissions",
    scopes: ROLE_SCOPES,
  },

  // ── Members ─────────────────────────────────────────────────────────────────
  // The same three permissions in both scopes: in the workspace they apply
  // to its members, in the project to that project's members.
  //
  // `member.view` is deliberately WORKSPACE only: it alone decides whether
  // the "Members" tab appears (`lib/nav.ts`, `getWorkspaceMembersView`). The
  // project member list doesn't depend on it — there's (still) no dedicated
  // gate for that.
  "member.view": {
    desc: "View the workspace's member list",
    scopes: WORKSPACE_ONLY,
  },
  "member.invite": {
    desc: "Add and invite members",
    scopes: WORKSPACE_AND_PROJECT,
  },
  "member.remove": {
    desc: "Remove members",
    scopes: WORKSPACE_AND_PROJECT,
  },
  "member.role.update": {
    desc: "Change another member's role",
    scopes: WORKSPACE_AND_PROJECT,
  },

  // ── Projects ────────────────────────────────────────────────────────────────
  "project.create": {
    desc: "Create a new project in the workspace",
    scopes: WORKSPACE_ONLY,
  },
  "project.view": {
    desc: "See the project (relevant for private projects)",
    scopes: PROJECT_ONLY,
  },
  "project.view.all": {
    desc: "See every project of the workspace read-only, even without membership",
    scopes: WORKSPACE_ONLY,
  },
  "project.admin.all": {
    desc: "Have every permission in every project of the workspace without being a member",
    scopes: WORKSPACE_ONLY,
  },
  "project.update": {
    desc: "Change the project name, prefix, and color",
    scopes: PROJECT_ONLY,
  },
  "project.delete": {
    desc: "Delete the project",
    scopes: PROJECT_ONLY,
  },

  // ── Dashboard ───────────────────────────────────────────────────────────────
  //
  // Without this permission, a person sees only what relates to them on the
  // dashboard (their assigned issues) — not a hidden gate, but filtered
  // rather than blocked numbers, see `getProjectDashboard` /
  // `getWorkspaceDashboard`.
  "dashboard.view.all": {
    desc: "Sees the dashboard numbers of the whole project/workspace, not just their own",
    scopes: WORKSPACE_AND_PROJECT,
  },

  // ── Teams ───────────────────────────────────────────────────────────────────
  //
  // Without this permission, you only see the teams you're a member of
  // yourself (`getWorkspaceTeamsView`) — not a hidden gate, but a filtered
  // rather than empty list, unlike `member.view` for the members tab.
  "team.view.all": {
    desc: "See every team of the workspace, not just your own",
    scopes: WORKSPACE_ONLY,
  },
  "team.create": { desc: "Create a team", scopes: WORKSPACE_ONLY },
  "team.update": {
    desc: "Change a team's name, color, and lead",
    scopes: WORKSPACE_ONLY,
  },
  "team.delete": { desc: "Delete a team", scopes: WORKSPACE_ONLY },
  "team.member.manage": {
    desc: "Add or remove members from teams",
    scopes: WORKSPACE_ONLY,
  },
  "team.project.manage": {
    desc: "Link or unlink projects to teams",
    scopes: WORKSPACE_ONLY,
  },

  // ── Labels ──────────────────────────────────────────────────────────────────
  "label.create": { desc: "Create a label", scopes: WORKSPACE_AND_PROJECT },
  "label.update": { desc: "Edit a label", scopes: WORKSPACE_AND_PROJECT },
  "label.delete": { desc: "Delete a label", scopes: WORKSPACE_AND_PROJECT },

  // ── Issues ──────────────────────────────────────────────────────────────────
  //
  // An issue always lives in a project — there's no workspace-wide issue.
  // Setting status and priority is covered by `issue.update.*`; which
  // statuses and priorities exist at all is governed by `config.manage` in
  // the workspace.
  "issue.create": { desc: "Create an issue", scopes: PROJECT_ONLY },
  "issue.update.any": {
    desc: "Edit any issue (status, priority, labels, text)",
    scopes: PROJECT_ONLY,
  },
  "issue.update.own": {
    desc: "Edit only your own issues (reporter or assignee)",
    scopes: PROJECT_ONLY,
  },
  "issue.delete.any": {
    desc: "Delete any issue",
    scopes: PROJECT_ONLY,
  },
  "issue.delete.own": {
    desc: "Delete only your own issues",
    scopes: PROJECT_ONLY,
  },
  "issue.assign": {
    desc: "Assign issues to other members",
    scopes: PROJECT_ONLY,
  },
  "issue.share.manage": {
    desc: "Create and revoke the public read link for an issue",
    scopes: PROJECT_ONLY,
  },

  // ── Comments ────────────────────────────────────────────────────────────────
  "comment.create": {
    desc: "Write a comment on an issue",
    scopes: PROJECT_ONLY,
  },
  "comment.delete.any": {
    desc: "Delete any comment",
    scopes: PROJECT_ONLY,
  },
  "comment.delete.own": {
    desc: "Delete only your own comments",
    scopes: PROJECT_ONLY,
  },
  "comment.update.any": {
    desc: "Edit any comment",
    scopes: PROJECT_ONLY,
  },
  "comment.update.own": {
    desc: "Edit only your own comments",
    scopes: PROJECT_ONLY,
  },
  "comment.react": {
    desc: "React to comments",
    scopes: PROJECT_ONLY,
  },
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Human-readable description of a permission. */
export function permissionDesc(permission: Permission): string {
  return PERMISSIONS[permission].desc;
}

/** May a role of this scope carry the permission? */
export function isPermissionAllowedIn(
  permission: Permission,
  scope: RoleScope,
): boolean {
  return (PERMISSIONS[permission].scopes as readonly RoleScope[]).includes(
    scope,
  );
}

/** All permissions that a role of this scope may carry. */
export function permissionsFor(scope: RoleScope): Permission[] {
  return ALL_PERMISSIONS.filter((p) => isPermissionAllowedIn(p, scope));
}

/** Narrows an arbitrary (DB) string to the `Permission` union. */
export function toPermission(value: string): Permission | null {
  return value in PERMISSIONS ? (value as Permission) : null;
}

/** Narrows an arbitrary (DB) string to the `RoleScope` union. */
export function toRoleScope(value: string): RoleScope | null {
  return (ROLE_SCOPES as readonly string[]).includes(value)
    ? (value as RoleScope)
    : null;
}
