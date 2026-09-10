"use server";

import { revalidatePath } from "next/cache";
import { getProjects, getUserWorkspaces } from "@/features/issues/queries";
import {
  getPendingWorkspaceInvitationsView,
  getWorkspaceLabelsView,
  getWorkspaceMembersView,
  getWorkspaceProjectsView,
  getWorkspaceTeamsView,
} from "@/features/workspaces/queries";
import type {
  PendingInvitationRow,
  WorkspaceLabelRow,
  WorkspaceMemberRow,
  WorkspaceProjectRow,
  WorkspaceTeamRow,
} from "@/features/workspaces/types";
import { recordAudit } from "@/lib/audit";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { db } from "@/lib/db";
import { createInvitation, invitationUrl } from "@/lib/invitations";
import {
  createInviteLink,
  inviteLinkUrl,
  redeemInviteLink,
  resolveInviteLink,
} from "@/lib/invite-links";
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
  PermissionError,
  requirePermission,
} from "@/lib/permissions";
import {
  dropProjectMemberships,
  enrollInWorkspaceProjects,
  enrollWorkspaceMembers,
  syncProjectTeamRoles,
} from "@/lib/project-membership";
import {
  DEFAULT_PLATFORM_ROLE_KEY,
  DEFAULT_WORKSPACE_ROLE_KEY,
  OWNER_ROLE_KEY,
  systemRoleId,
} from "@/lib/rbac";
import { getSession } from "@/lib/session";
import {
  deleteAvatarObject,
  finalizeAvatarUpload,
  requestAvatarUpload,
} from "@/lib/storage";
import { canCreateWorkspace, getSystemSettings } from "@/lib/system-settings";
import { generateHandle, pickUserColor } from "@/lib/user-defaults";
import { uid } from "@/lib/utils/id";
import {
  DEFAULT_ISSUE_TYPES,
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
} from "@/lib/workspace-defaults";
import type { Project } from "@/types";

type WorkspaceResult = { redirectTo: string } | { error: string };

/**
 * Result of a member action. `inviteUrl` is present only when a new account
 * was created and the link still needs to reach someone. `mailSent` tells
 * the UI whether the invitation also went out by mail (SMTP configured) —
 * without that, the link is the only way in, and the message needs to say
 * so accordingly.
 */
type MemberResult =
  | { ok: true; inviteUrl?: string; mailSent?: boolean }
  | { error: string };

/**
 * Projects for several workspaces at once, filtered down to the logged-in
 * user's workspaces. Called by the TabBar: each tab carries its own
 * workspace id in the URL, even when it differs from the currently active
 * workspace — the client asks here specifically for the missing workspaces.
 */
export async function getProjectsForWorkspaces(
  workspaceIds: string[],
): Promise<Record<string, Project[]>> {
  const session = await getSession();
  if (!session) return {};

  const memberOf = new Set(
    (await getUserWorkspaces(session.userId)).map((w) => w.id),
  );
  const allowed = [...new Set(workspaceIds)].filter((id) => memberOf.has(id));

  const entries = await Promise.all(
    allowed.map(
      async (id): Promise<[string, Project[]]> => [id, await getProjects(id)],
    ),
  );
  return Object.fromEntries(entries);
}

// Find a free workspace slug, appending 1, 2, 3… until one is available.
async function uniqueWorkspaceSlug(base: string): Promise<string> {
  const root = base || "workspace";
  let slug = root;
  let n = 0;
  while (
    await db.workspace.findUnique({ where: { slug }, select: { id: true } })
  ) {
    slug = `${root}${++n}`;
  }
  return slug;
}

// Used by the create form to show the slug that will actually be used.
export async function suggestWorkspaceSlug(base: string): Promise<string> {
  return uniqueWorkspaceSlug(base);
}

export async function createWorkspace(
  formData: FormData,
): Promise<WorkspaceResult> {
  const session = await getSession();
  if (!session) return { error: "You must be logged in." };

  if (!canCreateWorkspace(await getSystemSettings())) {
    return {
      error: "Workspace creation is currently disabled by the administrator.",
    };
  }

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const slug = (formData.get("slug") as string | null)?.trim() ?? "";
  const color = (formData.get("color") as string | null)?.trim() || "#6e63e6";

  if (!name || !slug) return { error: "Name and slug are required." };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 1) {
    return {
      error: "Slug may only contain lowercase letters, numbers, and hyphens.",
    };
  }

  // Auto-dedupe: if the slug is taken, fall back to slug1, slug2, …
  const finalSlug = await uniqueWorkspaceSlug(slug);

  const projectId = crypto.randomUUID();
  const prefix =
    name
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 4) || finalSlug.toUpperCase().slice(0, 4);

  try {
    await db.$transaction(async (tx) => {
      await tx.workspace.create({
        data: { id: finalSlug, slug: finalSlug, name, color },
      });

      await tx.workspaceStatus.createMany({
        data: DEFAULT_STATUSES.map((s) => ({
          workspaceId: finalSlug,
          statusId: s.id,
        })),
      });
      await tx.workspacePriority.createMany({
        data: DEFAULT_PRIORITIES.map((p) => ({
          workspaceId: finalSlug,
          priorityId: p.id,
        })),
      });
      await tx.workspaceIssueType.createMany({
        data: DEFAULT_ISSUE_TYPES.map((t) => ({
          workspaceId: finalSlug,
          issueTypeId: t.id,
        })),
      });
      // RBAC needs nothing more here: the default roles are shared and
      // already exist in the database. The creator automatically becomes Owner.
      await tx.workspaceMember.create({
        data: {
          workspaceId: finalSlug,
          userId: session.userId,
          roleId: systemRoleId("WORKSPACE", OWNER_ROLE_KEY),
          pending: false,
        },
      });

      const projectSlug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "project";
      await tx.project.create({
        data: {
          id: projectId,
          workspaceId: finalSlug,
          name,
          slug: projectSlug,
          prefix,
          color,
          // Without this line, every workspace's first project would show
          // up as orphaned in platform administration from day one.
          createdById: session.userId,
        },
      });

      // This also puts the creator in the project — previously they were
      // missing from `ProjectMember`, since their access came solely from
      // the Owner role.
      await enrollWorkspaceMembers(tx, {
        id: projectId,
        workspaceId: finalSlug,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[createWorkspace]", msg);
    return { error: "Something went wrong. Please try again." };
  }

  // Locale-free path – the client navigates via next-intl (auto-prefix).
  return { redirectTo: `/${finalSlug}` };
}

// ─── Update and delete workspace ───────────────────────────────────────────
//
// These two return errors instead of throwing: they're wired up to the
// settings page, which is meant to display the reason.

type SettingsResult = { ok: true } | { error: string };

/**
 * Name and color of the workspace.
 *
 * The slug stays as it is — it doubles as the workspace's id and therefore
 * appears in every address, every open tab, and every invitation sent. To
 * change it would mean running all of that into the void; the page
 * therefore shows it for reference instead of as an editable field.
 */
export async function updateWorkspace(
  workspaceId: string,
  data: {
    name?: string;
    color?: string;
    desc?: string;
    /**
     * The entire list, not a diff — the same choice as for teams: the
     * dialog shows it in full anyway, and a diff built from individual
     * calls would be the same operation in multiple round trips.
     * `undefined` means "leave unchanged", `[]` means "remove all".
     */
    links?: { label: string; url: string }[];
  },
): Promise<SettingsResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "workspace.update", { workspaceId })))
    return { error: "You are not allowed to change this workspace." };

  const name = data.name?.trim();
  if (name !== undefined && !name) return { error: "Name is required." };

  // Empty rows (neither label nor address) aren't a link, just an unused
  // row in the dialog — they're silently dropped. What's left has to be
  // complete: a chip without a label or without a target would be unusable.
  let links: { label: string; url: string }[] | undefined;
  if (data.links !== undefined) {
    links = data.links
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label !== "" || link.url !== "");
    for (const link of links) {
      if (!link.label || !link.url) {
        return { error: "Every link needs a label and a URL." };
      }
      if (!/^https?:\/\//i.test(link.url)) {
        return { error: "Links must start with http:// or https://." };
      }
    }
  }

  await db.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.desc !== undefined ? { desc: data.desc.trim() } : {}),
      },
    });

    if (links !== undefined) {
      await tx.workspaceLink.deleteMany({ where: { workspaceId } });
      if (links.length > 0) {
        await tx.workspaceLink.createMany({
          data: links.map((link, index) => ({
            id: uid("wl"),
            workspaceId,
            label: link.label,
            url: link.url,
            position: index,
          })),
        });
      }
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

type UploadUrlResult =
  | { ok: true; key: string; uploadUrl: string }
  | { error: string };

/** First step of the workspace avatar upload: presigned PUT URL, directly
 *  against S3, following the same pattern as `updateWorkspace`. */
export async function requestWorkspaceAvatarUploadUrl(
  workspaceId: string,
  input: { contentType: string; contentLength: number },
): Promise<UploadUrlResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "workspace.update", { workspaceId })))
    return { error: "You are not allowed to change this workspace." };

  return requestAvatarUpload({
    kind: "workspace",
    ownerId: workspaceId,
    ...input,
  });
}

export async function confirmWorkspaceAvatarUpload(
  workspaceId: string,
  key: string,
): Promise<SettingsResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "workspace.update", { workspaceId })))
    return { error: "You are not allowed to change this workspace." };

  const result = await finalizeAvatarUpload("workspace", workspaceId, key);
  if ("error" in result) return result;

  const previous = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { avatarKey: true },
  });
  await db.workspace.update({
    where: { id: workspaceId },
    data: { avatarKey: key },
  });
  await deleteAvatarObject(previous?.avatarKey);

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeWorkspaceAvatar(
  workspaceId: string,
): Promise<SettingsResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "workspace.update", { workspaceId })))
    return { error: "You are not allowed to change this workspace." };

  const previous = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { avatarKey: true },
  });
  await db.workspace.update({
    where: { id: workspaceId },
    data: { avatarKey: null },
  });
  await deleteAvatarObject(previous?.avatarKey);

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Deletes the workspace along with everything inside it.
 *
 * The issues go first: their foreign key to the project is set to
 * `Restrict`, so the projects couldn't be deleted otherwise. Everything
 * else — projects, members, teams, labels, roles, invitations — cascades
 * from the workspace.
 */
export async function deleteWorkspace(
  workspaceId: string,
): Promise<SettingsResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "workspace.delete", { workspaceId })))
    return { error: "You are not allowed to delete this workspace." };

  // Read before deletion: afterward there's nothing left to name, and an
  // audit entry about "some workspace" helps nobody.
  const doomed = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      name: true,
      _count: { select: { members: true, projects: true } },
    },
  });

  await db.$transaction(async (tx) => {
    await tx.issue.deleteMany({ where: { project: { workspaceId } } });
    await tx.workspace.delete({ where: { id: workspaceId } });
  });

  await recordAudit({
    action: "workspace.deleted",
    actorId,
    target: {
      type: "workspace",
      id: workspaceId,
      label: doomed?.name ?? workspaceId,
    },
    workspaceId,
    meta: {
      members: doomed?._count.members ?? 0,
      projects: doomed?._count.projects ?? 0,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Domain auto-join ───────────────────────────────────────────────────────
//
// Whoever creates a new account with an address on this domain
// (`provisionNewUser()`, `lib/user-provisioning.ts` — runs on every new
// passkey/OAuth account) joins automatically — no invitation link, no
// `pending`. Two guards against abuse: `domain @id` on `WorkspaceDomain`
// prevents two workspaces from claiming the same domain; the blocklist
// below prevents anyone from claiming a public freemail domain (shared by
// strangers) in the first place. No DNS verification — whoever has
// `workspace.update` can register any not-yet-blocked, still-free domain,
// even one they don't own. A known gap, not addressed by this change.
const BLOCKED_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "protonmail.com",
  "proton.me",
  "gmx.de",
  "gmx.net",
  "web.de",
  "aol.com",
]);

const DOMAIN_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, "");
}

export async function addWorkspaceDomain(
  workspaceId: string,
  domain: string,
): Promise<SettingsResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "workspace.update", { workspaceId })))
    return { error: "You are not allowed to change this workspace." };

  const normalized = normalizeDomain(domain);
  if (!DOMAIN_PATTERN.test(normalized))
    return { error: "Please enter a valid domain, e.g. acme.com." };
  if (BLOCKED_EMAIL_DOMAINS.has(normalized))
    return {
      error: "This is a public email provider and cannot be claimed.",
    };

  const existing = await db.workspaceDomain.findUnique({
    where: { domain: normalized },
    select: { workspaceId: true },
  });
  if (existing) {
    return existing.workspaceId === workspaceId
      ? { error: "This domain is already added." }
      : { error: "Another workspace already uses this domain." };
  }

  await db.workspaceDomain.create({
    data: { domain: normalized, workspaceId },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeWorkspaceDomain(
  workspaceId: string,
  domain: string,
): Promise<SettingsResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "workspace.update", { workspaceId })))
    return { error: "You are not allowed to change this workspace." };

  await db.workspaceDomain.deleteMany({
    where: { domain: normalizeDomain(domain), workspaceId },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Teams ──────────────────────────────────────────────────────────────────
//
// A team groups people and projects — and since `TeamProject.roleId`, it can
// additionally carry a role on a project. The team itself still doesn't
// grant any rights: what it lends out is exactly the project role it
// carries, and that lands in `ProjectMember` like any other assignment
// (`syncProjectTeamRoles`, lib/project-membership.ts). That's why the team
// still depends on its own permissions (`team.*`) — only lending out a role
// additionally requires `member.role.update` on the affected project, see
// `resolveTeamProjectRoles`.
//
// Members and projects arrive as a complete list and are set as a whole.
// The dialog shows both sets in full anyway; a diff built from individual
// calls would be the same operation in multiple round trips — with the risk
// of getting stuck partway through.

interface TeamProjectInput {
  projectId: string;
  /** Role key from the PROJECT scope, or `null` for pure grouping without a role. */
  roleKey: string | null;
}

interface TeamInput {
  name: string;
  key: string;
  color: string;
  desc?: string;
  leadId: string;
  memberIds: string[];
  projects: TeamProjectInput[];
}

/** Short code like for a project: up to four characters, letters and digits. */
function teamKey(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 4);
}

/**
 * Checks the inputs against the workspace: short code free, lead and
 * members belong to it, so do the projects. Without this pass, a team
 * could be assembled from another tenant's ids, spanning across it.
 */
async function checkTeamInput(
  workspaceId: string,
  data: TeamInput,
  teamId?: string,
): Promise<{ error: string } | { key: string; memberIds: string[] }> {
  const name = data.name.trim();
  if (!name) return { error: "Name is required." };

  const key = teamKey(data.key) || teamKey(name);
  if (!key) return { error: "The identifier cannot be empty." };

  const taken = await db.team.findUnique({
    where: { workspaceId_key: { workspaceId, key } },
    select: { id: true },
  });
  if (taken && taken.id !== teamId)
    return { error: "Another team in this workspace uses that identifier." };

  // The lead runs the team and therefore has to be a member of it
  // themselves — otherwise the row would have a person in charge who
  // doesn't even belong to it.
  const memberIds = [...new Set([data.leadId, ...data.memberIds])];

  const known = await db.workspaceMember.count({
    where: { workspaceId, userId: { in: memberIds } },
  });
  if (known !== memberIds.length)
    return { error: "Only workspace members can be part of a team." };

  const projectIds = [...new Set(data.projects.map((p) => p.projectId))];
  if (projectIds.length > 0) {
    const projects = await db.project.count({
      where: { workspaceId, id: { in: projectIds } },
    });
    if (projects !== projectIds.length)
      return { error: "Only projects of this workspace can be assigned." };
  }

  return { key, memberIds };
}

/**
 * Resolves, for each team-project link, the role to be granted — or `null`
 * for pure grouping without a role.
 *
 * Granting a role through a team is an access decision like any other role
 * assignment in a project: it therefore additionally requires
 * `member.role.update` in exactly that project, and the rank must not
 * exceed the actor's own ceiling there (`assignmentCeiling`, as in
 * `features/projects/actions.ts`). Without this second check, anyone
 * holding only `team.project.manage` — the workspace role "Manager", say,
 * which has no project permissions at all — could use a team to grant
 * access to any project in the workspace, including ones they themselves
 * have no rights to whatsoever.
 */
async function resolveTeamProjectRoles(
  workspaceId: string,
  actorId: string,
  projects: TeamProjectInput[],
): Promise<
  | { error: string }
  | { entries: { projectId: string; roleId: string | null }[] }
> {
  const entries: { projectId: string; roleId: string | null }[] = [];

  for (const p of projects) {
    if (!p.roleKey) {
      entries.push({ projectId: p.projectId, roleId: null });
      continue;
    }

    const access = await accessFor(actorId, { projectId: p.projectId });
    if (!access.has("member.role.update"))
      return {
        error: "You are not allowed to grant project roles through teams here.",
      };

    const role = await db.role.findFirst({
      where: {
        scope: "PROJECT",
        key: p.roleKey,
        OR: [
          { system: true },
          { workspaceId, projectId: null },
          { projectId: p.projectId },
        ],
      },
      select: { id: true, rank: true },
      // As in `resolveAssignable`: the most specific role wins if several
      // share the same key.
      orderBy: [
        { projectId: { sort: "desc", nulls: "last" } },
        { workspaceId: { sort: "desc", nulls: "last" } },
      ],
    });
    if (!role) return { error: "Pick a valid role for each project." };
    if (role.rank > assignmentCeiling(access, "PROJECT"))
      return {
        error: "You cannot grant a team a role above your own in that project.",
      };

    entries.push({ projectId: p.projectId, roleId: role.id });
  }

  return { entries };
}

export async function createTeam(
  workspaceId: string,
  data: TeamInput,
): Promise<SettingsResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "team.create", { workspaceId })))
    return { error: "You are not allowed to create teams here." };

  const checked = await checkTeamInput(workspaceId, data);
  if ("error" in checked) return checked;

  const resolved = await resolveTeamProjectRoles(
    workspaceId,
    actorId,
    data.projects,
  );
  if ("error" in resolved) return resolved;

  const teamId = uid("t");

  await db.$transaction(async (tx) => {
    await tx.team.create({
      data: {
        id: teamId,
        workspaceId,
        name: data.name.trim(),
        key: checked.key,
        color: data.color,
        desc: data.desc?.trim() ?? "",
        leadId: data.leadId,
        members: { create: checked.memberIds.map((userId) => ({ userId })) },
        projects: {
          create: resolved.entries.map((p) => ({
            projectId: p.projectId,
            roleId: p.roleId,
          })),
        },
      },
    });

    for (const p of resolved.entries) {
      if (p.roleId)
        await syncProjectTeamRoles(tx, p.projectId, checked.memberIds);
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Change a team — core data, members, and projects in one go.
 *
 * The three parts depend on three permissions (`team.update`,
 * `team.member.manage`, `team.project.manage`). Whoever has only one of
 * them only changes their part: the remaining fields are skipped instead of
 * rejected, because the dialog only shows them when they're editable anyway.
 */
export async function updateTeam(
  teamId: string,
  data: TeamInput,
): Promise<SettingsResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { workspaceId: true },
  });
  if (!team) return { error: "This team no longer exists." };
  const { workspaceId } = team;

  const [canUpdate, canMembers, canProjects] = await Promise.all([
    can(actorId, "team.update", { workspaceId }),
    can(actorId, "team.member.manage", { workspaceId }),
    can(actorId, "team.project.manage", { workspaceId }),
  ]);
  if (!canUpdate && !canMembers && !canProjects)
    return { error: "You are not allowed to change this team." };

  const checked = await checkTeamInput(workspaceId, data, teamId);
  if ("error" in checked) return checked;

  // Only resolve what actually gets written — without `team.project.manage`,
  // the check in `resolveTeamProjectRoles` would otherwise need permissions
  // that the call skips anyway at the end.
  const resolved = canProjects
    ? await resolveTeamProjectRoles(workspaceId, actorId, data.projects)
    : { entries: [] as { projectId: string; roleId: string | null }[] };
  if ("error" in resolved) return resolved;

  await db.$transaction(async (tx) => {
    // Remember beforehand who and which projects the team role sync will
    // need to reconcile afterward — the old rows are already gone after the
    // changes below, and without this snapshot, someone kicked out of the
    // team would never lose their team role.
    const [before, previousProjectRoles] = await Promise.all([
      tx.teamMember.findMany({ where: { teamId }, select: { userId: true } }),
      tx.teamProject.findMany({
        where: { teamId, roleId: { not: null } },
        select: { projectId: true },
      }),
    ]);
    const previousMemberIds = before.map((m) => m.userId);
    const previousProjectIds = previousProjectRoles.map((p) => p.projectId);

    if (canUpdate) {
      await tx.team.update({
        where: { id: teamId },
        data: {
          name: data.name.trim(),
          key: checked.key,
          color: data.color,
          desc: data.desc?.trim() ?? "",
          leadId: data.leadId,
        },
      });
    }

    if (canMembers) {
      await tx.teamMember.deleteMany({ where: { teamId } });
      await tx.teamMember.createMany({
        data: checked.memberIds.map((userId) => ({ teamId, userId })),
      });
    }

    if (canProjects) {
      await tx.teamProject.deleteMany({ where: { teamId } });
      await tx.teamProject.createMany({
        data: resolved.entries.map((p) => ({
          teamId,
          projectId: p.projectId,
          roleId: p.roleId,
        })),
      });
    }

    // Affected is anyone who was a member before or after, in every project
    // that carried a role before or after.
    const affectedMemberIds = canMembers
      ? [...new Set([...previousMemberIds, ...checked.memberIds])]
      : previousMemberIds;
    const currentProjectIds = canProjects
      ? resolved.entries.filter((p) => p.roleId).map((p) => p.projectId)
      : previousProjectIds;
    const affectedProjectIds = [
      ...new Set([...previousProjectIds, ...currentProjectIds]),
    ];

    for (const projectId of affectedProjectIds) {
      await syncProjectTeamRoles(tx, projectId, affectedMemberIds);
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTeam(teamId: string): Promise<SettingsResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { workspaceId: true },
  });
  if (!team) return { error: "This team no longer exists." };

  if (!(await can(actorId, "team.delete", { workspaceId: team.workspaceId })))
    return { error: "You are not allowed to delete this team." };

  await db.$transaction(async (tx) => {
    const [members, projectRoles] = await Promise.all([
      tx.teamMember.findMany({ where: { teamId }, select: { userId: true } }),
      tx.teamProject.findMany({
        where: { teamId, roleId: { not: null } },
        select: { projectId: true },
      }),
    ]);
    const memberIds = members.map((m) => m.userId);

    // Memberships and project assignments cascade from the team; a team
    // has no connection to tasks, so nothing is left behind there.
    await tx.team.delete({ where: { id: teamId } });

    // After deletion, this link no longer counts — whoever had their
    // project role only from here loses the row now (unless it was set
    // manually or is still carried by another team).
    for (const { projectId } of projectRoles) {
      await syncProjectTeamRoles(tx, projectId, memberIds);
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Workspace members ──────────────────────────────────────────────────────
//
// These actions used to live in `features/issues/actions.ts` — where the
// member list was first needed. They belong in the domain they're actually
// about, and now sit next to inviting.
//
// `setMemberRole` and `removeMember` throw, `inviteWorkspaceMember` returns
// errors: the first two are wired up to row actions on a table, the last
// one to a form meant to display the cause.

export async function setMemberRole(
  workspaceId: string,
  userId: string,
  roleKey: string,
) {
  const guard = "member.role.update" as const;
  const actorId = await requirePermission(guard, { workspaceId });
  // The rank now comes from the database instead of a constant list — this
  // way the hierarchy also applies to custom-created roles.
  const actorRank = (await accessFor(actorId, { workspaceId })).rank(
    "WORKSPACE",
  );

  // Not your own role through this table — otherwise the rank comparison
  // below would be a check against yourself.
  if (userId === actorId) throw new PermissionError(guard);

  const target = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: { select: { key: true, rank: true } } },
  });
  if (!target) throw new PermissionError(guard);

  // Owner is immutable; promoting to owner only happens via an ownership transfer.
  if (target.role.key === OWNER_ROLE_KEY || roleKey === OWNER_ROLE_KEY) {
    throw new PermissionError(guard);
  }

  // Assignable are the shared system roles and this workspace's own ones.
  const next = await db.role.findFirst({
    where: {
      scope: "WORKSPACE",
      key: roleKey,
      OR: [{ system: true }, { workspaceId }],
    },
    select: { id: true, rank: true, name: true },
  });
  if (!next) throw new PermissionError(guard);

  // Nobody may assign a higher role or change a member ranked above them.
  if (next.rank > actorRank || target.role.rank > actorRank) {
    throw new PermissionError(guard);
  }

  await db.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId } },
    data: { roleId: next.id },
  });

  await notify({
    userId,
    type: "role",
    actorId,
    workspaceId,
    text: next.name,
  });

  // "Who granted rights to whom?" — the same question as at the platform
  // level, here for the workspace. The entry carries both roles, so later
  // it's possible to see which direction it went.
  const target_ = await db.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, color: true },
  });
  await recordAudit({
    action: "member.role.changed",
    actorId,
    target: {
      type: "user",
      id: userId,
      label: target_
        ? `${target_.firstName} ${target_.lastName}`.trim()
        : userId,
    },
    personColor: target_?.color ?? null,
    workspaceId,
    meta: { from: target.role.key, to: roleKey },
  });

  revalidatePath("/", "layout");
}

export async function removeMember(workspaceId: string, userId: string) {
  const guard = "member.remove" as const;
  const actorId = await requirePermission(guard, { workspaceId });
  const actorRank = (await accessFor(actorId, { workspaceId })).rank(
    "WORKSPACE",
  );

  // Kicking yourself out isn't an administrative action — there would be a
  // separate "leave workspace" path for that, and it would need to handle
  // the owner case on its own.
  if (userId === actorId) throw new PermissionError(guard);

  const target = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: {
      role: { select: { key: true, rank: true } },
      user: { select: { firstName: true, lastName: true, color: true } },
    },
  });
  if (!target) throw new PermissionError(guard);

  // The owner can't be removed; neither can members ranked above the actor.
  if (target.role.key === OWNER_ROLE_KEY || target.role.rank > actorRank) {
    throw new PermissionError(guard);
  }

  await db.$transaction(async (tx) => {
    await tx.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    // Whoever is no longer in the workspace is no longer in any of its
    // projects. Without this, the person would keep access through their
    // project roles.
    await dropProjectMemberships(tx, { workspaceId, userId });
  });

  // The only way to tell the person — an in-app row would be unreachable:
  // `canEnterWorkspace` already locks out the workspace before they could
  // even see the inbox.
  await sendMemberRemovedEmail({ userId, workspaceId, actorId });

  await recordAudit({
    action: "member.removed",
    actorId,
    target: {
      type: "user",
      id: userId,
      label: `${target.user.firstName} ${target.user.lastName}`.trim(),
    },
    personColor: target.user.color,
    workspaceId,
  });

  revalidatePath("/", "layout");
}

/** Upper limit per call — the only safeguard available as long as this repo
 *  has no rate limiting (neither here nor anywhere else). */
const MAX_BULK_INVITES = 50;

type BulkInviteRow = { email: string; result: MemberResult };
type BulkInviteResult = { rows: BulkInviteRow[] } | { error: string };

/**
 * Invites someone into the workspace by email. Thin wrapper around
 * `inviteWorkspaceMembers` for a single address.
 */
export async function inviteWorkspaceMember(data: {
  workspaceId: string;
  email: string;
  role: string;
}): Promise<MemberResult> {
  const result = await inviteWorkspaceMembers({
    workspaceId: data.workspaceId,
    emails: [data.email],
    role: data.role,
  });
  if ("error" in result) return result;
  // `emails: [data.email]` yields exactly one row.
  return (result.rows[0] as BulkInviteRow).result;
}

/**
 * Invites multiple addresses into the workspace at once.
 *
 * Role resolution, rank ceiling, and the `member.invite` check run once
 * before the loop instead of per address — otherwise every additional
 * email would cost another `role.findFirst` query, and a role that changes
 * mid-loop would produce inconsistent partial results instead of a clean
 * failure for the whole call.
 *
 * Each address then gets its own result — whether an email already belongs
 * to a member or has an invalid format shouldn't block the rest. Two paths
 * per address, depending on whether the account already exists: see
 * `inviteOneWorkspaceMember`.
 */
export async function inviteWorkspaceMembers(data: {
  workspaceId: string;
  emails: string[];
  role: string;
}): Promise<BulkInviteResult> {
  const { workspaceId } = data;

  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "member.invite", { workspaceId })))
    return { error: "You are not allowed to invite people to this workspace." };

  const emails = [...new Set(data.emails.map((e) => e.trim().toLowerCase()))];
  if (emails.length === 0) return { error: "Add at least one email address." };
  if (emails.length > MAX_BULK_INVITES)
    return {
      error: `You can invite at most ${MAX_BULK_INVITES} people at once.`,
    };

  if (data.role === OWNER_ROLE_KEY)
    return { error: "The owner role cannot be handed out." };

  // Nobody assigns a role above their own — the same rule as in
  // `setMemberRole`, here just for people who aren't in yet.
  const access = await accessFor(actorId, { workspaceId });
  const ceiling = assignmentCeiling(access, "WORKSPACE");

  const role = await db.role.findFirst({
    where: {
      scope: "WORKSPACE",
      key: data.role,
      OR: [{ system: true }, { workspaceId }],
    },
    select: { id: true, rank: true, name: true },
  });
  if (!role) return { error: "Pick a valid role." };
  if (role.rank > ceiling)
    return { error: "You cannot assign a role above your own." };

  const rows: BulkInviteRow[] = [];
  for (const email of emails) {
    rows.push({
      email,
      result: await inviteOneWorkspaceMember({
        workspaceId,
        email,
        actorId,
        role,
      }),
    });
  }

  revalidatePath("/", "layout");
  return { rows };
}

/**
 * Invite a single address — the body that `inviteWorkspaceMembers` repeats
 * per email. Role and permission are already resolved by this point.
 *
 *   known    → create membership, done. Whoever can already log in doesn't
 *              need an invitation, just an entry.
 *   unknown  → account without a password, `pending` membership,
 *              invitation token. Only accepting it turns this into usable
 *              access (`acceptInvitation`).
 *
 * In both cases the person joins the workspace's public projects. For a
 * pending invitation, this row stays without effect until accepted —
 * `lib/permissions.ts` grants `pending` no rights.
 */
async function inviteOneWorkspaceMember(params: {
  workspaceId: string;
  email: string;
  actorId: string;
  role: { id: string; rank: number; name: string };
}): Promise<MemberResult> {
  const { workspaceId, email, actorId, role } = params;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Please enter a valid email address." };

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, firstName: true, lastName: true, color: true },
  });

  if (existing) {
    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: existing.id } },
      select: { userId: true },
    });
    if (member) return { error: "This person is already in the workspace." };

    await db.$transaction(async (tx) => {
      await tx.workspaceMember.create({
        data: {
          workspaceId,
          userId: existing.id,
          roleId: role.id,
          pending: false,
        },
      });
      await enrollInWorkspaceProjects(tx, { workspaceId, userId: existing.id });
    });

    // A new account still sits behind an invitation token (below) and can't
    // log in — there'd be nobody to see an in-app notification. Whoever
    // already has an account becomes a member directly and gets it right away.
    await notify({
      userId: existing.id,
      type: "invite",
      actorId,
      workspaceId,
      text: role.name,
    });

    await recordAudit({
      action: "member.added",
      actorId,
      target: {
        type: "user",
        id: existing.id,
        label: `${existing.firstName} ${existing.lastName}`.trim(),
      },
      personColor: existing.color,
      workspaceId,
      meta: { role: role.name },
    });

    return { ok: true };
  }

  // The name isn't settled until the invitation is accepted — until then
  // the account carries the local part of the address, so the avatar and
  // list show something readable.
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

    await tx.workspaceMember.create({
      data: { workspaceId, userId: user.id, roleId: role.id, pending: true },
    });
    await enrollInWorkspaceProjects(tx, { workspaceId, userId: user.id });

    return createInvitation(
      tx,
      { userId: user.id, workspaceId, invitedById: actorId },
      now,
    );
  });

  const inviteUrl = invitationUrl(token);
  await sendInvitationEmail({
    to: email,
    workspaceId,
    inviterId: actorId,
    roleName: role.name,
    expiresAt,
    inviteUrl,
  });

  return { ok: true, inviteUrl, mailSent: isMailConfigured() };
}

/**
 * Resends a pending invitation — new token, new deadline, same person and
 * role. `createInvitation` deletes the old row itself before the new one is
 * created (see `lib/invitations.ts`), so no special case here.
 */
export async function resendInvitation(token: string): Promise<MemberResult> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };

  const invitation = await db.invitation.findUnique({
    where: { token },
    select: {
      workspaceId: true,
      projectId: true,
      userId: true,
      acceptedAt: true,
      user: { select: { email: true } },
    },
  });
  if (!invitation || invitation.acceptedAt)
    return { error: "This invitation no longer exists." };

  // A project-bound invitation (project guest) is managed by whoever can
  // invite in the project — not necessarily in the workspace, the same
  // separation as in `inviteOneProjectMember`. A workspace-wide invitation
  // needs the workspace permission.
  const canManage = invitation.projectId
    ? await can(actorId, "member.invite", { projectId: invitation.projectId })
    : await can(actorId, "member.invite", {
        workspaceId: invitation.workspaceId,
      });
  if (!canManage)
    return { error: "You are not allowed to manage invitations here." };

  // The role isn't stored on the invitation itself, but on the membership
  // already created during the first invite.
  const membership = invitation.projectId
    ? await db.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: invitation.projectId,
            userId: invitation.userId,
          },
        },
        select: { role: { select: { name: true } } },
      })
    : await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId: invitation.userId,
          },
        },
        select: { role: { select: { name: true } } },
      });
  const roleName = membership?.role.name ?? "—";

  const now = new Date();
  const { token: newToken, expiresAt } = await db.$transaction((tx) =>
    createInvitation(
      tx,
      {
        userId: invitation.userId,
        workspaceId: invitation.workspaceId,
        projectId: invitation.projectId,
        invitedById: actorId,
      },
      now,
    ),
  );

  const inviteUrl = invitationUrl(newToken);
  await sendInvitationEmail({
    // An invitation's shadow account is always created with the invited
    // address — the fallback is purely for type safety, not an expected case.
    to: invitation.user.email ?? "",
    workspaceId: invitation.workspaceId,
    projectId: invitation.projectId,
    inviterId: actorId,
    roleName,
    expiresAt,
    inviteUrl,
  });

  revalidatePath("/", "layout");
  return { ok: true, inviteUrl, mailSent: isMailConfigured() };
}

/**
 * Withdraws a pending invitation.
 *
 * Cleans up fully instead of just deleting the token: the memberships the
 * invitation created (workspace and all project rows in this workspace —
 * for a guest just the one project row, otherwise additionally the public
 * projects from `enrollInWorkspaceProjects`), and finally the shadow
 * account itself, but only if nothing else depends on it afterward and it
 * never had a passkey or a linked provider set up. Otherwise a forever
 * invisible zombie record would remain: without an `Invitation` row it no
 * longer shows up in any overview, yet it never became usable access either.
 */
export async function revokeInvitation(
  token: string,
): Promise<{ ok: true } | { error: string }> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };

  const invitation = await db.invitation.findUnique({
    where: { token },
    select: {
      workspaceId: true,
      projectId: true,
      userId: true,
      acceptedAt: true,
    },
  });
  if (!invitation || invitation.acceptedAt)
    return { error: "This invitation no longer exists." };

  const canManage = invitation.projectId
    ? await can(actorId, "member.invite", { projectId: invitation.projectId })
    : await can(actorId, "member.invite", {
        workspaceId: invitation.workspaceId,
      });
  if (!canManage)
    return { error: "You are not allowed to manage invitations here." };

  const { workspaceId, userId } = invitation;

  await db.$transaction(async (tx) => {
    await tx.invitation.delete({ where: { token } });
    await tx.workspaceMember.deleteMany({
      where: { workspaceId, userId },
    });
    await tx.projectMember.deleteMany({
      where: { userId, project: { workspaceId } },
    });

    const [wsCount, pmCount, user] = await Promise.all([
      tx.workspaceMember.count({ where: { userId } }),
      tx.projectMember.count({ where: { userId } }),
      tx.user.findUnique({
        where: { id: userId },
        select: {
          _count: { select: { authenticators: true, accounts: true } },
        },
      }),
    ]);
    const neverSetUp =
      user !== null &&
      user._count.authenticators === 0 &&
      user._count.accounts === 0;
    if (wsCount === 0 && pmCount === 0 && neverSetUp) {
      await tx.user.delete({ where: { id: userId } });
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Creates (or renews) the workspace's shareable invitation link for a
 * role. Same permission check as for the email invite (`member.invite`,
 * rank ceiling) — a link is just another way to invite someone, not a
 * permission of its own.
 */
export async function createWorkspaceInviteLink(
  workspaceId: string,
  role: string,
  expiresAt?: Date,
): Promise<
  { ok: true; url: string; expiresAt: Date | null } | { error: string }
> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };
  if (!(await can(actorId, "member.invite", { workspaceId })))
    return { error: "You are not allowed to invite people to this workspace." };
  if (role === OWNER_ROLE_KEY)
    return { error: "The owner role cannot be handed out." };

  const access = await accessFor(actorId, { workspaceId });
  const ceiling = assignmentCeiling(access, "WORKSPACE");
  const roleRow = await db.role.findFirst({
    where: {
      scope: "WORKSPACE",
      key: role,
      OR: [{ system: true }, { workspaceId }],
    },
    select: { id: true, rank: true },
  });
  if (!roleRow) return { error: "Pick a valid role." };
  if (roleRow.rank > ceiling)
    return { error: "You cannot assign a role above your own." };

  const { token, expiresAt: expiry } = await createInviteLink(
    db,
    {
      workspaceId,
      roleId: roleRow.id,
      createdById: actorId,
      expiresAt: expiresAt ?? null,
    },
    new Date(),
  );

  revalidatePath("/", "layout");
  return { ok: true, url: inviteLinkUrl(token), expiresAt: expiry };
}

/**
 * Revokes an invitation link — workspace or project scope, the same action
 * for both (the permission check depends on the link's `projectId`, the
 * same separation as in `revokeInvitation`).
 */
export async function revokeInviteLink(
  token: string,
): Promise<{ ok: true } | { error: string }> {
  const actorId = await currentUserId();
  if (!actorId) return { error: "You must be logged in." };

  const link = await db.inviteLink.findUnique({
    where: { token },
    select: { workspaceId: true, projectId: true },
  });
  if (!link) return { error: "This link no longer exists." };

  const canManage = link.projectId
    ? await can(actorId, "member.invite", { projectId: link.projectId })
    : await can(actorId, "member.invite", { workspaceId: link.workspaceId });
  if (!canManage) return { error: "You are not allowed to manage this link." };

  await db.inviteLink.update({
    where: { token },
    data: { revokedAt: new Date() },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Redeems an invitation link for the currently logged-in person.
 *
 * One code path for both cases where the public `/join/[token]` page calls
 * it: already logged in (confirmation "join as X?") or freshly arrived via
 * login/registration (the same call, just later in the redirect flow).
 * `redeemInviteLink` itself is idempotent — a repeat call for the same
 * person changes nothing further.
 */
export async function joinViaInviteLink(
  token: string,
): Promise<{ ok: true; workspaceId: string } | { error: string }> {
  const userId = await currentUserId();
  if (!userId) return { error: "You must be logged in." };

  const now = new Date();
  const link = await resolveInviteLink(db, token, now);
  if (!link)
    return { error: "This invite link is no longer valid. Ask for a new one." };

  await db.$transaction(async (tx) => {
    await redeemInviteLink(
      tx,
      link,
      userId,
      systemRoleId("WORKSPACE", DEFAULT_WORKSPACE_ROLE_KEY),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true, workspaceId: link.workspaceId };
}

/**
 * One more page of pending invitations for infinite scroll in the
 * "Invitations" tab of the workspace settings.
 */
export async function loadMorePendingWorkspaceInvitations(
  workspaceId: string,
  cursor: string,
): Promise<{ items: PendingInvitationRow[]; nextCursor: string | null }> {
  setCurrentWorkspaceId(workspaceId);
  const view = await getPendingWorkspaceInvitationsView(cursor);
  return view
    ? { items: view.rows, nextCursor: view.nextCursor }
    : { items: [], nextCursor: null };
}

/**
 * One more page of members for infinite scroll in `WorkspaceMembers`.
 *
 * `setCurrentWorkspaceId` first: the request store
 * (`lib/current-workspace`) is request-scoped and is otherwise only seeded
 * by the route — a Server Function, being a later request than the page's
 * original render, starts without it.
 */
export async function loadMoreWorkspaceMembers(
  workspaceId: string,
  cursor: string,
): Promise<{ items: WorkspaceMemberRow[]; nextCursor: string | null }> {
  setCurrentWorkspaceId(workspaceId);
  const view = await getWorkspaceMembersView(cursor);
  return view
    ? { items: view.rows, nextCursor: view.nextCursor }
    : { items: [], nextCursor: null };
}

/** Mirror image of `loadMoreWorkspaceMembers`, for `WorkspaceTeams`. */
export async function loadMoreWorkspaceTeams(
  workspaceId: string,
  cursor: string,
): Promise<{ items: WorkspaceTeamRow[]; nextCursor: string | null }> {
  setCurrentWorkspaceId(workspaceId);
  const view = await getWorkspaceTeamsView(cursor);
  return view
    ? { items: view.rows, nextCursor: view.nextCursor }
    : { items: [], nextCursor: null };
}

/** One more page of the workspace's own labels for infinite scroll in
 * `WorkspaceLabels`. */
export async function loadMoreWorkspaceLabels(
  workspaceId: string,
  cursor: string,
): Promise<{ items: WorkspaceLabelRow[]; nextCursor: string | null }> {
  setCurrentWorkspaceId(workspaceId);
  const view = await getWorkspaceLabelsView(cursor);
  return view
    ? { items: view.own, nextCursor: view.ownNextCursor }
    : { items: [], nextCursor: null };
}

/** Mirror image of `loadMoreWorkspaceLabels`, for the inherited project labels. */
export async function loadMoreWorkspaceProjectLabels(
  workspaceId: string,
  cursor: string,
): Promise<{ items: WorkspaceLabelRow[]; nextCursor: string | null }> {
  setCurrentWorkspaceId(workspaceId);
  const view = await getWorkspaceLabelsView(undefined, cursor);
  return view
    ? { items: view.fromProjects, nextCursor: view.fromProjectsNextCursor }
    : { items: [], nextCursor: null };
}

/**
 * One more page for infinite scroll in `WorkspaceProjects` — for the
 * single list without `seesAllProjects`.
 */
export async function loadMoreWorkspaceProjects(
  workspaceId: string,
  cursor: string,
): Promise<{ items: WorkspaceProjectRow[]; nextCursor: string | null }> {
  setCurrentWorkspaceId(workspaceId);
  const view = await getWorkspaceProjectsView(cursor);
  return view
    ? { items: view.rows, nextCursor: view.nextCursor }
    : { items: [], nextCursor: null };
}

/** Mirror image of `loadMoreWorkspaceProjects`, for the public projects
 * under `seesAllProjects`. */
export async function loadMorePublicWorkspaceProjects(
  workspaceId: string,
  cursor: string,
): Promise<{ items: WorkspaceProjectRow[]; nextCursor: string | null }> {
  setCurrentWorkspaceId(workspaceId);
  const view = await getWorkspaceProjectsView(undefined, cursor);
  return view
    ? { items: view.publicRows, nextCursor: view.publicNextCursor }
    : { items: [], nextCursor: null };
}

/** Mirror image of `loadMorePublicWorkspaceProjects`, for the private ones. */
export async function loadMorePrivateWorkspaceProjects(
  workspaceId: string,
  cursor: string,
): Promise<{ items: WorkspaceProjectRow[]; nextCursor: string | null }> {
  setCurrentWorkspaceId(workspaceId);
  const view = await getWorkspaceProjectsView(undefined, undefined, cursor);
  return view
    ? { items: view.privateRows, nextCursor: view.privateNextCursor }
    : { items: [], nextCursor: null };
}
