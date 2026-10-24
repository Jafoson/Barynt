# Permissions Audit — Inventory

Where the code checks a permission, where it doesn't, and where it only
looks like it does.
As of: August 6, 2026, commit `90bfceb`, clean working directory.

Complements [rbac.md](rbac.md): that document describes how the model is
meant to work, this one describes what actually made it into the code.

---

## Summary

204 permission-relevant surfaces individually recorded — every Server
Action, every query, every route handler, every page, every layout, every
component with a permission dependency, and every helper function in `lib/`.

| Layer                   | Surfaces | checks itself | partial | inherited | flags only |   none |    n/a |
| ----------------------- | -------: | ------------: | ------: | --------: | ---------: | -----: | -----: |
| Server Actions          |       30 |            19 |       6 |         — |          — |      1 |      4 |
| Queries (read path)     |       37 |            15 |       9 |        10 |          — |      3 |      — |
| Route Handlers          |        4 |             1 |       — |         — |          — |      — |      3 |
| Middleware (`proxy.ts`) |        3 |             — |       2 |         — |          — |      — |      1 |
| Layouts                 |        4 |             2 |       — |         — |          — |      — |      2 |
| Pages                   |       22 |            13 |       4 |         2 |          — |      — |      3 |
| UI components           |       56 |             — |      10 |         5 |         12 |     22 |      7 |
| Helper layer `lib/`     |       48 |             6 |       3 |        13 |          — |      2 |     24 |
| **Total**               |  **204** |        **56** |  **34** |    **30** |     **12** | **28** | **44** |

**The core is solid.** All 30 Server Actions except `suggestWorkspaceSlug`
check something, and the read path filters exactly where
[rbac.md](rbac.md#the-read-path-checks-too) promises it does — all seven
rows of that table hold. Of 105 reported deficiencies, 91 did not survive
the counter-check, mostly because the check does happen after all, one
level up or down.

**18 findings remain** — 5 high, 4 medium, 9 low, **none critical**. No
finding exposes another tenant's data to outsiders. All five severe ones
are privilege escalation _within_ role management; three of them lie
dormant as long as only the 15 system roles are in use, and become live the
moment someone creates a custom role — the system's actual purpose.

**The slope is in the UI.** 22 of 56 components offer actions for which
they receive no flag. Per [rbac.md](rbac.md#enforcement) that's level 3 and
so "UX only" — the actions block reliably. But it does mean that
`project_viewer` and `blocked` today see a fully operable UI that only
throws on click. And because there isn't a **single `error.tsx`** anywhere
in the tree, it throws uncaught
([finding 18](#18-no-error-boundary-every-permissionerror-becomes-a-500-low)).

---

## Legend

| Status            | Meaning                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **checks itself** | Calls `requirePermission` / `can` / `hasPermission` / `getAccess().has()`, or filters on `accessibleProjectIds` / `visibleProjectIds` |
| **partial**       | Checks something, but not everything — only session, only membership, on the wrong object, or a field goes unchecked                  |
| **inherited**     | No check of its own, but a layout or every caller demonstrably checks                                                                 |
| **flags only**    | UI piece that receives ready-made booleans and only renders (level 3)                                                                 |
| **none**          | No check on any path                                                                                                                  |
| **n/a**           | Deliberately public, or has no permission dependency                                                                                  |

Two distinctions carry the whole document:

**Membership is not a permission.** `canEnterWorkspace` deliberately has no
permission key ([rbac.md](rbac.md#entry-isnt-a-permission)). A query that
only checks via that shows up here as "partial" — it keeps outsiders out,
but says nothing about who's allowed to read the data.

**A role name is not a permission.** Whoever compares `me.role === "admin"`
is checking something, but on the wrong object: custom roles carry
arbitrary keys. That's "partial", not "checks itself".

---

## 1. Server Actions

Level 1 — this is where it's blocked. Contexts: `P` = Platform, `W` =
Workspace, `Pr` = Project.

### `features/issues/actions.ts`

| Action                                                | Status        | Check                                                                                                                        | Ctx  |
| ----------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---- |
| [`moveIssue`](../features/issues/actions.ts#L46)      | checks itself | `issue.update.any` \| `.own` (ownerIds: reporter, assignee)                                                                  | Pr   |
| [`reorderIssue`](../features/issues/actions.ts#L63)   | checks itself | `issue.update.any` \| `.own`                                                                                                 | Pr   |
| [`updateIssue`](../features/issues/actions.ts#L80)    | checks itself | `issue.update.any` \| `.own`; **additionally** `issue.assign` when `patch.assignee` is set                                   | Pr   |
| [`createIssue`](../features/issues/actions.ts#L116)   | **partial**   | only `issue.create` — writes `assigneeId` without `issue.assign` → [finding 1](#1-createissue-bypasses-the-assign-gate-high) | Pr   |
| [`createLabel`](../features/issues/actions.ts#L159)   | checks itself | `label.create`, context correctly chosen based on `projectId`                                                                | Pr/W |
| [`deleteIssue`](../features/issues/actions.ts#L207)   | checks itself | `issue.delete.any` \| `.own`                                                                                                 | Pr   |
| [`addComment`](../features/issues/actions.ts#L224)    | checks itself | `comment.create`                                                                                                             | Pr   |
| [`deleteComment`](../features/issues/actions.ts#L251) | checks itself | `comment.delete.any` \| `.own` (ownerIds: authorId)                                                                          | Pr   |

Clean craftsmanship, cross-checked multiple times:

- `projectId` comes from `issueContext(id)` everywhere — i.e. from the DB,
  not from the call. Changing a project via patch is impossible: `IssuePatch`
  ([types.ts:68](../features/issues/types.ts#L68)) has no `projectId`, and
  the `data` object is an explicit field allowlist.
- `reporterId` and `authorId` come from `requirePermission`'s return value;
  the client parameters with the same names are dead.
- For a project label, `workspaceId` is re-derived from the project and
  overwrites the client-supplied one.
- Issues that aren't found throw `PermissionError`, not "not found" — no
  existence disclosure.
- `descriptionText` / `bodyText` are re-set on every write (CLAUDE.md
  requirement met).

Side findings with no permission relevance: `status` and `type` are free
strings and aren't validated against the workspace configuration; `labels`
(string array with no foreign key) and `assigneeId` aren't checked for
project membership. Data integrity, stays within the same project. And
`issue.assign` also applies to self-assignment and to unassigning, even
though the registry describes it as "assign issues to _others_" — a role
with `issue.update.own` but without `issue.assign` can't give up its own
issue.

### `features/projects/actions.ts`

| Action                                                         | Status        | Check                                                                                                                                                                          | Ctx  |
| -------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| [`createProject`](../features/projects/actions.ts#L78)         | checks itself | `project.create`                                                                                                                                                               | W    |
| [`updateProject`](../features/projects/actions.ts#L177)        | **partial**   | `project.update` — also covers the `private → public` switch → [finding 7](#7-visibility-switch-depends-only-on-the-project-local-permission-medium)                           | Pr   |
| [`deleteProject`](../features/projects/actions.ts#L239)        | checks itself | `project.delete`                                                                                                                                                               | Pr   |
| [`addProjectMembers`](../features/projects/actions.ts#L360)    | checks itself | `member.invite` + rank; requires workspace membership; **without** self-reference/`notDowngradable` rule                                                                       | Pr   |
| [`setProjectMemberRole`](../features/projects/actions.ts#L398) | checks itself | `member.role.update` + rank + self-reference + `notDowngradable`                                                                                                               | Pr   |
| [`removeProjectMember`](../features/projects/actions.ts#L442)  | checks itself | `member.remove` + rank + self-reference + `notDowngradable`                                                                                                                    | Pr   |
| [`inviteProjectMember`](../features/projects/actions.ts#L486)  | **partial**   | `member.invite` (project) + rank; the _workspace_ row is created without a rank limit → [finding 2](#2-inviteprojectmember-creates-a-workspace-role-without-a-rank-limit-high) | Pr/W |

The three permissions `member.invite` / `member.role.update` / `member.remove`
are checked separately, as [rbac.md](rbac.md#managing-members-three-permissions-not-one)
promises. The three extra rules (nobody touches a higher-ranked member,
nobody touches themselves, `project.view.all` protects against being
downgraded) apply in `setProjectMemberRole` and `removeProjectMember`; they're
missing in `addProjectMembers`, which is why a workspace owner with no
existing row can initially be assigned a low role there.

### `features/roles/actions.ts` — the escalation-critical surface

| Action                                              | Status        | Check                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`createRole`](../features/roles/actions.ts#L110)   | checks itself | `role.manage` in the bucket context + `rank ≤ assignmentCeiling`; `target.workspaceId` stays unvalidated for project buckets → [finding 8](#8-createrole-writes-an-unvalidated-foreign-workspace-id-medium) |
| [`updateRole`](../features/roles/actions.ts#L162)   | checks itself | `system`/`editable` lock, `role.manage`, **both old and new** rank against the ceiling                                                                                                                      |
| [`deleteRole`](../features/roles/actions.ts#L194)   | checks itself | `system`/`editable`, `role.manage`, rank, then carrier count via `_count` (incl. `platformUsers`)                                                                                                           |
| [`setRoleGrant`](../features/roles/actions.ts#L233) | **partial**   | `role.manage`, rank, registry key, scope validity, ALLOW only for keys the actor holds themselves — but `effect === null` deletes unchecked → [finding 3](#3-setrolegrant-deletes-a-deny-unchecked-high)    |

The four rules from [rbac.md](rbac.md#protection-against-privilege-escalation)
are implemented. Two gaps remain: the `null` path in `setRoleGrant`, and
`requireTargetManage` measures permissions in the context of the target
bucket — which comes from the client argument → [finding 4](#4-platform_admin-manages-roles-in-any-foreign-workspace-high).

No path parses a role id: the deterministic ids from
[`lib/rbac/id.ts`](../lib/rbac/id.ts) are only constructed, never taken
apart — as [rbac.md](rbac.md#data-model) requires.

### `features/workspaces/actions.ts`

| Action                                                              | Status        | Check                                                                                                               | Ctx     |
| ------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- | ------- |
| [`getProjectsForWorkspaces`](../features/workspaces/actions.ts#L49) | checks itself | Session + intersection with own workspaces, then `visibleProjectIds` per workspace                                  | W/Pr    |
| [`suggestWorkspaceSlug`](../features/workspaces/actions.ts#L82)     | **none**      | — → [finding 13](#13-suggestworkspaceslug-is-an-unauthenticated-existence-oracle-low)                               | —       |
| [`createWorkspace`](../features/workspaces/actions.ts#L86)          | **partial**   | only `getSession()`; deliberately without a key — any signed-in person may create a workspace and becomes its owner | Session |
| [`setMemberRole`](../features/workspaces/actions.ts#L191)           | checks itself | `member.role.update` + rank comparison both ways + self-reference blocked                                           | W       |
| [`removeMember`](../features/workspaces/actions.ts#L242)            | checks itself | `member.remove` + rank; `dropProjectMemberships` in the same transaction                                            | W       |
| [`inviteWorkspaceMember`](../features/workspaces/actions.ts#L290)   | checks itself | `member.invite` + `assignmentCeiling`; `owner` blocked                                                              | W       |

`createWorkspace` without a key is a product decision, not a gap — there's
no permission key for it, and self-registration is the intended path.
Missing: a per-account limit.

Two edge cases: `assignmentCeiling` returns `Infinity` when the actor holds
no role at all in the workspace scope — a `tenant.access` support agent can
thereby hand out any non-owner role, while `setMemberRole` blocks them with
rank -1. And `removeMember` doesn't also delete the removed person's open
`Invitation` rows; the token stays redeemable (which then sets a password
and name, but without workspace entry, because the membership row is
missing).

### `features/auth/actions.ts`

| Action                                                 | Status      | Note                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`login`](../features/auth/actions.ts#L23)             | n/a         | public; password check in [`auth.ts:52`](../auth.ts#L52) (bcrypt, uniform error message → no account enumeration; no rate limit). `callbackUrl` unvalidated → [finding 14](#14-open-redirect-via-callbackurl-low)                          |
| [`register`](../features/auth/actions.ts#L50)          | n/a         | public; no rate limit, and the response distinguishes "email already exists" from success → accounts enumerable                                                                                                                            |
| [`acceptInvitation`](../features/auth/actions.ts#L115) | **partial** | the token _is_ the authorization; [`openInvitation`](../lib/invitations.ts#L109) checks existence, `acceptedAt`, expiry, and `workspace.suspended`. `hasPassword` is ignored → [finding 6](#6-acceptinvitation-ignores-haspassword-medium) |
| [`logout`](../features/auth/actions.ts#L189)           | n/a         | `signOut` with a fixed target path                                                                                                                                                                                                         |
| [`signInWithOAuth`](../features/auth/actions.ts#L194)  | n/a         | fixed target; `provider` isn't validated against `enabledOAuthProviders` (the only consequence is an Auth.js error)                                                                                                                        |

---

## 2. The read path — queries

[rbac.md](rbac.md#the-read-path-checks-too) makes concrete promises here.
**All seven rows of that table hold.** The additions below cover queries
not listed there.

### `features/issues/queries.ts`

| Query                                                                                                                                                                                                            | Status        | Check                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`getIssuesByProject`](../features/issues/queries.ts#L257)                                                                                                                                                       | checks itself | `project.view` → `[]`                                                                                                                                                                                            |
| [`getIssueById`](../features/issues/queries.ts#L377)                                                                                                                                                             | checks itself | `project.view` → `null`                                                                                                                                                                                          |
| [`getIssueByRef`](../features/issues/queries.ts#L397)                                                                                                                                                            | checks itself | `project.view` → `null`                                                                                                                                                                                          |
| [`getSearchIssues`](../features/issues/queries.ts#L419)                                                                                                                                                          | checks itself | `visibleProjectIds`, early return `[]`                                                                                                                                                                           |
| [`getMyIssues`](../features/issues/queries.ts#L337)                                                                                                                                                              | checks itself | `accessibleProjectIds`                                                                                                                                                                                           |
| [`getInboxIssues`](../features/issues/queries.ts#L352)                                                                                                                                                           | checks itself | `accessibleProjectIds`                                                                                                                                                                                           |
| [`getProjects`](../features/issues/queries.ts#L101)                                                                                                                                                              | checks itself | `visibleProjectIds`                                                                                                                                                                                              |
| [`getLabels`](../features/issues/queries.ts#L151)                                                                                                                                                                | **partial**   | only the `projectId: { in: visible }` branch; `projectId: null` stays unfiltered, even for an empty set → [finding 11](#11-workspace-wide-configuration-is-readable-without-entry-low)                           |
| [`getMembers`](../features/issues/queries.ts#L123)                                                                                                                                                               | **partial**   | only `currentUserCanEnterWorkspace` → [finding 9](#9-project-guests-read-the-full-member-list-medium)                                                                                                            |
| [`getTeams`](../features/issues/queries.ts#L233)                                                                                                                                                                 | **partial**   | only entry; `projects` additionally leaks the IDs of invisible projects                                                                                                                                          |
| [`getWorkspace`](../features/issues/queries.ts#L83)                                                                                                                                                              | **none**      | only `where: { id, suspended: false }` — the name and color of any workspace are readable                                                                                                                        |
| [`getUserWorkspaces`](../features/issues/queries.ts#L92)                                                                                                                                                         | inherited     | callers pass `session.userId`; no check inside the function itself, no filter on `pending`/`suspended`                                                                                                           |
| [`getStatuses`](../features/issues/queries.ts#L173) [`getPriorities`](../features/issues/queries.ts#L189) [`getIssueTypes`](../features/issues/queries.ts#L204) [`getRoles`](../features/issues/queries.ts#L219) | inherited     | no check of their own; only [`[workspace]/layout.tsx:34`](../app/[locale]/%28default%29/[workspace]/layout.tsx#L34) protects them → [finding 11](#11-workspace-wide-configuration-is-readable-without-entry-low) |

All checks fail empty (`[]` / `null`) instead of throwing — correct, since
Server Components render in parallel with the layout.

### `features/projects/queries.ts` — where the UI flags come from

| Query                                                           | Status        | Check and flags supplied                                                                                                           |
| --------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`getProjectsWithStats`](../features/projects/queries.ts#L21)   | checks itself | `visibleProjectIds`                                                                                                                |
| [`getProjectSettingsView`](../features/projects/queries.ts#L55) | checks itself | `project.view` → `null`; flags `canUpdate` (`project.update`), `canDelete` (`project.delete`)                                      |
| [`getProjectMembersView`](../features/projects/queries.ts#L135) | checks itself | `project.view` → `null`; flags `canAdd`, `canSetRole`, `canRemove`, `actorRank`, **per-row `manageable`** (inherited rows `false`) |

Exemplary: the check and the UI flag come from the same resolution, and the
flags match exactly the keys the actions require. One deviation: `canAdd`
only reflects `member.invite` in the project, while `inviteProjectMember`
additionally requires `member.invite` in the workspace for an _unknown_
address — so the invite form still appears even when it will fail for new
addresses.

### `features/admin/queries.ts`

| Query                                                      | Status        | Check                                                                                     |
| ---------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| [`getAllUsers`](../features/admin/queries.ts#L69)          | checks itself | `requirePlatformAccess()` → `platform.access`                                             |
| [`getPlatformStats`](../features/admin/queries.ts#L96)     | checks itself | `platform.access`                                                                         |
| [`getCurrentUser`](../features/admin/queries.ts#L51)       | **none**      | no key, no self-reference check → [finding 12](#12-two-admin-queries-without-a-guard-low) |
| [`getFirstWorkspaceId`](../features/admin/queries.ts#L107) | **none**      | ditto                                                                                     |

The double-check that [rbac.md](rbac.md#enforcement) promises (layout
**and** query) holds for two of the four functions. And `platform.access`
is the coarsest key: `user.manage` exists in the registry for exactly this
purpose, but is checked nowhere — so `platform_support` reads every email
address with it.

### `features/workspaces/queries.ts` and `features/roles/queries.ts`

| Query                                                                                                                                 | Status        | Check                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`getWorkspaceProjects`](../features/workspaces/queries.ts#L112) [`getWorkspaceSearchIssues`](../features/workspaces/queries.ts#L136) | checks itself | delegate to the filtered issue queries                                                                                                                                                                                            |
| [`requireWorkspaceId`](../features/workspaces/queries.ts#L39)                                                                         | **none**      | pulls the tenant from the request store and only checks that it's _set_ — the bracket onto which twelve `getWorkspace*` functions offload their protection                                                                        |
| [`getWorkspaceMembers`](../features/workspaces/queries.ts#L108)                                                                       | **partial**   | one-liner over `getMembers` — so only entry, no key                                                                                                                                                                               |
| [`getCurrentWorkspace`](../features/workspaces/queries.ts#L50)                                                                        | inherited     | no check of its own; the gate is only in the layout                                                                                                                                                                               |
| [`getMe`](../features/workspaces/queries.ts#L75)                                                                                      | partial       | session; **falls back to the person's own account without workspace membership** — which is why `if (!me) notFound()` does _not_ catch non-members                                                                                |
| [`getMyWorkspaces`](../features/workspaces/queries.ts#L58)                                                                            | partial       | filters neither `suspended` nor `pending` — the switcher shows workspaces you can't actually enter                                                                                                                                |
| [`getWorkspaceLabels`](../features/workspaces/queries.ts#L116)                                                                        | partial       | inherits the `getLabels` gap                                                                                                                                                                                                      |
| [`getWorkspaceStatuses`](../features/workspaces/queries.ts#L120) … [`getWorkspaceRoles`](../features/workspaces/queries.ts#L132)      | inherited     | see `getStatuses` etc. above                                                                                                                                                                                                      |
| [`getRoleManagerView`](../features/roles/queries.ts#L25)                                                                              | **partial**   | supplies `canManage`, `grantable`, `maxRank`, `manageable` — but reads the roles including their grants and `memberCount` **before**, and independent of, `canManage` → [finding 10](#10-adminroles-reads-without-rolemanage-low) |

`getMe`'s fallback is the silent precondition of several pages: `notFound()`
on `!me` looks like a membership gate, but isn't one.

---

## 3. The HTTP edge

`proxy.ts` excludes `/api` from the matcher — route handlers therefore have
to check everything themselves.

| Surface                                                                         | Status        | Check                                                                                                                                                                              |
| ------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`app/api/issues/[id]/route.ts` `GET`](../app/api/issues/[id]/route.ts#L14)     | checks itself | `currentUserId()` → 401, then `project.view` → **404** (not 403 — the response doesn't reveal that the issue exists). Only `GET` exists, so no unprotected method                  |
| [`app/api/auth/[...nextauth]/route.ts`](../app/api/auth/[...nextauth]/route.ts) | n/a           | Auth.js handler, CSRF handled by `@auth/core`                                                                                                                                      |
| [`app/api/logout/route.ts`](../app/api/logout/route.ts#L6)                      | n/a           | no permission relevance, but a state-changing `GET` with no method restriction → [finding 15](#15-apilogout-is-a-state-changing-get-low)                                           |
| [`proxy.ts` `PUBLIC_PATHS`](../proxy.ts#L11)                                    | n/a           | `/login`, `/register`, `/invite`; the locale prefix is stripped beforehand via [`i18n/routing.ts`](../i18n/routing.ts). Prefix match — future subpaths become public automatically |
| [`proxy.ts` middleware](../proxy.ts#L16)                                        | partial       | only session (JWT), no key and no DB check — a deleted account's token passes until it expires                                                                                     |
| [`proxy.ts` `config.matcher`](../proxy.ts#L47)                                  | partial       | `/((?!api\|_next\|_vercel\|.*\..*).*)` — paths with a dot are excluded                                                                                                             |

The middleware is **not a security boundary**, it's routing: Server
Actions have globally resolvable IDs and are reachable through any public
path. That's precisely why every action checks for itself — with the
exception of `suggestWorkspaceSlug`, which relies solely on the proxy.

The only client read path over HTTP is
[`useIssueDetail.ts:47`](../features/issues/components/IssueDetail/useIssueDetail.ts#L47),
which fetches `/api/issues/[id]` and calls
`updateIssue`/`addComment`/`deleteIssue` — protection lives entirely in the
route and the actions.
[`useTabBar.ts`](../components/ui/layout/TabBar/useTabBar.ts) calls
`getProjectsForWorkspaces` with workspace IDs from `localStorage`; the
action filters to the caller's own tenants itself.

---

## 4. Layouts and pages

Layouts are level 2 — convenient, but not a hard boundary.

| Layout                                                                                                           | Status        | Check                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`[workspace]/layout.tsx`](../app/[locale]/%28default%29/[workspace]/layout.tsx#L34)                             | checks itself | Session → `/login`, then `canEnterWorkspace` → `notFound()` (not `redirect`, so the workspace's existence isn't revealed)                                       |
| [`admin/layout.tsx`](../app/[locale]/%28default%29/admin/layout.tsx#L25)                                         | checks itself | `platform.access` → `notFound()`                                                                                                                                |
| [`project/[projectSlug]/layout.tsx`](../app/[locale]/%28default%29/[workspace]/project/[projectSlug]/layout.tsx) | **n/a**       | purely presentational — **no `project.view`**. Protection of every project page hinges on each child page checking for itself; a missed one wouldn't be noticed |
| [`[locale]/layout.tsx`](../app/[locale]/layout.tsx#L36)                                                          | n/a           | locale validation only                                                                                                                                          |

There is **no** `app/layout.tsx` and no `error.tsx` / `not-found.tsx` /
`loading.tsx` anywhere in the tree ([finding 18](#18-no-error-boundary-every-permissionerror-becomes-a-500-low)).

### Pages

| Page                                                                                                                                                                                                 | Status        | Check                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`[workspace]/page.tsx`](../app/[locale]/%28default%29/[workspace]/page.tsx)                                                                                                                         | checks itself | `visibleProjectIds` via `getWorkspaceProjects`                                                                                                                                                                                                          |
| [`[workspace]/inbox`](../app/[locale]/%28default%29/[workspace]/inbox/page.tsx) [`my`](../app/[locale]/%28default%29/[workspace]/my/page.tsx)                                                        | checks itself | `accessibleProjectIds` + `issue.create` per project                                                                                                                                                                                                     |
| [`[workspace]/issue/[issueRef]`](../app/[locale]/%28default%29/[workspace]/issue/[issueRef]/page.tsx)                                                                                                | checks itself | `getIssueByRef` → `null` → `notFound()`; `generateMetadata` (line 21) runs through it too. **Doesn't resolve write permissions for the UI**                                                                                                             |
| [`[workspace]/members`](../app/[locale]/%28default%29/[workspace]/members/page.tsx#L23)                                                                                                              | checks itself | `getAccess({ workspaceId })` → `can.invite` / `.setRole` / `.remove`; read access only via entry → [finding 9](#9-project-guests-read-the-full-member-list-medium), [finding 17](#17-workspace-member-management-shows-more-than-the-action-allows-low) |
| [`[workspace]/projects`](../app/[locale]/%28default%29/[workspace]/projects/page.tsx)                                                                                                                | checks itself | `visibleProjectIds`; **no `project.create` flag** for the button                                                                                                                                                                                        |
| [`[workspace]/roles`](../app/[locale]/%28default%29/[workspace]/roles/page.tsx#L30)                                                                                                                  | checks itself | `role.manage` → `notFound()`                                                                                                                                                                                                                            |
| [`[workspace]/settings`](../app/[locale]/%28default%29/[workspace]/settings/page.tsx)                                                                                                                | **partial**   | only `getMe()` → `notFound()`. **No `workspace.update`** → [finding 16](#16-workspace-settings-and-teams-without-a-permission-low)                                                                                                                      |
| [`[workspace]/teams`](../app/[locale]/%28default%29/[workspace]/teams/page.tsx)                                                                                                                      | **partial**   | only entry via `getMembers`/`getTeams`. **No `team.*`** → [finding 16](#16-workspace-settings-and-teams-without-a-permission-low)                                                                                                                       |
| [`project/[projectSlug]/page.tsx`](../app/[locale]/%28default%29/[workspace]/project/[projectSlug]/page.tsx) [`list`](../app/[locale]/%28default%29/[workspace]/project/[projectSlug]/list/page.tsx) | checks itself | slug checked against `visibleProjectIds` → `notFound()`, then `project.view` in `getIssuesByProject`                                                                                                                                                    |
| [`project/[projectSlug]/members`](../app/[locale]/%28default%29/[workspace]/project/[projectSlug]/members/page.tsx)                                                                                  | checks itself | `getProjectMembersView` → `null` → `notFound()`                                                                                                                                                                                                         |
| [`project/[projectSlug]/settings`](../app/[locale]/%28default%29/[workspace]/project/[projectSlug]/settings/page.tsx)                                                                                | checks itself | `getProjectSettingsView` → `null` → `notFound()`; flags `canUpdate`/`canDelete`                                                                                                                                                                         |
| [`project/[projectSlug]/roles`](../app/[locale]/%28default%29/[workspace]/project/[projectSlug]/roles/page.tsx#L33)                                                                                  | checks itself | `role.manage` → `notFound()`                                                                                                                                                                                                                            |
| [`admin/page.tsx`](../app/[locale]/%28default%29/admin/page.tsx)                                                                                                                                     | checks itself | via `getPlatformStats` → `platform.access` (plus the layout)                                                                                                                                                                                            |
| [`admin/members`](../app/[locale]/%28default%29/admin/members/page.tsx)                                                                                                                              | partial       | via `getAllUsers` → `platform.access` — but that covers every account's email address, where `user.manage` would be the intended key                                                                                                                    |
| [`admin/roles`](../app/[locale]/%28default%29/admin/roles/page.tsx)                                                                                                                                  | inherited     | only `platform.access` from the layout, **no `role.manage`** → [finding 10](#10-adminroles-reads-without-rolemanage-low)                                                                                                                                |
| [`[locale]/page.tsx`](../app/[locale]/page.tsx)                                                                                                                                                      | **partial**   | picks a workspace via `findFirst` **without** `canEnterWorkspace`, without `pending: false`, without `suspended: false`, and without `orderBy` — anyone with only an open invitation ends up in a `notFound`                                            |
| [`(auth)/login`](../app/[locale]/%28auth%29/login/page.tsx)                                                                                                                                          | n/a           | public; `callbackUrl` unvalidated → [finding 14](#14-open-redirect-via-callbackurl-low)                                                                                                                                                                 |
| [`(auth)/register`](../app/[locale]/%28auth%29/register/page.tsx)                                                                                                                                    | n/a           | public; unlike `login`, **without** a redirect for already-signed-in users                                                                                                                                                                              |
| [`(auth)/invite/[token]`](../app/[locale]/%28auth%29/invite/[token]/page.tsx)                                                                                                                        | n/a           | deliberately public, the token is the authorization. Unknown / expired / used / workspace-suspended all look the same — **no oracle**                                                                                                                   |
| [`(auth)/create-workspace`](../app/[locale]/%28auth%29/create-workspace/page.tsx)                                                                                                                    | inherited     | session only via the proxy; the action checks it itself                                                                                                                                                                                                 |

---

## 5. The UI

[rbac.md](rbac.md#how-the-ui-finds-out) demands: **no component checks for
itself, none knows a role name.** The first half holds — verified: **none**
of the 56 components call `getAccess`, `hasPermission`, `accessFor`, or
`requirePermission`. The second half doesn't.

**What gets flags (12):**

| UI                       | Flags                                                     | Source                                                                                                  |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Members (workspace)      | `can.invite`, `can.setRole`, `can.remove`                 | [`members/page.tsx:23`](../app/[locale]/%28default%29/[workspace]/members/page.tsx#L23) via `getAccess` |
| Members (project)        | `canAdd`, `canSetRole`, `canRemove`, per-row `manageable` | `getProjectMembersView`                                                                                 |
| Project settings         | `canUpdate`, `canDelete`                                  | `getProjectSettingsView`                                                                                |
| Role editor              | `canManage`, `grantable`, `maxRank`, `manageable`         | `getRoleManagerView`                                                                                    |
| "New issue" (3 triggers) | `creatableProjectIds`                                     | `getIssueComposerData`                                                                                  |

The last case is the model: `issue.create` is resolved **once** per visible
project, and the three triggers
([`NewIssueButton`](../features/issues/components/NewIssueButton/NewIssueButton.tsx),
[`BoardColumn`](../features/issues/components/BoardColumn/BoardColumn.tsx),
[`ListGroupHeader`](../features/issues/components/ListView/components/ListGroupHeader.tsx))
only ask `includes(projectId)`, and the project switcher in the dialog only
offers the allowed ones.

**What gets no flags (22 components, grouped here by area — the list also
names the hooks and the partially-supplied cases)** — each renders an
action that only the action itself rejects:

| Area            | Components                                                                                                                                                                         | Missing flag                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Issue detail    | `IssueDetail`, `IssueDetailView`, `IssueDetailPage(View)`, `IssueTitle`, `IssueDescription`, `IssueProperties`, `IssueLabels`, `IssueComments`, `IssueActionsMenu`, `IssueSidebar` | `issue.update.own/.any`, `issue.delete.*`, `comment.create`, `issue.assign` |
| Board / list    | `Board`, `BoardCard`, `ListView`, `IssueCells`, `useBoardDnd`, `useIssuePatch`                                                                                                     | `issue.update.*` (dragging, status change)                                  |
| Assign / labels | `AssigneePicker`, `LabelPickerMenu`, `LabelFilter`                                                                                                                                 | `issue.assign`, `label.create`                                              |
| Projects        | `NewProjectButton`, `CreateProjectModal`                                                                                                                                           | `project.create`                                                            |
| Navigation      | `Sidebar`, `NavGroup`, `NavGroupWorkspace`, `NavGroupProjects`, `CommandPalette`                                                                                                   | `member.invite`, `role.manage`, `workspace.update`, `project.update`        |

Practical consequence: `project_viewer` and `blocked` see a fully operable
UI. Not a security problem — level 1 holds — but `blocked` is today "a
role that does _not_ gray out buttons."

Structurally, the foundation for that is missing anyway:
[`lib/nav.ts`](../lib/nav.ts#L31) has no `permission` field on `NavEntry`,
and `Sidebar` doesn't accept an access object. As long as that's the case,
level 3 for navigation can't be implemented at all. Conversely,
`deleteComment` has no UI whatsoever.

Two Server Components also hand personal data to the client that nothing
limits by permission: [`Topbar.tsx`](../features/issues/components/Topbar/Topbar.tsx)
loads `getWorkspaceMembers()` (including email) for the filter bar, and
[`IssueRichText`](../features/issues/components/IssueRichText/IssueRichText.tsx)
feeds the member list and workspace-wide issue titles into the editor as
`@`/`#` suggestions — both carry [finding 9](#9-project-guests-read-the-full-member-list-medium).

**Three violations of "no role names in the code":**

| Location                                                                    | Code                                                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`Settings.tsx:23`](../features/admin/components/Settings/Settings.tsx#L23) | `const isAdmin = me.role === "admin" \|\| me.role === "owner"`                                                    |
| [`Teams.tsx:20`](../features/admin/components/Teams/Teams.tsx#L20)          | `const isAdmin = me.role === "admin" \|\| me.role === "owner"`                                                    |
| [`Members.tsx:49`](../features/admin/components/Members/Members.tsx#L49)    | `roles.filter(r => r.id !== "owner" && r.rank <= (me.roleRank ?? -1))` — reimplements the rank rule on the client |

This is exactly the pattern [rbac.md](rbac.md#the-implicit-rules) declares
abolished ("No role names appear in the code anymore"). It only holds up
today because these two pages have no Server Action. Custom roles — the
whole point of the system — aren't covered by it: a custom role with
`team.create` never sees the button, while a renamed role with the key
`admin` always does. Fitting the pattern,
[`InviteMemberModal.tsx:48`](../features/admin/components/Members/components/InviteMemberModal.tsx#L48)
picks `"member"` as a literal default instead of receiving a `defaultRole`
from the server (the way `AddProjectMembersModal` does).

---

## 6. Helper layer `lib/`

| File                                                                                                          | Status         | Note                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`lib/permissions.ts`](../lib/permissions.ts)                                                                 | **the source** | Every check funnels through here: `can`/`hasPermission`/`requirePermission(Or)`/`getAccess`/`accessFor`, `canEnterWorkspace`, `accessibleProjectIds`, `assignmentCeiling`. The three implicit rules (`suspended`, `pending`, no `ProjectMember` row), the `tenant.access` master key, and `keepsProjectRights` live in exactly one place — as [rbac.md](rbac.md#the-implicit-rules) promises |
| [`lib/rbac/*`](../lib/rbac/)                                                                                  | n/a            | pure registry; the `scopes` are enforced on assignment via `isPermissionAllowedIn`                                                                                                                                                                                                                                                                                                           |
| [`lib/project-membership.ts`](../lib/project-membership.ts#L61)                                               | inherited      | every caller checks. But `projectRoleKeyFor` derives the role `project_admin` from `member.invite` → [finding 5](#5-projectrolekeyfor-grants-manager-role-management-within-the-project-high)                                                                                                                                                                                                |
| [`createInvitation`](../lib/invitations.ts#L38)                                                               | inherited      | no check of its own; callers check `member.invite`                                                                                                                                                                                                                                                                                                                                           |
| [`openInvitation`](../lib/invitations.ts#L109)                                                                | checks itself  | token, `acceptedAt`, expiry, `workspace.suspended`; supplies `hasPassword`, which only the page honors → [finding 6](#6-acceptinvitation-ignores-haspassword-medium)                                                                                                                                                                                                                         |
| [`lib/session.ts`](../lib/session.ts#L6)                                                                      | partial        | no DB check — the account's existence or suspension isn't checked, the token holds until it expires. Acceptable, because every permission check goes fresh to the DB anyway                                                                                                                                                                                                                  |
| [`lib/current-workspace.ts`](../lib/current-workspace.ts)                                                     | n/a            | pure request store, no checks                                                                                                                                                                                                                                                                                                                                                                |
| [`lib/rbac-provision.ts`](../lib/rbac-provision.ts)                                                           | n/a            | only reachable via the seed/script, not via an action or route                                                                                                                                                                                                                                                                                                                               |
| [`lib/nav.ts`](../lib/nav.ts#L31)                                                                             | none           | navigation constants with no `permission` field (see above)                                                                                                                                                                                                                                                                                                                                  |
| [`lib/user-defaults.ts`](../lib/user-defaults.ts) [`lib/workspace-defaults.ts`](../lib/workspace-defaults.ts) | n/a            | name/handle generation, no permission relevance                                                                                                                                                                                                                                                                                                                                              |
| [`auth.config.ts`](../auth.config.ts#L22)                                                                     | partial        | `trustHost: true` with `AUTH_URL` commented out ([`example.env:8`](../example.env#L8)) — behind a proxy without a host filter, influenceable via the Host header                                                                                                                                                                                                                             |
| [`auth.ts`](../auth.ts#L52)                                                                                   | n/a            | bcrypt comparison, uniform error message; **no rate limit/lockout**                                                                                                                                                                                                                                                                                                                          |

Not listed individually because they have no permission relevance:
[`lib/richtext/`](../lib/richtext/) (dependency-free, pure document
transformation), [`lib/context/`](../lib/context/), [`lib/utils/`](../lib/utils/),
[`types/`](../types/), and the rich-text editor building blocks under
[`components/ui/layout/RichTextEditor/`](../components/ui/layout/RichTextEditor/).
[`i18n/routing.ts`](../i18n/routing.ts) is indirectly relevant: it defines
the locale prefixes that `proxy.ts` strips before `PUBLIC_PATHS` applies.

---

## 7. Permission keys: declared vs. enforced

34 keys in [`lib/rbac/permissions.ts`](../lib/rbac/permissions.ts).
**13 have not a single enforcement point** in `app/`, `features/`,
`components/`, `lib/`:

| Key                                                          | Why unchecked                                                                                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace.update`                                           | No `updateWorkspace` exists; [`Settings.tsx`](../features/admin/components/Settings/Settings.tsx) has no Server Action                                                                          |
| `workspace.delete`                                           | no action                                                                                                                                                                                       |
| `workspace.suspend`                                          | no action — `Workspace.suspended` is _read_ in four places, written by none                                                                                                                     |
| `config.manage`, `audit.view`                                | no feature                                                                                                                                                                                      |
| `user.manage`                                                | the feature exists ([`admin/members`](../app/[locale]/%28default%29/admin/members/page.tsx)), but checks `platform.access` instead of this key; there's no action that changes `platformRoleId` |
| `team.create/.update/.delete/.member.manage/.project.manage` | [`Teams.tsx`](../features/admin/components/Teams/Teams.tsx) has no Server Action; visibility hangs off a role name                                                                              |
| `label.update`, `label.delete`                               | no `updateLabel`/`deleteLabel`                                                                                                                                                                  |

**These are mostly not gaps, but features not yet built** — the registry
runs ahead of the implementation, and the role matrix in the editor grants
permissions that have no effect. Two exceptions:

- `user.manage` is built, but the wrong (coarser) key is checked.
- `workspace.update` and `team.*` are missing exactly where the UI compares
  role names instead. The moment these pages get an action, the guard is
  missing entirely — the role-name check is client code.

The 21 enforced keys, by number of enforcement points: `project.view` (9),
`member.invite` (8), `project.view.all` (5), `member.remove` (5),
`member.role.update` (5), `issue.update.any` (4), `project.delete` (4),
`role.manage` (3), `project.update` (3), `label.create` (3),
`issue.update.own` (3), `issue.create` (3), `comment.create` (2),
`comment.delete.any` (2), `platform.access` (2), `tenant.access` (1),
`project.create` (1), `issue.assign` (1), `issue.delete.any` (1),
`issue.delete.own` (1), `comment.delete.own` (1).

---

## 8. Findings

18 findings. Rating: **high** = write operation or escalation without a
permission · **medium** = data leak without a change · **low** = UX, meta
information, or robustness. None is critical: no outsider reaches another
tenant's data.

### 1. `createIssue` bypasses the assign gate (high)

[`features/issues/actions.ts:116`](../features/issues/actions.ts#L116)
only checks `issue.create`, but writes `assigneeId` — while
[`updateIssue:93`](../features/issues/actions.ts#L93) additionally requires
`issue.assign` for that exact field. The two-step path is closed, the
one-step path is open.

With the system roles the gap lies dormant: every role with `issue.create`
also carries `issue.assign`. It bites for custom roles — `setRoleGrant`
sets every key individually, a role "Contributor without assignment" is
buildable, and `createIssue` even ignores a DENY there.

**Fix:** `if (data.assignee) await requirePermission("issue.assign", { projectId: data.projectId })`.

### 2. `inviteProjectMember` creates a workspace role without a rank limit (high)

[`features/projects/actions.ts:486`](../features/projects/actions.ts#L486)
correctly checks `member.invite` in the project and the rank limit of the
_project_ role. For an unknown address, it additionally creates a
`WorkspaceMember` row with the default role `member` (rank 2) — **without**
`assignmentCeiling(access, "WORKSPACE")`.
[`inviteWorkspaceMember:308`](../features/workspaces/actions.ts#L308)
enforces that limit.

Exploitable via a custom workspace role of rank 0 or 1 that carries
`member.invite` — exactly the plausible "may only invite" role. Whoever
holds it may only grant rank ≤ 1 (viewer/guest) via `inviteWorkspaceMember`,
but creates an account of rank 2 here (`issue.create`,
`issue.update.own`, `issue.assign`, `label.create`) — and gets the invite
link back, so they can take over the second identity themselves.

**Fix:** check the derived workspace role against
`assignmentCeiling(…, "WORKSPACE")`.

### 3. `setRoleGrant` deletes a DENY unchecked (high)

[`features/roles/actions.ts:254`](../features/roles/actions.ts#L254): for
`effect === null`, `deleteMany` deletes the row without reading its
previous effect. The rule "ALLOW only for keys the actor holds themselves"
only applies for `effect === "ALLOW"`.

Removing a DENY expands permissions the moment it was masking an ALLOW from
another level — and that a DENY cuts across every level is a deliberate
boundary ([rbac.md](rbac.md#so-why-still-have-deny)). Two reachable cases: a
workspace role with a DENY on a project-related key (the project role
takes over after deletion), and DENY on `workspace.delete` or
`role.manage` — the only keys in both PLATFORM _and_ WORKSPACE, where the
workspace DENY masks the platform role's ALLOW.

The UI shields nothing here: in
[`PermissionMatrix.tsx:56`](../features/roles/components/PermissionMatrix/PermissionMatrix.tsx#L56),
only the ALLOW button is bound to `grantable` (`allowLocked`), the "unset"
button is freely clickable. And
[`roleActions.test.ts:262`](../tests/unit/permissions/roleActions.test.ts#L262)
even locks in this behavior — the test has to change alongside the fix.

**Fix:** read the existing entry before deleting, and for `effect === "DENY"`
apply the same `access.has(permission)` check.

### 4. `platform_admin` manages roles in any foreign workspace (high)

[`requireTargetManage`](../features/roles/actions.ts#L50) measures
permissions in the context of the target bucket — and that comes from the
client argument. [`loadBase`](../lib/permissions.ts#L262) merges the
platform grants into the workspace result with no record of origin, and
`role.manage` is grantable in all three scopes. So `access.has("role.manage")`
holds in **every** workspace, including a suspended one; `assignmentCeiling`
returns `Infinity` without a workspace role of your own.

Effect: `platform_admin` (has `role.manage`, but explicitly **not**
`tenant.access`, and the layout locks them out of the tenant) can create,
rename, re-rank, and delete custom roles, and set arbitrary DENY entries,
in any foreign workspace. DENY is deliberately exempt from the grant rule —
that's lockout potential in other tenants.

Not reachable: project-local buckets, system roles, content permissions
(ALLOW is only `workspace.delete`/`role.manage`), any read access to
tenant content. Hence high, not critical.

**Fix:** in `requireTargetManage`, additionally require
`canEnterWorkspace(actorId, target.workspaceId)` for tenant buckets — or
have `loadBase` carry the origin along.

### 5. `projectRoleKeyFor` grants `manager` role management within the project (high)

[`lib/project-membership.ts:72`](../lib/project-membership.ts#L72) derives
the automatic project role from the workspace permissions:
`has("member.invite") || has("project.view.all")` → `project_admin`. And
`project_admin`'s ALLOW is `permissionsFor("PROJECT")` — which **includes
`role.manage`** (19 keys, verified via `bun run`).

The role `manager` is explicitly defined without `role.manage` in
[`lib/rbac/roles.ts:129`](../lib/rbac/roles.ts#L129) ("No role
management"), but carries `member.invite`. When a public project is
created, they're therefore entered as `project_admin` — and hold
`role.manage` there, i.e. project-local role management. The role
description says the opposite.

The derivation effectively decides the permissions of everyone newly added
and isn't documented in [rbac.md](rbac.md#project-visibility) — that only
says _who_ gets added, not _with which role_.

**Fix:** target the derivation at a project role between `project_admin`
and `contributor` without `role.manage`, or base the derivation on
`role.manage`/`project.view.all` instead of `member.invite`.

### 6. `acceptInvitation` ignores `hasPassword` (medium)

[`lib/invitations.ts:151`](../lib/invitations.ts#L151) supplies
`hasPassword`, but only the page
([`invite/[token]/page.tsx:31`](../app/[locale]/%28auth%29/invite/[token]/page.tsx#L31))
honors it. The action
[`acceptInvitation:127`](../features/auth/actions.ts#L127) overwrites the
`passwordHash` and name of any account an open token exists for.

That nobody gets hijacked by this today is luck of call ordering, not a
check: tokens are only created for freshly-created accounts without a
password. The moment inviting an existing account becomes possible, it's
an account takeover — and the guard sits at level 3, not level 1.

**Fix:** move the `hasPassword` check into the action.

### 7. Visibility switch depends only on the project-local permission (medium)

[`updateProject:177`](../features/projects/actions.ts#L177) checks
`project.update` in the project context. That lets a `project_admin`, with
no workspace-wide permission at all, switch a private project to `public`
— which per [rbac.md](rbac.md#project-visibility) adds **every** workspace
member and creates their membership rows. An operation with workspace
reach, authorized by a project permission.

### 8. `createRole` writes an unvalidated foreign workspace id (medium)

For `target = { scope: "PROJECT", workspaceId, projectId }`,
[`targetGuard`](../features/roles/scope.ts#L83) authorizes via
`{ projectId }`, but what gets written is
`ownerColumns(target).workspaceId` from the client argument
([`actions.ts:132`](../features/roles/actions.ts#L132)). The check that
`projectId` actually belongs to `workspaceId` is missing. The precondition
is cheap: `Workspace.id` is the freely-chosen slug, and
`suggestWorkspaceSlug` reveals which ones are taken.

No permission gain (the row doesn't show up in any bucket of the foreign
workspace), but a wrong cascade target: `Role_workspaceId_fkey` is
`ON DELETE CASCADE`, while `ProjectMember.role` is `RESTRICT` — the foreign
workspace then can no longer be deleted.

### 9. Project guests read the full member list (medium)

[`getMembers:123`](../features/issues/queries.ts#L123) only checks
`currentUserCanEnterWorkspace`. Path 3 of that function (project
membership without workspace membership) lets a `project_guest` through —
someone who, per the role description, is "invited from outside to
exactly this project." They receive the complete `WorkspaceMember` list
with name, handle, **email address**, role key, rank, and `pending`.

Visible under [`/[workspace]/members`](../app/[locale]/%28default%29/[workspace]/members/page.tsx)
(email in [`Members.tsx:112`](../features/admin/components/Members/Members.tsx#L112)),
in `/teams`, in the [`Topbar`](../features/issues/components/Topbar/Topbar.tsx),
and in the `@`-mention suggestions. Reachable because `getMe()` falls back
to the person's own account, so `notFound()` doesn't kick in.

There's no read key for this — `member.view` doesn't exist in the
registry. `getTeams` has the same pattern and additionally leaks the IDs of
invisible projects.

**Fix:** either a new key, or restrict the list for non-workspace-members to
the members of their visible projects — while keeping the `getMe()`
exception, otherwise guests would fall into 404.

### 10. `/admin/roles` reads without `role.manage` (low)

The two sibling pages check `role.manage` and throw `notFound()`;
[`admin/roles/page.tsx`](../app/[locale]/%28default%29/admin/roles/page.tsx)
only inherits `platform.access` from the layout. The cause runs deeper:
[`getRoleManagerView`](../features/roles/queries.ts#L32) loads roles
including their grants and `memberCount` **independent of** `canManage` —
only `manageable`, `grantable`, and `maxRank` are dampened.

Whoever has `platform.access` without `role.manage` (system role
`platform_support`) thereby sees every platform role, including permission
grants and carrier counts. Writing is airtight (`grantable` empty,
`maxRank = -Infinity`), and `platform_support` reads everything via
`tenant.access` anyway — hence low.

**Fix:** put the guard in `getRoleManagerView` itself, and it then applies
to all three routes.

### 11. Workspace-wide configuration is readable without entry (low)

`getStatuses`, `getPriorities`, `getIssueTypes`, `getRoles`, and
[`getWorkspace:83`](../features/issues/queries.ts#L83) check nothing;
[`getLabels:151`](../features/issues/queries.ts#L151) only filters the
project branch — `projectId: null` goes out even for an empty `visible`
set. `getRoles` thereby leaks the custom role names and ranks of any
workspace.

This is carried solely by the workspace layout — i.e. by the level
[rbac.md](rbac.md#enforcement) itself calls "not a security boundary." As
long as these functions only ever run from pages under that layout, it's
airtight; a call from a Server Action or a route handler would not be. The
shared bracket is
[`requireWorkspaceId`](../features/workspaces/queries.ts#L39), which
itself checks nothing.

### 12. Two admin queries without a guard (low)

[`getCurrentUser:51`](../features/admin/queries.ts#L51) and
[`getFirstWorkspaceId:107`](../features/admin/queries.ts#L107) check
neither `platform.access` nor self-reference — a call with someone else's
`userId` returns their email and platform role, or a workspace membership,
respectively. Both are currently called nowhere (dead exports); the
blanket promise in [rbac.md](rbac.md#enforcement) thus holds for 2 of 4
functions.

`getMyIssues`, `getInboxIssues`, and `getUserWorkspaces` have the same
latent shape — they compute visibility for the _passed-in_ user, not the
signed-in one. Today the session id is passed everywhere.

### 13. `suggestWorkspaceSlug` is an unauthenticated existence oracle (low)

[`features/workspaces/actions.ts:82`](../features/workspaces/actions.ts#L82)
— the only Server Action with no check of its own. The only boundary is
the session gate in the proxy, and per the Next docs that's explicitly not
a substitute: action IDs are globally resolvable, a POST via `/login` or
`/invite/<token>` bypasses it. The response reveals which slugs are
taken — pure meta information, a slug isn't a key (entry hinges on
`canEnterWorkspace`). Also without an upper bound:
`uniqueWorkspaceSlug` makes one query per taken variant, triggered on a
300ms debounce per keystroke.

**Fix:** two lines — a `currentUserId()` check plus an upper bound.

### 14. Open redirect via `callbackUrl` (low)

`callbackUrl` is never checked against being a relative path, and reaches
two sinks:
[`login/page.tsx:16`](../app/[locale]/%28auth%29/login/page.tsx#L16)
(`redirect` from `next/navigation`, follows absolute foreign URLs; `/login`
is public, and `//evil.example` also works here), and
[`actions.ts:39`](../features/auth/actions.ts#L39) → `router.push` in
[`LoginForm.tsx:43`](../features/auth/components/LoginForm/LoginForm.tsx#L43).
Auth.js's same-origin protection is bypassed because `signIn` runs with
`redirect: false` and no `redirectTo`.

No RBAC bypass, no cookie leak — phishing on a trustworthy-looking URL.
`javascript:` URLs are blocked by Next itself.

**Fix:** a `safeCallbackPath` helper, used at both sinks (only `/…`, not
`//` or `/\`).

### 15. `/api/logout` is a state-changing GET (low)

[`app/api/logout/route.ts`](../app/api/logout/route.ts) doesn't restrict
the method, and `next-auth` calls `signOut()` internally with
`skipCSRFCheck`. A foreign `<img src="/api/logout">` logs the user out.
An annoyance, not a permission problem.

### 16. Workspace settings and teams without a permission (low)

[`settings/page.tsx`](../app/[locale]/%28default%29/[workspace]/settings/page.tsx)
checks no `workspace.update`,
[`teams/page.tsx`](../app/[locale]/%28default%29/[workspace]/teams/page.tsx)
no `team.*` — both only `getMe()` → `notFound()` plus entry from the
layout. Harmless today, because neither page has a Server Action;
visibility hangs off a role name on the client (see
[section 5](#5-the-ui)). **The moment these pages get an action, the guard
is missing entirely.**

### 17. Workspace member management shows more than the action allows (low)

[`Members.tsx:134`](../features/admin/components/Members/Members.tsx#L134)
fills each row's role picker with `roles` — **all** roles, including
`owner` and ones above the actor's own rank. The pre-filtered
`assignableRoles` is only used for the invite dialog (line 57). The remove
button (line 167) only hinges on `can.remove` and "not myself", with no
rank comparison against the target.

`setMemberRole` and `removeMember` correctly reject these — so the UI
promises more than the action lets through. That's exactly the reverse of
the promise in [rbac.md](rbac.md#managing-members-three-permissions-not-one)
("shows exactly what the action also allows through"), which is honored at
the project level via the per-row `manageable`. That flag is missing at
the workspace level.

### 18. No error boundary, every `PermissionError` becomes a 500 (low)

Nowhere in the tree does an `error.tsx`, `not-found.tsx`,
`global-error.tsx`, or `app/layout.tsx` exist. A `PermissionError` from
`moveIssue`, `updateIssue`, `setMemberRole`, or `removeMember` therefore
falls through uncaught. Because 22 components simultaneously offer actions
with no flag ([section 5](#5-the-ui)), this is the normal case for
`project_viewer` and `blocked`, not the exception: visible button → click →
500.

Actions that return `RoleResult`/`ProjectResult` with `{ error }` aren't
affected — only the ones that throw.

---

## 9. What's demonstrably solid

91 of the 105 reported deficiencies were disproven. The most instructive:

- **The read path is consistently filtered.** Every claim that issues from
  invisible projects were reachable failed against `visibleProjectIds` /
  `accessibleProjectIds`, or against `project.view` in
  `getIssueById`/`getIssueByRef`.
- **Comments, labels, and mention suggestions** inherit the issue's check,
  or are cut to visible projects.
- **The project-guest branch** in `inviteProjectMember` is deliberately
  built that way, bounded by the resolver to that one project, and locked
  in by
  [`projectMembers.test.ts:437`](../tests/unit/projects/projectMembers.test.ts#L437)
  — not a deficiency.
- **The shared system roles** are untouchable across all four paths of
  `features/roles/actions.ts`.
- **`/invite/<token>`** is not an oracle: unknown, expired, used, and
  suspended all look the same.
- **`app/api/issues/[id]`** responds 404, not 403, for a missing
  permission.
- **No component** calls `getAccess` or `hasPermission` itself.
- **No role id is ever parsed.**
- **No context comes from the client where it counts:** `projectId` comes
  from the DB in the issue actions, `reporterId`/`authorId` from the
  session, and a project label's `workspaceId` is re-derived from the
  project.

---

## 10. Comparison with `docs/rbac.md`

**Correct:** the enforcement level model; all seven rows of the "The read
path checks too" table, including "fail empty instead of throwing"; all
five rows of the "How the UI finds out" flag table; the three implicit
rules; `tenant.access`; the rank hierarchy and `assignmentCeiling`; the
three separate `member.*` permissions; the four escalation rules of role
management; the role-routes table; 15 system roles with 212
`RolePermission` rows (recounted); the `CHECK` constraint and the partial
unique indexes; and every test file named in `rbac.md` exists.

**Outdated or too optimistic:**

| Promise in `rbac.md`                                                         | Reality                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "in the workspace (`features/issues/actions.ts`)" for the `member.*` actions | Wrong path — they live in [`features/workspaces/actions.ts`](../features/workspaces/actions.ts#L191); `features/issues/actions.ts` has no `member.*` guard                                                               |
| "No role names appear in the code anymore"                                   | `Settings.tsx:23`, `Teams.tsx:20`, `Members.tsx:49`, `InviteMemberModal.tsx:48`                                                                                                                                          |
| "No component checks for itself — every one receives ready-made flags"       | First half holds (0 of 56); 22 components get **no** flags and render the action anyway                                                                                                                                  |
| "shows exactly what the action also allows through"                          | True at the project level; at the workspace level the UI shows **more** ([finding 17](#17-workspace-member-management-shows-more-than-the-action-allows-low))                                                            |
| Flag names `canAdd`/`canSetRole`/`canRemove` for both levels                 | At the workspace level they're named `can.invite`/`can.setRole`/`can.remove`                                                                                                                                             |
| "the queries in `features/admin/queries.ts` check again themselves"          | 2 of 4                                                                                                                                                                                                                   |
| "foreign key set to `RESTRICT`"                                              | Only workspace and project roles ([schema.prisma:140/194](../prisma/schema.prisma#L140)); `User.platformRole` is `onDelete: SetNull` ([:76](../prisma/schema.prisma#L76)) — there, only the app's upfront check stops it |
| PLATFORM "governs … accounts, suspending workspaces"                         | Neither feature exists: `user.manage` and `workspace.suspend` have no guard and no action, `Workspace.suspended` is only read                                                                                            |
| `manager` "without `role.manage`"                                            | It does have it in the project context, via `projectRoleKeyFor` → `project_admin` ([finding 5](#5-projectrolekeyfor-grants-manager-role-management-within-the-project-high))                                             |

**Not documented:** that 13 of the 34 keys have no enforcement point; that
`project/[projectSlug]/layout.tsx` has no `project.view` guard; that
`getMe()` falls back to the person's own account, so `if (!me) notFound()`
doesn't enforce membership; that entry to the member list includes email
addresses; that navigation isn't filtered by permission; that
`projectRoleKeyFor` decides the starting role in a project; and that
there's no error boundary.

**Side finding, code vs. schema:** [`lib/permissions.ts:141`](../lib/permissions.ts#L141)
describes "a row without `roleId`" in `ProjectMember`, but
[`schema.prisma:190`](../prisma/schema.prisma#L190) has `roleId String`
(NOT NULL) — that case can't occur, the comment is misleading.

---

## 11. Test coverage

32 test files, 442 tests. Relevant to permissions:

| Surface                                                                                | Tests | File                                                                                               |
| -------------------------------------------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------- |
| Resolver (replacement, DENY, `tenant.access`, implicit rules, entry, visible projects) |    39 | [`permissions/resolver.test.ts`](../tests/unit/permissions/resolver.test.ts)                       |
| Project members (three permissions, rank, self-reference)                              |    30 | [`projects/projectMembers.test.ts`](../tests/unit/projects/projectMembers.test.ts)                 |
| Registry (flat keys, scopes, roles internally consistent)                              |    26 | [`permissions/rbac.test.ts`](../tests/unit/permissions/rbac.test.ts)                               |
| Role management (shared roles, rank, no escalation)                                    |    25 | [`permissions/roleActions.test.ts`](../tests/unit/permissions/roleActions.test.ts)                 |
| `createProject`                                                                        |    16 | [`projects/createProject.test.ts`](../tests/unit/projects/createProject.test.ts)                   |
| Invitations (token, deadline, validity)                                                |    15 | [`invitations/invitations.test.ts`](../tests/unit/invitations/invitations.test.ts)                 |
| Project settings, visibility                                                           |    14 | [`projects/projectSettings.test.ts`](../tests/unit/projects/projectSettings.test.ts)               |
| Project membership (joining/leaving)                                                   |    13 | [`projects/projectMembership.test.ts`](../tests/unit/projects/projectMembership.test.ts)           |
| Accepting an invitation                                                                |    11 | [`auth/acceptInvitation.test.ts`](../tests/unit/auth/acceptInvitation.test.ts)                     |
| `createLabel`                                                                          |    11 | [`issues/createLabel.test.ts`](../tests/unit/issues/createLabel.test.ts)                           |
| Workspace invitation, rank limit                                                       |    11 | [`workspace/inviteWorkspaceMember.test.ts`](../tests/unit/workspace/inviteWorkspaceMember.test.ts) |
| "New issue" triggers (level 3)                                                         |    10 | [`ui/issueCreateButtons.test.tsx`](../tests/unit/ui/issueCreateButtons.test.tsx)                   |
| Proxy / middleware                                                                     |     9 | [`proxy/proxy.test.ts`](../tests/unit/proxy/proxy.test.ts)                                         |
| `creatableProjectIds`                                                                  |     5 | [`issues/composerData.test.ts`](../tests/unit/issues/composerData.test.ts)                         |

**The biggest gap:** the issue actions (`moveIssue`, `reorderIssue`,
`updateIssue`, `createIssue`, `deleteIssue`, `addComment`, `deleteComment`)
have **no dedicated test file**. The `.own`/`.any` pairs and the
`issue.assign` gate — i.e. the system's most frequently executed guards —
are locked in nowhere. Also untested: the read path
(`getIssuesByProject`, `getIssueByRef`, `getSearchIssues`),
`app/api/issues/[id]`, the project button (the issue equivalent has
tests), and navigation filtering.

[`roleActions.test.ts:262`](../tests/unit/permissions/roleActions.test.ts#L262)
locks in the faulty behavior from
[finding 3](#3-setrolegrant-deletes-a-deny-unchecked-high) and has to
change alongside the fix.

Always invoke with `bun run test`, never `bun test` (module cache, see
CLAUDE.md).

---

## 12. Recommended order

1. **[Finding 3](#3-setrolegrant-deletes-a-deny-unchecked-high)** — four
   lines, closes the only self-promotion path. Update the test alongside
   it.
2. **[Finding 5](#5-projectrolekeyfor-grants-manager-role-management-within-the-project-high)** —
   affects every workspace with a `manager` and public projects, i.e. the
   default case.
3. **[Finding 1](#1-createissue-bypasses-the-assign-gate-high)** and
   **[Finding 2](#2-inviteprojectmember-creates-a-workspace-role-without-a-rank-limit-high)** —
   one line each, both are symmetry bugs relative to their sibling action.
4. **[Finding 4](#4-platform_admin-manages-roles-in-any-foreign-workspace-high)** —
   one line in `requireTargetManage`.
5. **[Finding 9](#9-project-guests-read-the-full-member-list-medium)** —
   needs a decision: a new key `member.view`, or restricting to shared
   projects.
6. **[Finding 18](#18-no-error-boundary-every-permissionerror-becomes-a-500-low)** —
   one `error.tsx` per route group, after which the missing UI flags become
   tolerable instead of ugly.
7. **Tests for the issue actions** — the untested surface with the most
   traffic.
8. Extend the level-3 flags and `lib/nav.ts` with a `permission` field;
   replace the three role-name comparisons.

---

## Method

11 parallel readers across the surface groups, each reported deficiency
then checked by a separate agent tasked with **disproving** it (call chain
up and down, implicit resolver rules, existing tests). 105 claims, 91
disproven, 14 confirmed; two further findings came from the doc comparison
and one from the completeness check. 118 agents total.

Completeness cross-checked via `grep -rl '"use server"'` (exactly 5
files), every exported function per `actions.ts`/`queries.ts`, every
router file, every `db.` access outside `queries.ts`/`actions.ts`, and a
search for inline `"use server"` in `.tsx` (none) — no permission-relevant
surface was missing.

Manually verified: key coverage (34 declared, 13 without an enforcement
point), `setRoleGrant`'s `null` path, `createIssue` without `issue.assign`,
`requireTargetManage`'s context from the client argument,
`permissionsFor("PROJECT").includes("role.manage")` (via `bun run`), the
role names in `Settings.tsx`/`Teams.tsx`/`Members.tsx`, `roles` vs.
`assignableRoles` in the role picker, the absence of any `error.tsx`, the
`onDelete` rules in `schema.prisma`, the line numbers in
`lib/invitations.ts`, the missing actions for
`workspace.*`/`team.*`/`label.update|delete`, and the four layouts.
