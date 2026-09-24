# RBAC — Roles & Permissions

Role-Based Access Control across three scopes. Permissions are the atomic
unit, roles are bundles of permissions, and every scope can have its own
custom roles.

---

## The model in five sentences

1. A role has a **scope**: `PLATFORM`, `WORKSPACE`, or `PROJECT`.
2. A **permission key names only the object and the action** (`issue.create`,
   `label.update`). Where it takes effect is decided by the scope of the role
   carrying it.
3. The **default roles live exactly once in the database** and belong to
   nobody. All tenants point at the same rows. Custom roles hang off a
   workspace or a project.
4. A user has **at most one role per scope** — so up to three. Whichever
   level is at hand is the one asked: **inside a project, the project role
   decides; inside a workspace, the workspace role decides.**
5. On top of that sit three implicit rules plus the support master key, all
   in exactly one place: `lib/permissions.ts`.

```
Workspace context:  Platform ∪ Workspace
Project context:    Platform ∪ Workspace(minus project-scoped permissions) ∪ project role

allowed = ALLOW(applicable levels) \ ⋃ DENY(all levels)
```

Inside a project, the project role therefore **replaces** the workspace
role's project-related permissions instead of adding to them. No row in
`ProjectMember` means no project permissions. What only applies
workspace-wide (`project.create`, `project.view.all`, `team.*`, …) stays
untouched — a project role can't carry those keys at all, per the registry.

A DENY, on the other hand, cuts across every level: a project role can't
override a workspace-wide prohibition, or the prohibition would be
meaningless.

### Why the key no longer names its level

There used to be `workspace.label.create` **and** `project.label.create` —
two keys for the same operation, distinguished only by scope. Now there's
just `label.create`, and its scope follows from which role it's attached to:

```
label.create on a workspace role → labels across the whole workspace
label.create on a project role   → labels within this project
```

For every permission, the registry states which scopes it may even be
granted in. `workspace.update` on a project role would be meaningless and is
blocked; `role.manage`, by contrast, applies in all three scopes and means
"the roles of this bucket" in each of them.

### So why still have DENY?

Replacement inside a project already handles the downgrade — a project role
that doesn't list `issue.update.any` doesn't grant it in that project either:

```
Workspace role project_lead    ALLOW issue.update.any
Project role    project_viewer (doesn't list it)
→ read-only in this project, full access everywhere else
```

DENY is left for what replacement can't do: **a prohibition reaching
upward.** It applies across every level, and so it also hits purely
workspace-wide permissions that a project role otherwise can't touch at all.

That `project_viewer`, `project_guest`, and `blocked` still deny
**exhaustively** anyway is a leftover from the earlier union model. It stays
because it states the intent explicitly and automatically blocks a
newly-introduced permission for these roles — it's no longer needed for the
downgrade itself, though.

---

## Shared default roles

The 15 system roles exist **once each**, with no owner:

```
15 roles · 212 RolePermission rows — total, across all tenants
```

Previously, every workspace got its own copy: 12 roles and 214 grants **per
workspace** — with just two workspaces, that's already 428 rows for only 214
distinct pieces of content. Now the count is independent of the number of
workspaces, and a fix to `member` takes effect everywhere at once instead of
only in new workspaces.

**The cost:** a system role isn't editable — changing it would affect every
tenant. Anyone who needs "Member, but without labels" creates a new role in
their own workspace. In the role editor, the shared roles show up marked
*Shared*, with a locked matrix, so it stays clear what they grant.

| `system` | `scope` | `workspaceId` | `projectId` | Meaning |
|---|---|---|---|---|
| `true` | (any) | `NULL` | `NULL` | default role, applies to everyone |
| `false` | `PLATFORM` | `NULL` | `NULL` | custom platform role |
| `false` | `WORKSPACE` | set | `NULL` | custom role of this workspace |
| `false` | `PROJECT` | set | `NULL` | custom role, in **all** projects of the workspace |
| `false` | `PROJECT` | set | set | custom role, only in this project |

A `CHECK` constraint enforces this table instead of merely documenting it.

---

## The three scopes

### PLATFORM

`User.platformRoleId` → `Role` with `scope = PLATFORM`. Governs platform
operations (`/admin`, accounts, suspending workspaces).

| Role | Rank | Content |
|---|:---:|---|
| `platform_admin` | 2 | every platform permission **except** `tenant.access` |
| `platform_support` | 1 | `platform.access` + `tenant.access` |
| `platform_member` | 0 | none — default for every account |

**`tenant.access` is the master key** into other people's workspaces. It can
only live on a platform role: tenant permissions aren't grantable at this
scope per the registry, so there's no finer-grained way. Whoever has it gets
everything within the tenant and is exempt from the implicit rules —
precisely because support needs to be able to see into a suspended
workspace or a private project. `platform_admin` deliberately does **not**
have it; access to other tenants' data is thus a visible escalation, not a
side effect of being an admin.

### WORKSPACE

`WorkspaceMember.roleId` → `Role` with `scope = WORKSPACE`.

| Role | Rank | Summary |
|---|:---:|---|
| `owner` | 6 | everything; the only one with `workspace.delete` |
| `admin` | 5 | everything except `workspace.delete` |
| `manager` | 4 | without `role.manage`, `plugin.enable`, `project.view.all` |
| `project_lead` | 3 | full project permissions, no workspace administration |
| `member` | 2 | own issues, commenting, labels |
| `viewer` | 1 | read and comment |
| `guest` | 0 | same as viewer |

Workspace roles may carry project-related permissions — those apply in
**all** projects of the workspace where the person doesn't have their own
project role. Once they do, that role decides instead.

### PROJECT

`ProjectMember.roleId` → `Role` with `scope = PROJECT`.

| Role | Rank | ALLOW | DENY |
|---|:---:|---|---|
| `project_admin` | 4 | everything in its scope | — |
| `contributor` | 3 | create, edit own, comment, labels | — |
| `project_viewer` | 2 | read + comment | everything else |
| `project_guest` | 1 | read + comment | everything else |
| `blocked` | 0 | — | **everything** |

---

## The implicit rules

They live in `resolve()` in `lib/permissions.ts` — not scattered across the
Server Actions.

1. **Suspended workspace** (`Workspace.suspended`) → no tenant permissions.
2. **Open invitation** (`WorkspaceMember.pending`) → the same.
3. **Project without your own `ProjectMember` row** → every project-related
   permission drops away, unless the permission set includes
   `project.view.all`.

Rule 3 applies to **every** project, not just private ones: `ProjectMember`
is the list of who's in the project, and the resolver doesn't even read
`Project.visibility`. Visibility only decides who gets added automatically
on creation (`lib/project-membership.ts`).

The exception replaces the formerly hard-coded full access for owner and
admin: instead of `role === "owner" || role === "admin"` in the code, the
permission `project.view.all` lives on the role. No role names appear in
the code anymore.

> **Rules 1 and 2 take effect before the tenant roles are collected** — not
> afterward. Filtering after the fact would be wrong: some permissions are
> grantable in several scopes (`workspace.delete`, for instance, also at the
> platform level), and once they've been merged, their origin is no longer
> distinguishable. Whoever collects nothing also can't retain anything wrong.
> `resolver.test.ts` locks this in.

---

## Rank hierarchy

`Role.rank` represents the hierarchy. Basic rule: **nobody assigns a role
above their own, and nobody touches anyone above them.**

Ranks are only comparable **within one scope** — a workspace owner (rank 6)
and a project admin (rank 4) have no shared ordering. Whoever holds no role
at all in the scope in question derives their authority from the scope above
and is unbounded upward. `assignmentCeiling()` handles that:

```ts
assignmentCeiling(access, "PROJECT")
// own project role → its rank
// no project role   → Infinity (authority comes from above)
```

The rank comes from the **database**, not from a list of constants — so the
hierarchy also applies to custom roles.

---

## Usage

```ts
import {
  getAccess, accessFor, can, hasPermission,
  requirePermission, requirePermissionOr, PLATFORM,
} from "@/lib/permissions";

// A single check, throws on failure:
await requirePermission("workspace.update", { workspaceId });

// `.own`/`.any` pair — satisfied as soon as either one applies:
await requirePermissionOr([
  { permission: "issue.delete.any", ctx: { projectId } },
  { permission: "issue.delete.own", ctx: { projectId },
    ownerIds: [issue.reporterId, issue.assigneeId] },
]);

// Many flags at once (UIs, loops) — one resolution instead of n:
const access = await getAccess({ projectId });
access.has("issue.create");
access.rank("PROJECT");

// Lists without N+1 — the visibility rule for whole project lists:
const visible = await accessibleProjectIds(userId, workspaceId);
const mine = await visibleProjectIds(workspaceId);   // for the logged-in user

// Entering the tenant — not a permission, but membership:
await canEnterWorkspace(userId, workspaceId);
await currentUserCanEnterWorkspace(workspaceId);
```

### Entry isn't a permission

There's no key for "may this person even enter the workspace?" Entry belongs
to whoever is part of it, and there are three ways to get that: `tenant.access`,
an **accepted** membership, or a project membership without a workspace
membership (project guest). The third path is why a plain `WorkspaceMember`
query isn't enough here.

The workspace id lives in the URL — without this check, any signed-in person
could reach any tenant. `app/[locale]/(default)/[workspace]/layout.tsx`
checks it.

### The context is bound to the permission

`ContextFor<P>` is derived from the registry's `scopes`. So the type follows
the data definition:

```ts
can(uid, "platform.access",  PLATFORM)         // ✓ PLATFORM only
can(uid, "workspace.update", { workspaceId })  // ✓ WORKSPACE only
can(uid, "label.create",     { workspaceId })  // ✓ both tenant scopes
can(uid, "label.create",     { projectId })    // ✓
can(uid, "workspace.update", { projectId })    // ✗ compile error
can(uid, "issue.create",     PLATFORM)         // ✗ compile error
```

A wrong context is thus a compile error instead of a silent `false` answer.

### Enforcement

```
1. Server Action / query / route handler   ← mandatory, this is where it's blocked
2. Layout                                   ← convenient, but not a security boundary
3. UI (hiding buttons)                      ← UX only
```

`app/[locale]/(default)/admin/layout.tsx` checks `platform.access`, **and**
the queries in `features/admin/queries.ts` check again themselves. A layout
only protects the pages beneath it, not every call to a function.

#### The read path checks too

Write actions require their permission, read queries require visibility.
Without that, `blocked` would be a role that only grays out buttons:

| Query | Check |
|---|---|
| `getProjects`, `getProjectsWithStats` | filtered by `visibleProjectIds` |
| `getIssuesByProject` | `project.view` |
| `getIssueById`, `getIssueByRef` | `project.view`, otherwise `null` |
| `getSearchIssues`, `getMyIssues`, `getInboxIssues` | filtered to visible projects |
| `getLabels` | project labels only from visible projects |
| `getMembers`, `getTeams` | `canEnterWorkspace` |
| `getProjectMembersView`, `getProjectSettingsView` | `project.view`, otherwise `null` |

These checks **fail empty instead of throwing**: the queries run in Server
Components that render in parallel with the layout — an exception there
would have surfaced as a 500 before the layout's `notFound()` could take
effect. Empty data flows through the existing `if (!me) notFound()` paths to
the right result.

`app/api/issues/[id]/route.ts` sits outside the middleware matcher
(`proxy.ts` excludes `/api`) and so checks both itself: session and
`project.view`. A missing permission responds with 404, not 403 — otherwise
the response would reveal that the issue exists.

#### How the UI finds out

Level 3 is UX only, but it shouldn't guess. **No component checks for
itself** — every one receives ready-made flags from the Server Component
above it, and none of them knows a role name:

| UI | Flags | Source |
|---|---|---|
| Members (workspace) | `can.invite`, `can.setRole`, `can.remove` | page via `getAccess` |
| Members (project) | `canAdd`, `canSetRole`, `canRemove`, per-row `manageable` | `getProjectMembersView` |
| Project settings | `canUpdate`, `canDelete` | `getProjectSettingsView` |
| Role editor | `canManage`, `grantable`, `maxRank`, per-role `manageable` | `getRoleManagerView` |
| "New issue" | `creatableProjectIds` | `getIssueComposerData` |

The last case shows the pattern: there are **three** places that create an
issue (the sidebar button, the board column, the list's group header), and
all three get the same `IssueComposerData`. So `issue.create` is resolved
**once** per visible project and handed over as `creatableProjectIds`; the
buttons then only ask `includes(projectId)`. The board column and group
header check their own project, the sidebar button only disappears once
**nowhere** allows creating anything — and the project switcher in the
dialog only offers the allowed ones. `projects` itself stays complete: the
list also resolves the details of existing issues (prefix, color) — trimmed
down, there'd be cards with no project name.

---

## Managing roles

Three routes, one component (`features/roles/components/RoleManager`):

| Route | Context for `role.manage` | Manages |
|---|---|---|
| `/admin/roles` | Platform | custom platform roles |
| `/[workspace]/roles` | Workspace | custom workspace roles **and** the workspace's project roles |
| `/[workspace]/project/[slug]/roles` | Project | project-owned roles |

`role.manage` is the same key everywhere — which bucket is meant is decided
purely by context. The workspace's project roles deliberately hang off the
workspace context: they apply across all of its projects at once.

The shared system roles show up in every view too, but locked.

### Protection against privilege escalation

`features/roles/actions.ts` enforces four rules:

- The shared system roles are untouchable.
- `role.manage` must hold in the context of the relevant bucket.
- No creating, changing, or raising a role above your own rank.
- **ALLOW only for permissions the actor holds themselves.** DENY is free —
  prohibiting something never expands anyone's permissions.

A role that's still assigned to someone can't be deleted (foreign key set to
`RESTRICT`, plus a readable error message ahead of that).

---

## Plugins: two permissions, not one

Installing a plugin and switching it on are different acts, so they are different
permissions at different levels (the plugin system is described in
[`docs/plugins/`](plugins/README.md)).

| Key | Scope | Holders | What it allows |
|---|---|---|---|
| `plugin.manage` | PLATFORM | `platform_admin` | use the plugin store and choose which stores are on; install, update and uninstall plugins; allow plugins that come from no store |
| `plugin.enable` | WORKSPACE | `owner`, `admin` | enable, disable and configure the installed plugins in the workspace |

- **Installing is a platform matter.** Plugin code runs with full trust inside the
  app, so what may be installed is decided once for the whole instance, by the
  platform. A workspace admin can switch on what the platform has installed, but can
  never bring new code in: `plugin.manage` is not grantable in a workspace, and
  `plugin.enable` is not grantable on the platform.
- **`manager` does not have `plugin.enable`.** Switching a plugin on lets its code work
  with the workspace's data, which is the leadership's call rather than
  configuration. A workspace can still give the permission to a custom role
  (`role.manage`).
- **A platform plugin** (manifest `scope: platform`) applies to the whole instance, so
  `plugin.enable` does not apply to it: only `plugin.manage` switches it on and
  configures it, and a workspace cannot turn it off for itself.
- Nothing in the app checks either key yet: the actions that install and enable come
  with BARY-60.

---

## Managing members: three permissions, not one

`member.invite`, `member.role.update`, and `member.remove` are grantable
individually — so every action checks its own, both in the workspace
(`features/issues/actions.ts`) and in the project (`features/projects/actions.ts`):

| Action | Permission |
|---|---|
| add, invite by email | `member.invite` |
| change a member's role | `member.role.update` |
| remove from workspace/project | `member.remove` |

The UI gets the three flags separately (`canAdd`, `canSetRole`,
`canRemove`) and shows exactly what the action also allows through. On top
of that come three rules that apply at both levels: nobody touches a
higher-ranked member, nobody touches themselves, and whoever has
`project.view.all` can't be downgraded via a project role.

### Invitations

Inviting an unknown address immediately creates an account — without a
password, with `WorkspaceMember.pending = true` — plus a token
(`Invitation`). Only accepting it turns that into real access: a password
and name get set, `pending` drops away, and project memberships get carried
over (`acceptInvitation` in `features/auth/actions.ts`).

That's the reason `pending` has a rule in the resolver at all: an open
invitation gets no permissions until it's accepted. Before that, there was
no path there in the first place — `pending` was set and never cleared
again.

`/invite/<token>` is therefore public (`proxy.ts`): the token *is* the
authorization, and whoever redeems it doesn't have a password yet. Unknown,
expired, already used, or workspace suspended all look identical — otherwise
the page would be an oracle for valid tokens. There's no mail sending; the
actions return the link, and the UI shows it for copying.

### Project visibility

`Project.visibility` controls **only** who gets added automatically — access
itself is governed solely by `ProjectMember`:

```
public   → whoever is in the workspace gets added (later joiners too)
private  → only whoever was explicitly added; on creation, only the creator
```

Switching to `public` adds every workspace member. Switching back doesn't
take anything away from anyone: whoever's in stays in, only the automatism
stops. Removing someone is its own, visible action
(`removeProjectMember`) and not a side effect of a toggle — which is why the
settings page states that explicitly too.

Managed under `/[workspace]/project/[slug]/settings` with `project.update`;
deletion next to it with `project.delete`.

---

## Data model

```prisma
enum RoleScope        { PLATFORM WORKSPACE PROJECT }
enum PermissionEffect { ALLOW DENY }

model Role {
  id          String    @id   // deterministic, see lib/rbac/id.ts
  scope       RoleScope
  workspaceId String?         // NULL for system roles
  projectId   String?         // set only for project-owned roles
  key         String
  rank        Int
  editable    Boolean
  system      Boolean         // shared default role
}

model Permission {
  key  String @id             // object + action only, no level
  desc String
}

model RolePermission {
  roleId, permissionKey, effect  // ALLOW | DENY
}
```

`Permission` carries **no** scope column: which scopes a key may be granted
in lives in the registry (`lib/rbac/permissions.ts`) — putting it in the
table too would create a second source that can drift out of sync.

Role ids are built deterministically (`lib/rbac/id.ts`) so provisioning stays
idempotent. The id is a disguised composite key and must **never be parsed
anywhere**:

```
sys:WORKSPACE:member     shared system role
ws:nimbus:reviewer       custom workspace role
wsp:nimbus:triage        custom project role, all projects of the workspace
pr:p_7f3a:triage         custom project role, this project only
```

Uniqueness of (scope, owner, key) is enforced by **partial unique indexes**.
An `@@unique` across the nullable owner columns wouldn't work: Postgres
treats two NULL values as distinct.

---

## Introducing a new permission

```
1. lib/rbac/permissions.ts        add the key, description, and `scopes`
2. lib/rbac/roles.ts              assign it to the system roles that should have it
3. Migration                      create the Permission row and assign it to the
                                  system roles — ONE row each, not one per
                                  workspace
4. Add a guard                    requirePermission(...) in the Server Action
```

Step 3 stays necessary because `provisionSystemRbac` uses
`createMany({ skipDuplicates })` and doesn't touch existing roles. It's
trivial now, though: the default roles are shared, so there's exactly one
row to add per role.

---

## Tests

```
tests/unit/permissions/
  rbac.test.ts         registry: flat keys, scope assignment, roles internally consistent
  resolver.test.ts     replacement inside a project, DENY cuts through, tenant.access,
                       the implicit rules, entry, visible projects
  roleActions.test.ts  shared roles, rank limits, no privilege escalation
tests/unit/projects/
  projectMembers.test.ts   the three member.* permissions separately, rank, self-reference
  projectSettings.test.ts  project.update / project.delete, visibility switch
tests/unit/invitations/
  invitations.test.ts      token, deadline, and when an invitation stops being valid
tests/unit/auth/
  acceptInvitation.test.ts pending → false, carrying over projects, consuming the token
tests/unit/workspace/
  inviteWorkspaceMember.test.ts  known account vs. invite link, rank limit
tests/unit/issues/
  composerData.test.ts     creatableProjectIds: only projects with issue.create
tests/unit/ui/
  issueCreateButtons.test.tsx  that the three "New issue" triggers disappear
```

The `.tsx` tests need `react-dom/server` and so run in the last process of
the `test` script — together with the rich-text and table tests, not
alongside `issues/getLabels.test.ts`, which replaces `react` with a stub.

`bun run test` (not `bun test` — see CLAUDE.md).
