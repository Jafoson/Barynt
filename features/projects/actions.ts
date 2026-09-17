"use server";

import { revalidatePath } from "next/cache";
import {
  DEFAULT_HIDDEN_DETAIL_FIELDS,
  detailFieldDef,
  isDetailFieldKey,
} from "@/features/projects/detail-fields";
import {
  getPendingProjectInvitationsView,
  getProjectLabelsView,
  getProjectMembersView,
  getProjectsOverview,
  type ProjectOverviewRow,
} from "@/features/projects/queries";
import type {
  ProjectLabelRow,
  ProjectMemberRow,
  ProjectVisibility,
} from "@/features/projects/types";
import type { PendingInvitationRow } from "@/features/workspaces/types";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { createInvitation, invitationUrl } from "@/lib/invitations";
import { createInviteLink, inviteLinkUrl } from "@/lib/invite-links";
import {
  isMailConfigured,
  sendInvitationEmail,
  sendMemberRemovedEmail,
} from "@/lib/mail";
import { notify } from "@/lib/notify";
import {
  accessFor,
  assignmentCeiling,
  can,
  currentUserId,
  hasPermission,
} from "@/lib/permissions";
import {
  enrollInWorkspaceProjects,
  enrollMember,
  enrollWorkspaceMembers,
} from "@/lib/project-membership";
import {
  DEFAULT_PLATFORM_ROLE_KEY,
  DEFAULT_WORKSPACE_ROLE_KEY,
  PROJECT_GUEST_ROLE_KEY,
  systemRoleId,
} from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { slugify } from "@/lib/slug";
import {
  deleteAvatarObject,
  finalizeAvatarUpload,
  requestAvatarUpload,
} from "@/lib/storage";
import { generateHandle, pickUserColor } from "@/lib/user-defaults";
import { uid } from "@/lib/utils/id";

/**
 * `inviteUrl` is only present when inviting an unknown address: that creates
 * an account without a password, and the link is the only way in. `mailSent`
 * tells the UI whether the invitation also went out by mail (SMTP
 * configured) — without that, the link is the only way in, and the message
 * needs to say so accordingly.
 */
type ProjectResult =
  | { ok: true; inviteUrl?: string; mailSent?: boolean }
  | { error: string };

function basePrefix(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 4) || "PROJ"
  );
}

async function uniquePrefix(
  workspaceId: string,
  base: string,
): Promise<string> {
  let prefix = base;
  let n = 0;
  while (
    await db.project.findUnique({
      where: { workspaceId_prefix: { workspaceId, prefix } },
      select: { id: true },
    })
  ) {
    const suffix = String(++n);
    prefix = `${base.slice(0, 4 - suffix.length)}${suffix}`;
  }
  return prefix;
}

async function uniqueSlug(workspaceId: string, base: string): Promise<string> {
  let slug = base || "project";
  let n = 0;
  while (
    await db.project.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    })
  ) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

export async function createProject(data: {
  workspaceId: string;
  name: string;
  /** A sentence about what it's for. Optional — empty is a valid value. */
  desc?: string;
  prefix?: string;
  color: string;
  visibility?: ProjectVisibility;
}): Promise<ProjectResult> {
  const session = await getSession();
  if (!session) return { error: "You must be logged in." };

  const name = data.name.trim();
  if (!name) return { error: "Name is required." };

  const allowed = await hasPermission("project.create", {
    workspaceId: data.workspaceId,
  });
  if (!allowed)
    return { error: "You are not allowed to create projects here." };

  const visibility: ProjectVisibility =
    data.visibility === "private" ? "private" : "public";

  const desired =
    (data.prefix?.trim() || basePrefix(name))
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 4) || basePrefix(name);
  const prefix = await uniquePrefix(data.workspaceId, desired);
  const slug = await uniqueSlug(data.workspaceId, slugify(name));
  const id = uid("p");

  await db.$transaction(async (tx) => {
    await tx.project.create({
      data: {
        id,
        workspaceId: data.workspaceId,
        name,
        desc: data.desc?.trim() ?? "",
        slug,
        prefix,
        color: data.color,
        visibility,
        // Every new project starts with the same field configuration
        // (BARY-31) — the planning fields hidden, everything else shown.
        hiddenDetailFields: DEFAULT_HIDDEN_DETAIL_FIELDS,
        // Who created it stays on record. Not as a permission — access comes
        // solely from `ProjectMember` — but as an ownership marker: if this
        // account disappears, platform administration recognizes the project
        // as orphaned (`features/admin/queries.ts`).
        createdById: session.userId,
      },
    });

    const project = { id, workspaceId: data.workspaceId };
    // A public project enrolls everyone who is in the workspace — the entry
    // records that, including for the creator. A private one only gets them;
    // everyone else is enrolled explicitly.
    if (visibility === "private") {
      await enrollMember(tx, project, session.userId);
    } else {
      await enrollWorkspaceMembers(tx, project);
    }
  });

  await recordAudit({
    action: "project.created",
    actorId: session.userId,
    target: { type: "project", id, label: name },
    workspaceId: data.workspaceId,
    projectId: id,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Update and delete project ─────────────────────────────────────────────

/** Checks a project permission and also returns the project's workspace. */
async function requireProjectManage(
  projectId: string,
  permission: "project.update" | "project.delete",
): Promise<
  | {
      workspaceId: string;
      actorId: string;
      name: string;
      visibility: ProjectVisibility;
    }
  | { error: string }
> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true, name: true, visibility: true },
  });
  if (!project) return { error: "This project no longer exists." };

  if (!(await can(actorId, permission, { projectId }))) {
    return {
      error:
        permission === "project.delete"
          ? "You are not allowed to delete this project."
          : "You are not allowed to change this project.",
    };
  }

  return {
    workspaceId: project.workspaceId,
    actorId,
    name: project.name,
    visibility: project.visibility,
  };
}

/**
 * Name, prefix, color, and visibility of a project.
 *
 * The slug stays as it is: it appears in every shared address, and a renamed
 * project shouldn't leave dead links behind.
 *
 * Switching to `public` enrolls all workspace members — that's what public
 * means. Switching back takes nothing away from anyone: whoever is in stays
 * in, only new members no longer join automatically. Removing someone is a
 * separate action (`removeProjectMember`), not a side effect of a toggle.
 */
export async function updateProject(
  projectId: string,
  data: {
    name?: string;
    desc?: string;
    prefix?: string;
    color?: string;
    visibility?: ProjectVisibility;
  },
): Promise<ProjectResult> {
  const guard = await requireProjectManage(projectId, "project.update");
  if ("error" in guard) return guard;

  const name = data.name?.trim();
  if (name !== undefined && !name) return { error: "Name is required." };

  let prefix: string | undefined;
  if (data.prefix !== undefined) {
    prefix = data.prefix
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 4);
    if (!prefix) return { error: "The identifier cannot be empty." };

    // On creation, `uniquePrefix` silently appends a digit. Here that would
    // be wrong: someone who explicitly enters a prefix should be told it's
    // taken instead of quietly getting a different one.
    const taken = await db.project.findUnique({
      where: { workspaceId_prefix: { workspaceId: guard.workspaceId, prefix } },
      select: { id: true },
    });
    if (taken && taken.id !== projectId)
      return {
        error: "Another project in this workspace uses that identifier.",
      };
  }

  const project = await db.project.update({
    where: { id: projectId },
    data: {
      ...(name !== undefined ? { name } : {}),
      // Unlike the name, this is allowed to become empty — whoever clears it means it.
      ...(data.desc !== undefined ? { desc: data.desc.trim() } : {}),
      ...(prefix !== undefined ? { prefix } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
    },
    select: { id: true, workspaceId: true, name: true },
  });

  if (data.visibility === "public") {
    await enrollWorkspaceMembers(db, project);
  }

  // A distinct action instead of a generic "project.updated": only visibility
  // matters in the workspace activity feed (`whereFor` in
  // `lib/audit/index.ts`), name/color/prefix are pure project cosmetics.
  if (data.visibility !== undefined && guard.visibility !== data.visibility) {
    await recordAudit({
      action: "project.visibility.changed",
      actorId: guard.actorId,
      target: { type: "project", id: projectId, label: project.name },
      workspaceId: project.workspaceId,
      projectId,
      meta: { from: guard.visibility, to: data.visibility },
    });
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Which issue-detail fields this project shows (BARY-31).
 *
 * Writes on every toggle, same as the visibility control above — a switch
 * whose position only takes effect via a separate "Save" would show
 * something incorrect in the meantime. `description` is filtered out even
 * if the caller (a stale client, a bug) sends it: it can't be turned off,
 * full stop, not just hidden from the toggle list.
 */
export async function setProjectFieldVisibility(
  projectId: string,
  hidden: string[],
): Promise<ProjectResult> {
  const guard = await requireProjectManage(projectId, "project.update");
  if ("error" in guard) return guard;

  await db.project.update({
    where: { id: projectId },
    data: {
      hiddenDetailFields: hidden.filter(
        (key) => isDetailFieldKey(key) && !detailFieldDef(key).permanent,
      ),
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

type AvatarResult = { ok: true } | { error: string };

type UploadUrlResult =
  | { ok: true; key: string; uploadUrl: string }
  | { error: string };

/** First step of the project avatar upload: presigned PUT URL, directly
 *  against S3, following the same pattern as `requestWorkspaceAvatarUploadUrl`. */
export async function requestProjectAvatarUploadUrl(
  projectId: string,
  input: { contentType: string; contentLength: number },
): Promise<UploadUrlResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "project.update", { projectId })))
    return { error: "You are not allowed to change this project." };

  return requestAvatarUpload({
    kind: "project",
    ownerId: projectId,
    ...input,
  });
}

export async function confirmProjectAvatarUpload(
  projectId: string,
  key: string,
): Promise<AvatarResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "project.update", { projectId })))
    return { error: "You are not allowed to change this project." };

  const result = await finalizeAvatarUpload("project", projectId, key);
  if ("error" in result) return result;

  const previous = await db.project.findUnique({
    where: { id: projectId },
    select: { avatarKey: true },
  });
  await db.project.update({
    where: { id: projectId },
    data: { avatarKey: key },
  });
  await deleteAvatarObject(previous?.avatarKey);

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeProjectAvatar(
  projectId: string,
): Promise<AvatarResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "project.update", { projectId })))
    return { error: "You are not allowed to change this project." };

  const previous = await db.project.findUnique({
    where: { id: projectId },
    select: { avatarKey: true },
  });
  await db.project.update({
    where: { id: projectId },
    data: { avatarKey: null },
  });
  await deleteAvatarObject(previous?.avatarKey);

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Deletes a project along with everything attached to it.
 *
 * The issues go first: their foreign key is set to `Restrict`, so the
 * project couldn't be deleted otherwise. Comments, project members, labels,
 * and project-local roles cascade on their own.
 */
export async function deleteProject(projectId: string): Promise<ProjectResult> {
  const guard = await requireProjectManage(projectId, "project.delete");
  if ("error" in guard) return guard;

  // Read before deletion — afterward there'd be no way to say what's gone.
  const doomed = await db.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      workspaceId: true,
      _count: { select: { issues: true, members: true } },
    },
  });

  await db.$transaction(async (tx) => {
    await tx.issue.deleteMany({ where: { projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });

  await recordAudit({
    action: "project.deleted",
    actorId: guard.actorId,
    target: {
      type: "project",
      id: projectId,
      label: doomed?.name ?? projectId,
    },
    workspaceId: doomed?.workspaceId ?? null,
    projectId,
    meta: {
      issues: doomed?._count.issues ?? 0,
      members: doomed?._count.members ?? 0,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Project members ────────────────────────────────────────────────────────
//
// These actions return errors instead of throwing: they're wired up to forms
// and table rows that are meant to display the cause directly. The checks
// mirror `setMemberRole` at the workspace level — nobody assigns a role above
// their own, and nobody touches a member ranked higher than themselves.
//
// Everyone in the project has a row in `ProjectMember` and thus a project
// role (see `lib/project-membership.ts`). These actions manage that role —
// it applies only here and leaves the workspace untouched.

interface MemberGuard {
  workspaceId: string;
  projectId: string;
  actorId: string;
  /** Highest project rank the actor is allowed to assign. */
  actorRank: number;
}

/**
 * The three member permissions are grantable separately, so each action
 * checks its own: enroll (`member.invite`), re-role (`member.role.update`),
 * remove (`member.remove`). Permission for one of these is not permission
 * for the others — the workspace path in `features/issues/actions.ts` follows
 * the same rule.
 */
type MemberPermission =
  | "member.invite"
  | "member.remove"
  | "member.role.update";

async function requireMemberManage(
  projectId: string,
  permission: MemberPermission,
): Promise<MemberGuard | { error: string }> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project) return { error: "This project no longer exists." };

  const access = await accessFor(actorId, { projectId });
  if (!access.has(permission))
    return { error: "You are not allowed to manage members of this project." };

  return {
    workspaceId: project.workspaceId,
    projectId,
    actorId,
    actorRank: assignmentCeiling(access, "PROJECT"),
  };
}

/**
 * Resolve the role that is to be assigned in this project.
 *
 * Assignable are the workspace's project roles (apply to all its projects)
 * and the project-local roles of exactly this project. Nobody assigns
 * anything above their own rank.
 */
async function resolveAssignable(
  guard: MemberGuard,
  roleKey: string,
): Promise<{ id: string; rank: number; name: string } | { error: string }> {
  if (!roleKey) return { error: "Pick a valid role." };

  const role = await db.role.findFirst({
    where: {
      scope: "PROJECT",
      key: roleKey,
      OR: [
        { system: true },
        { workspaceId: guard.workspaceId, projectId: null },
        { projectId: guard.projectId },
      ],
    },
    select: { id: true, rank: true, name: true },
    // The most specific role wins if several share the same key:
    // project-local before workspace-wide before shared/system. `nulls: "last"`
    // is needed because Postgres would otherwise put NULL first on DESC.
    orderBy: [
      { projectId: { sort: "desc", nulls: "last" } },
      { workspaceId: { sort: "desc", nulls: "last" } },
    ],
  });
  if (!role) return { error: "Pick a valid role." };
  if (role.rank > guard.actorRank)
    return { error: "You cannot assign a role above your own." };

  return role;
}

/**
 * Whoever holds the workspace's master key (Owner, Admin, Project Lead)
 * cannot be downgraded via a project role — the resolver decides for them
 * before the project role is even loaded (rule 3 in lib/permissions.ts).
 * Changing this row would only assert something in the table that doesn't
 * actually hold.
 */
async function notDowngradable(
  guard: MemberGuard,
  userId: string,
): Promise<boolean> {
  return can(userId, "project.admin.all", { workspaceId: guard.workspaceId });
}

/** Enrolls existing workspace members with their own project role. */
export async function addProjectMembers(data: {
  projectId: string;
  userIds: string[];
  role: string;
}): Promise<ProjectResult> {
  const guard = await requireMemberManage(data.projectId, "member.invite");
  if ("error" in guard) return guard;

  const role = await resolveAssignable(guard, data.role);
  if ("error" in role) return role;

  const userIds = [...new Set(data.userIds)];
  if (userIds.length === 0) return { error: "Pick at least one member." };

  // Only someone already in the workspace can be added directly. Everyone
  // else goes through `inviteProjectMember` — that's also where the account
  // gets created.
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: guard.workspaceId, userId: { in: userIds } },
    select: { userId: true },
  });
  if (members.length !== userIds.length)
    return { error: "Some of those people are not in this workspace." };

  // Anyone already in the project would otherwise incorrectly get an "invite"
  // notification for an enrollment that isn't one.
  const already = await db.projectMember.findMany({
    where: { projectId: data.projectId, userId: { in: userIds } },
    select: { userId: true },
  });
  const alreadyIds = new Set(already.map((m) => m.userId));
  const newlyAdded = userIds.filter((id) => !alreadyIds.has(id));

  await db.projectMember.createMany({
    data: userIds.map((userId) => ({
      projectId: data.projectId,
      userId,
      roleId: role.id,
      // Explicitly assigned by a project lead — a team sync no longer touches
      // this row afterward (`origin`, see schema.prisma).
      origin: "manual",
    })),
    // Anyone who already has a role in this project keeps it — a double-click
    // shouldn't overwrite it. Use `setProjectMemberRole` to change it.
    skipDuplicates: true,
  });

  await notify(
    newlyAdded.map((userId) => ({
      userId,
      type: "invite" as const,
      actorId: guard.actorId,
      workspaceId: guard.workspaceId,
      projectId: data.projectId,
      text: role.name,
    })),
  );

  // Thanks to both `workspaceId` **and** `projectId` being set, this appears
  // in both the project's and the workspace's activity feed — exactly the
  // question "who added whom to which project."
  const addedUsers = await db.user.findMany({
    where: { id: { in: newlyAdded } },
    select: { id: true, firstName: true, lastName: true, color: true },
  });
  for (const user of addedUsers) {
    await recordAudit({
      action: "project.member.added",
      actorId: guard.actorId,
      target: {
        type: "user",
        id: user.id,
        label: `${user.firstName} ${user.lastName}`.trim(),
      },
      personColor: user.color,
      workspaceId: guard.workspaceId,
      projectId: data.projectId,
      meta: { role: role.name },
    });
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setProjectMemberRole(
  projectId: string,
  userId: string,
  roleKey: string,
): Promise<ProjectResult> {
  const guard = await requireMemberManage(projectId, "member.role.update");
  if ("error" in guard) return guard;

  // Nobody changes their own role through this table — otherwise the rank
  // comparison below would be a check against oneself.
  if (userId === guard.actorId)
    return { error: "You cannot change your own role here." };

  const role = await resolveAssignable(guard, roleKey);
  if ("error" in role) return role;

  const target = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: { select: { rank: true } } },
  });
  if (!target) return { error: "This person is not a member of the project." };
  if (target.role.rank > guard.actorRank)
    return { error: "You cannot change a member ranked above you." };
  if (await notDowngradable(guard, userId))
    return {
      error: "This member has full access to every project of the workspace.",
    };

  await db.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    // `origin: "manual"` even if the row was previously `team` — a project
    // lead explicitly setting a role here overrides the team assignment
    // permanently, not just until the next team sync.
    data: { roleId: role.id, origin: "manual" },
  });

  await notify({
    userId,
    type: "role",
    actorId: guard.actorId,
    workspaceId: guard.workspaceId,
    projectId,
    text: role.name,
  });

  const changedUser = await db.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, color: true },
  });
  await recordAudit({
    action: "project.member.role.changed",
    actorId: guard.actorId,
    target: {
      type: "user",
      id: userId,
      label: changedUser
        ? `${changedUser.firstName} ${changedUser.lastName}`.trim()
        : userId,
    },
    personColor: changedUser?.color ?? null,
    workspaceId: guard.workspaceId,
    projectId,
    meta: { to: role.name },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Removes someone from the project.
 *
 * This takes away access, not just a special role: this table is the sole
 * decider for the project. Workspace membership stays intact — whoever
 * should collaborate again gets re-enrolled. Workspace owners and admins
 * can't be locked out this way, since their rights don't depend on the
 * project entry (`keepsProjectRights` in lib/permissions.ts).
 */
export async function removeProjectMember(
  projectId: string,
  userId: string,
): Promise<ProjectResult> {
  const guard = await requireMemberManage(projectId, "member.remove");
  if ("error" in guard) return guard;

  // You don't remove yourself: that would mean losing your own access with a
  // single click, and with no way back.
  if (userId === guard.actorId)
    return { error: "You cannot remove yourself from the project." };

  const target = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: {
      role: { select: { rank: true } },
      user: { select: { firstName: true, lastName: true, color: true } },
    },
  });
  if (!target) return { error: "This person is not a member of the project." };
  if (target.role.rank > guard.actorRank)
    return { error: "You cannot remove a member ranked above you." };
  if (await notDowngradable(guard, userId))
    return {
      error: "This member has full access to every project of the workspace.",
    };

  await db.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });

  // No `notify()` — workspace membership stays intact, but there's no
  // `NotificationEvent` for “removed from the project,” only the email.
  await sendMemberRemovedEmail({
    userId,
    workspaceId: guard.workspaceId,
    projectId,
    actorId: guard.actorId,
  });

  await recordAudit({
    action: "project.member.removed",
    actorId: guard.actorId,
    target: {
      type: "user",
      id: userId,
      label: `${target.user.firstName} ${target.user.lastName}`.trim(),
    },
    personColor: target.user.color,
    workspaceId: guard.workspaceId,
    projectId,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Upper limit per call — the only safeguard available as long as this repo
 *  has no rate limiting (neither here nor anywhere else). */
const MAX_BULK_PROJECT_INVITES = 50;

type BulkProjectInviteRow = { email: string; result: ProjectResult };
type BulkProjectInviteResult =
  | { rows: BulkProjectInviteRow[] }
  | { error: string };

/**
 * Invites someone into the project by email. Thin wrapper around
 * `inviteProjectMembers` for a single address.
 */
export async function inviteProjectMember(data: {
  projectId: string;
  email: string;
  role: string;
}): Promise<ProjectResult> {
  const result = await inviteProjectMembers({
    projectId: data.projectId,
    emails: [data.email],
    role: data.role,
  });
  if ("error" in result) return result;
  // `emails: [data.email]` yields exactly one row.
  return (result.rows[0] as BulkProjectInviteRow).result;
}

/**
 * Invites multiple addresses into the project at once.
 *
 * Role resolution and the workspace-side `member.invite` check (needed for
 * the new-account branch, see `inviteOneProjectMember`) run once before the
 * loop instead of per address — the same reasoning as in
 * `inviteWorkspaceMembers`.
 */
export async function inviteProjectMembers(data: {
  projectId: string;
  emails: string[];
  role: string;
}): Promise<BulkProjectInviteResult> {
  const guard = await requireMemberManage(data.projectId, "member.invite");
  if ("error" in guard) return guard;

  const role = await resolveAssignable(guard, data.role);
  if ("error" in role) return role;

  const emails = [...new Set(data.emails.map((e) => e.trim().toLowerCase()))];
  if (emails.length === 0) return { error: "Add at least one email address." };
  if (emails.length > MAX_BULK_PROJECT_INVITES)
    return {
      error: `You can invite at most ${MAX_BULK_PROJECT_INVITES} people at once.`,
    };

  // Only relevant for the new-account branch, but independent of the
  // specific email — checked once instead of per address.
  const canInviteToWorkspace = await can(guard.actorId, "member.invite", {
    workspaceId: guard.workspaceId,
  });

  const rows: BulkProjectInviteRow[] = [];
  for (const email of emails) {
    rows.push({
      email,
      result: await inviteOneProjectMember({
        projectId: data.projectId,
        email,
        roleKey: data.role,
        guard,
        role,
        canInviteToWorkspace,
      }),
    });
  }

  revalidatePath("/", "layout");
  return { rows };
}

/**
 * Invite a single address into the project — the body that
 * `inviteProjectMembers` repeats per email. Role and permission are already
 * resolved by this point.
 *
 * If the account already exists, `member.invite` in the project is enough —
 * only a project entry is created. For an unknown address an account has to
 * be created; that's a workspace operation and additionally requires
 * `member.invite` in the workspace context (`canInviteToWorkspace`).
 *
 * The project role decides workspace membership: a guest is deliberately
 * left out and only sees this one project, every other role also gets an
 * open (`pending`) workspace membership in the default role. Since the
 * three-tier RBAC, project and workspace roles are two separate pools — so
 * the project role's key doesn't work as a workspace role here.
 */
async function inviteOneProjectMember(params: {
  projectId: string;
  email: string;
  roleKey: string;
  guard: MemberGuard;
  role: { id: string; rank: number; name: string };
  canInviteToWorkspace: boolean;
}): Promise<ProjectResult> {
  const { projectId, email, roleKey, guard, role, canInviteToWorkspace } =
    params;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Please enter a valid email address." };

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, firstName: true, lastName: true, color: true },
  });

  if (existing) {
    const member = await db.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId: existing.id },
      },
      select: { userId: true },
    });
    if (member) return { error: "This person is already in the project." };

    await db.projectMember.create({
      data: {
        projectId,
        userId: existing.id,
        roleId: role.id,
        origin: "manual",
      },
    });

    // As in `inviteWorkspaceMember`: only someone who already has an account
    // can log in and see an in-app notification — the new-account branch
    // below only creates an invitation link.
    await notify({
      userId: existing.id,
      type: "invite",
      actorId: guard.actorId,
      workspaceId: guard.workspaceId,
      projectId,
      text: role.name,
    });

    await recordAudit({
      action: "project.member.added",
      actorId: guard.actorId,
      target: {
        type: "user",
        id: existing.id,
        label: `${existing.firstName} ${existing.lastName}`.trim(),
      },
      personColor: existing.color,
      workspaceId: guard.workspaceId,
      projectId,
      meta: { role: role.name },
    });

    return { ok: true };
  }

  if (!canInviteToWorkspace) {
    return {
      error: "You are not allowed to invite new people to this workspace.",
    };
  }

  // The name isn't settled until the invitation is accepted — until then the
  // account carries the local part of the address, so the avatar and list
  // show something readable.
  const localPart = email.split("@")[0];
  const handle = await generateHandle(email);
  const now = new Date();

  const { token, expiresAt } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        firstName: localPart.charAt(0).toUpperCase() + localPart.slice(1),
        lastName: "",
        handle,
        email,
        color: pickUserColor(),
        platformRoleId: systemRoleId("PLATFORM", DEFAULT_PLATFORM_ROLE_KEY),
        // Invited instead of self-registered — no onboarding step needed,
        // accepting the invitation stays a single click.
        onboardedAt: now,
      },
      select: { id: true },
    });

    if (roleKey !== PROJECT_GUEST_ROLE_KEY) {
      await tx.workspaceMember.create({
        data: {
          workspaceId: guard.workspaceId,
          userId: user.id,
          roleId: systemRoleId("WORKSPACE", DEFAULT_WORKSPACE_ROLE_KEY),
          pending: true,
        },
      });
      // Whoever joins the workspace is in its public projects — not just the
      // one the invitation came from.
      await enrollInWorkspaceProjects(tx, {
        workspaceId: guard.workspaceId,
        userId: user.id,
      });
    }

    // In the inviting project, the invited role applies instead of the
    // derived one. The row may already exist from the enrollment above,
    // hence `upsert`.
    await tx.projectMember.upsert({
      where: {
        projectId_userId: { projectId, userId: user.id },
      },
      update: { roleId: role.id, origin: "manual" },
      create: {
        projectId,
        userId: user.id,
        roleId: role.id,
        origin: "manual",
      },
    });

    // The account has no password — without this token nobody could get in.
    return createInvitation(
      tx,
      {
        userId: user.id,
        workspaceId: guard.workspaceId,
        projectId,
        invitedById: guard.actorId,
      },
      now,
    );
  });

  const inviteUrl = invitationUrl(token);
  await sendInvitationEmail({
    to: email,
    workspaceId: guard.workspaceId,
    projectId,
    inviterId: guard.actorId,
    roleName: role.name,
    expiresAt,
    inviteUrl,
  });

  return { ok: true, inviteUrl, mailSent: isMailConfigured() };
}

/**
 * Creates (or renews) a project's shareable invitation link for a role —
 * the project equivalent of `createWorkspaceInviteLink`.
 */
export async function createProjectInviteLink(
  projectId: string,
  role: string,
  expiresAt?: Date,
): Promise<
  { ok: true; url: string; expiresAt: Date | null } | { error: string }
> {
  const guard = await requireMemberManage(projectId, "member.invite");
  if ("error" in guard) return guard;

  const resolved = await resolveAssignable(guard, role);
  if ("error" in resolved) return resolved;

  const { token, expiresAt: expiry } = await createInviteLink(
    db,
    {
      workspaceId: guard.workspaceId,
      projectId,
      roleId: resolved.id,
      createdById: guard.actorId,
      expiresAt: expiresAt ?? null,
    },
    new Date(),
  );

  revalidatePath("/", "layout");
  return { ok: true, url: inviteLinkUrl(token), expiresAt: expiry };
}

/** One more page of projects for infinite scroll in `ProjectOverview`. */
export async function loadMoreProjectsOverview(
  workspaceId: string,
  cursor: string,
): Promise<{ items: ProjectOverviewRow[]; nextCursor: string | null }> {
  const view = await getProjectsOverview(workspaceId, cursor);
  return { items: view.rows, nextCursor: view.nextCursor };
}

/** One more page of the project's own labels for infinite scroll in
 * `ProjectLabels`. */
export async function loadMoreProjectLabels(
  projectId: string,
  cursor: string,
): Promise<{ items: ProjectLabelRow[]; nextCursor: string | null }> {
  const view = await getProjectLabelsView(projectId, cursor);
  return view
    ? { items: view.own, nextCursor: view.ownNextCursor }
    : { items: [], nextCursor: null };
}

/** Mirror image of `loadMoreProjectLabels`, for the inherited workspace labels. */
export async function loadMoreProjectInheritedLabels(
  projectId: string,
  cursor: string,
): Promise<{ items: ProjectLabelRow[]; nextCursor: string | null }> {
  const view = await getProjectLabelsView(projectId, undefined, cursor);
  return view
    ? { items: view.inherited, nextCursor: view.inheritedNextCursor }
    : { items: [], nextCursor: null };
}

/** One more page for infinite scroll in `ProjectMembers`. */
export async function loadMoreProjectMembers(
  projectId: string,
  cursor: string,
): Promise<{ items: ProjectMemberRow[]; nextCursor: string | null }> {
  const view = await getProjectMembersView(projectId, cursor);
  return view
    ? { items: view.rows, nextCursor: view.nextCursor }
    : { items: [], nextCursor: null };
}

/** One more page of pending invitations for infinite scroll in the
 * "Invitations" tab of the project settings. */
export async function loadMorePendingProjectInvitations(
  projectId: string,
  cursor: string,
): Promise<{ items: PendingInvitationRow[]; nextCursor: string | null }> {
  const view = await getPendingProjectInvitationsView(projectId, cursor);
  return view
    ? { items: view.rows, nextCursor: view.nextCursor }
    : { items: [], nextCursor: null };
}
