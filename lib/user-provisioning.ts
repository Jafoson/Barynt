// ─── Account creation: domain auto-join ────────────────────────────────────
//
// What happens the moment an account exists for the first time —
// regardless of which path (password before, magic link/OIDC/passkey/LDAP
// going forward). If the address's domain matches a workspace claimed via
// `addWorkspaceDomain()`, the account joins it immediately, with no invite
// link and no `pending` — the same rule as before in `register()`, now in
// one place instead of one per sign-in method.

import type { Prisma } from "@/lib/generated/prisma/client";
import { enrollInWorkspaceProjects } from "@/lib/project-membership";
import { DEFAULT_WORKSPACE_ROLE_KEY, systemRoleId } from "@/lib/rbac";

/** Fits the Prisma client just as well as a transaction client. */
type Db = Prisma.TransactionClient;

/**
 * Adds an account to a workspace as an ordinary member and enrolls it into
 * the workspace's public projects — the join step shared by domain
 * auto-join (below) and the "no workspace, creation is off" fallback in
 * `app/[locale]/page.tsx`.
 */
export async function joinWorkspaceAsMember(
  db: Db,
  data: { workspaceId: string; userId: string },
): Promise<void> {
  await db.workspaceMember.create({
    data: {
      workspaceId: data.workspaceId,
      userId: data.userId,
      roleId: systemRoleId("WORKSPACE", DEFAULT_WORKSPACE_ROLE_KEY),
      pending: false,
    },
  });
  await enrollInWorkspaceProjects(db, data);
}

/**
 * True only for the very first account ever created on this instance —
 * checked right before `db.user.create()` in `auth.ts`'s `createUser()`, the
 * one hook every sign-in method (passkey, OAuth/OIDC, magic link) goes
 * through. A fresh self-hosted deployment otherwise has no way to ever reach
 * `platform_admin`: every account starts as `platform_member`, and nothing
 * short of a manual database edit could promote one — `prisma/bootstrap.ts`
 * seeds the *system* data (statuses, RBAC roles), never a person.
 *
 * A `count()` right before `create()` isn't transactionally atomic, but two
 * people registering in the exact instant a brand-new instance goes live is
 * not a real-world race worth guarding against here — the failure mode
 * (both become admin) isn't a security hole, just a shared first login.
 */
export async function isFirstAccount(db: Db): Promise<boolean> {
  return (await db.user.count()) === 0;
}

/**
 * Assigns a freshly created account to a workspace if its email domain is
 * claimed. No match means: nothing to do, the account stays without a
 * workspace for now (`/create-workspace`, or the default workspace if
 * creation is off — see `lib/system-settings.ts`).
 */
export async function provisionNewUser(
  db: Db,
  data: { userId: string; email: string },
): Promise<void> {
  const domain = data.email.split("@")[1] ?? "";

  const claim = await db.workspaceDomain.findUnique({
    where: { domain },
    select: { workspaceId: true },
  });
  if (!claim) return;

  await joinWorkspaceAsMember(db, {
    workspaceId: claim.workspaceId,
    userId: data.userId,
  });
}
