import { cache } from "react";
import type {
  ProjectFieldsView,
  ProjectLabelRow,
  ProjectLabelsView,
  ProjectMemberRow,
  ProjectMembersView,
  ProjectSettingsView,
} from "@/features/projects/types";
// Same shape as at the workspace level — shared instead of duplicated, the
// overview table (`PendingInvitations`) knows only the row anyway, not a
// workspace or project.
import type {
  InviteLinkView,
  PendingInvitationRow,
  PendingInvitationsView,
} from "@/features/workspaces/types";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { inviteLinkUrl } from "@/lib/invite-links";
import { TABLE_PAGE_SIZE } from "@/lib/pagination";
import {
  accessFor,
  assignmentCeiling,
  currentUserId,
  visibleProjectIds,
} from "@/lib/permissions";
import { DEFAULT_PROJECT_ROLE_KEY, PROJECT_ADMIN_ROLE_KEY } from "@/lib/rbac";
import { resolveAvatarUrl } from "@/lib/storage";
import type { Role, User } from "@/types";

// ── Overview ─────────────────────────────────────────────────────────────────

/** A project as the overview page shows it: who, what, for what purpose. */
export interface ProjectOverviewRow {
  id: string;
  name: string;
  slug: string;
  prefix: string;
  color: string;
  avatarUrl: string | null;
  /** Empty if nobody has written a sentence about it. */
  desc: string;
  /**
   * Who leads the project — the first person with the "Project Admin"
   * project role. `null` if there is none.
   */
  lead: User | null;
  /** Additional leads besides `lead`; the column shows them as "+n". */
  moreLeads: number;
}

export interface ProjectOverviewView {
  rows: ProjectOverviewRow[];
  /** `project.create` — whether the button appears in the page header. */
  canCreate: boolean;
  /** Id of the last project on this page, for `loadMoreProjectsOverview` —
   * `null` if `rows` is already everything. */
  nextCursor: string | null;
}

/**
 * The projects the actor is allowed to see — for browsing, not for managing.
 *
 * Deliberately a different view than `getWorkspaceProjectsView` in settings:
 * that one separates by visibility and counts members and tasks, because
 * that's where management happens. Here, a single list holds what someone
 * looking to enter a project needs — name, what it's for, who leads it,
 * under which prefix its tasks run. Whether it's private has already been
 * answered by the visibility rule: whatever appears here is fine to see.
 */
export const getProjectsOverview = cache(
  async (
    workspaceId: string,
    cursor?: string,
    limit: number = TABLE_PAGE_SIZE,
  ): Promise<ProjectOverviewView> => {
    const userId = await currentUserId();
    const access = await accessFor(userId, { workspaceId });
    const canCreate = access.has("project.create");

    // Same visibility rule as everywhere else — the overview is just a
    // different presentation of the list from `getProjects`.
    const visible = await visibleProjectIds(workspaceId);
    if (visible.size === 0) return { rows: [], canCreate, nextCursor: null };

    const projects = await db.project.findMany({
      where: { workspaceId, id: { in: [...visible] } },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        slug: true,
        prefix: true,
        color: true,
        avatarKey: true,
        desc: true,
        // The project's leadership. A few more than the one shown, so "+n"
        // is accurate; a project with more than six leads has a different
        // problem than this column.
        members: {
          where: { role: { key: PROJECT_ADMIN_ROLE_KEY } },
          select: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                color: true,
                image: true,
                avatarKey: true,
              },
            },
          },
          orderBy: [
            { user: { firstName: "asc" } },
            { user: { lastName: "asc" } },
          ],
          take: 6,
        },
      },
      orderBy: { name: "asc" },
    });

    const rows: ProjectOverviewRow[] = await Promise.all(
      projects.map(async (project) => {
        const leads = await Promise.all(
          project.members.map(async (m) => {
            const { avatarKey, ...user } = m.user;
            return {
              ...user,
              image:
                (await resolveAvatarUrl(avatarKey)) ?? user.image ?? undefined,
            };
          }),
        );
        return {
          id: project.id,
          name: project.name,
          slug: project.slug,
          prefix: project.prefix,
          color: project.color,
          avatarUrl: await resolveAvatarUrl(project.avatarKey),
          desc: project.desc,
          lead: leads[0] ?? null,
          moreLeads: Math.max(0, leads.length - 1),
        };
      }),
    );

    return {
      rows,
      canCreate,
      nextCursor:
        projects.length === limit ? projects[projects.length - 1].id : null,
    };
  },
);

// ── Settings ─────────────────────────────────────────────────────────────────

/**
 * The project as its settings page needs it — including what the actor is
 * allowed to do with it.
 *
 * `null` means "doesn't exist for you": either the project doesn't exist, or
 * it isn't visible. The page turns this into a 404, so it doesn't reveal
 * which of the two cases applies.
 */
export const getProjectSettingsView = cache(
  async (projectId: string): Promise<ProjectSettingsView | null> => {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        slug: true,
        prefix: true,
        color: true,
        avatarKey: true,
        desc: true,
        visibility: true,
        _count: { select: { issues: true, members: true } },
      },
    });
    if (!project) return null;

    const access = await accessFor(await currentUserId(), { projectId });
    if (!access.has("project.view")) return null;

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        prefix: project.prefix,
        color: project.color,
        avatarUrl: await resolveAvatarUrl(project.avatarKey),
        desc: project.desc,
        visibility: project.visibility,
        issueCount: project._count.issues,
        memberCount: project._count.members,
      },
      canUpdate: access.has("project.update"),
      canDelete: access.has("project.delete"),
    };
  },
);

/** Everything the "Fields" settings page needs (BARY-31) — which issue-detail
 *  fields this project has turned off, and whether the viewer may change
 *  that. */
export const getProjectFieldsView = cache(
  async (projectId: string): Promise<ProjectFieldsView | null> => {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { hiddenDetailFields: true },
    });
    if (!project) return null;

    const access = await accessFor(await currentUserId(), { projectId });
    if (!access.has("project.view")) return null;

    return {
      projectId,
      hiddenDetailFields: project.hiddenDetailFields,
      canUpdate: access.has("project.update"),
    };
  },
);

// ── Members ──────────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  color: string;
  image: string | null;
  avatarKey: string | null;
};

async function toUser(u: UserRow, pending: boolean): Promise<User> {
  const image = (await resolveAvatarUrl(u.avatarKey)) ?? u.image;
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    color: u.color,
    ...(image ? { image } : {}),
    pending,
  };
}

const byName = [
  { user: { firstName: "asc" as const } },
  { user: { lastName: "asc" as const } },
];

/**
 * Who has access to a project — and where that access comes from.
 *
 * The list is `ProjectMember`: each row a person with their project role,
 * and that decides here (`lib/permissions.ts`). Added on top are only those
 * who can't be downgraded via a project role at all — workspace owners and
 * admins see every project, even without an entry in it. They appear in the
 * list with their workspace role (`source: "workspace"`).
 *
 * The page receives finished rows including `manageable` — which role gets
 * to touch whom is decided by the server, not the client.
 */
const memberRoleSelect = {
  select: { id: true, key: true, name: true, rank: true },
} as const satisfies Prisma.RoleDefaultArgs;

export const getProjectMembersView = cache(
  async (
    projectId: string,
    cursor?: string,
    limit: number = TABLE_PAGE_SIZE,
  ): Promise<ProjectMembersView | null> => {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) return null;
    const { workspaceId } = project;

    const actorId = await currentUserId();
    const access = await accessFor(actorId, { projectId });

    // The list names names and email addresses. Anyone not allowed to see
    // the project gets the same result as for a project that doesn't exist —
    // the page turns this into a 404.
    if (!access.has("project.view")) return null;

    const [projectMembers, workspaceMembers, projectRoles, viewAllRoles] =
      await Promise.all([
        db.projectMember.findMany({
          where: { projectId },
          include: {
            user: true,
            role: memberRoleSelect,
            originTeam: { select: { id: true, name: true, color: true } },
          },
          orderBy: byName,
        }),
        db.workspaceMember.findMany({
          where: { workspaceId },
          include: { user: true, role: memberRoleSelect },
          orderBy: byName,
        }),
        // Assignable are the workspace's project roles plus the
        // project-local roles of exactly this project.
        db.role.findMany({
          where: {
            scope: "PROJECT",
            OR: [
              { system: true },
              { workspaceId, projectId: null },
              { projectId },
            ],
          },
          orderBy: { rank: "desc" },
        }),
        // Which workspace roles let their holders reach through into every
        // project. Replaces the earlier query on the names "owner" and "admin".
        db.role.findMany({
          where: {
            scope: "WORKSPACE",
            OR: [{ system: true }, { workspaceId }],
            permissions: { some: { permissionKey: "project.admin.all" } },
          },
          select: { id: true },
        }),
      ]);

    // Three permissions, three meanings — the UI shows exactly what the
    // corresponding action also allows through (`requireMemberManage`).
    const canAdd = access.has("member.invite");
    const canSetRole = access.has("member.role.update");
    const canRemove = access.has("member.remove");
    const anyManage = canAdd || canSetRole || canRemove;
    const actorRank = anyManage
      ? assignmentCeiling(access, "PROJECT")
      : Number.NEGATIVE_INFINITY;

    const viewAll = new Set(viewAllRoles.map((r) => r.id));
    // Anyone reaching through into every project via their workspace role
    // can't be downgraded via a project role — the resolver decides for
    // them before the project role even applies (rule 3 in lib/permissions.ts).
    const privileged = new Set(
      workspaceMembers
        .filter((m) => viewAll.has(m.roleId))
        .map((m) => m.userId),
    );
    const pendingOf = new Map(
      workspaceMembers.map((m) => [m.userId, m.pending]),
    );

    const rows: ProjectMemberRow[] = await Promise.all(
      projectMembers.map(async (pm) => ({
        user: await toUser(pm.user, pendingOf.get(pm.userId) ?? false),
        role: pm.role.key,
        roleName: pm.role.name,
        roleRank: pm.role.rank,
        source: "project",
        origin: pm.origin,
        originTeam: pm.originTeam ?? undefined,
        pending: pendingOf.get(pm.userId) ?? false,
        you: pm.userId === actorId,
        // Nobody changes a member ranked above them — and their own role
        // certainly not through this table. The workspace leadership stays
        // excluded: the change wouldn't affect their rights anyway.
        //
        // This only says the row is touchable. Which of the three actions is
        // actually allowed is said by `canSetRole` and `canRemove`.
        manageable:
          anyManage &&
          pm.userId !== actorId &&
          !privileged.has(pm.userId) &&
          pm.role.rank <= actorRank,
      })),
    );

    const hasOwnEntry = new Set(projectMembers.map((pm) => pm.userId));
    const candidates: User[] = [];

    for (const wm of workspaceMembers) {
      if (hasOwnEntry.has(wm.userId)) continue;

      const user = await toUser(wm.user, wm.pending);
      // Whoever already has full access to every project anyway doesn't need
      // a project entry — it would just be an empty gesture.
      const isPrivileged = privileged.has(wm.userId);
      if (!isPrivileged) candidates.push(user);

      if (wm.pending) continue;
      // Without a project role there's no access — except for those who
      // hold the master key. Only they appear here without their own entry.
      if (!isPrivileged) continue;

      rows.push({
        user,
        role: wm.role.key,
        roleName: wm.role.name,
        roleRank: wm.role.rank,
        source: "workspace",
        pending: false,
        you: wm.userId === actorId,
        // Only people who already have full access to every project appear
        // here — there's nothing to manage on this row. A project entry
        // wouldn't change their rights, and neither would revoking one.
        manageable: false,
      });
    }

    const assignableRoles: Role[] =
      canSetRole || canAdd
        ? projectRoles
            .filter((r) => r.rank <= actorRank)
            .map((r) => ({
              id: r.key,
              name: r.name,
              desc: r.desc,
              rank: r.rank,
            }))
        : [];
    const defaultRole =
      assignableRoles.find((r) => r.id === DEFAULT_PROJECT_ROLE_KEY)?.id ??
      assignableRoles.at(-1)?.id ??
      "";

    // Not a DB cursor: `rows` is assembled in memory from two fully-read
    // sources (above), not from a query with its own `take`/`cursor`. The
    // page itself stays cheap regardless — for "a few dozen members" the
    // reassembly on each load-more costs nothing that would justify real DB
    // pagination here.
    const offset = cursor ? Number.parseInt(cursor, 10) : 0;
    const page = rows.slice(offset, offset + limit);

    return {
      rows: page,
      candidates: canAdd ? candidates : [],
      assignableRoles,
      defaultRole,
      canAdd,
      canSetRole,
      canRemove,
      canInvite: canAdd,
      nextCursor: offset + limit < rows.length ? String(offset + limit) : null,
    };
  },
);

/**
 * Pending invitations for a project — only the project-bound ones (guests
 * without workspace membership included). The workspace equivalent
 * (`getPendingWorkspaceInvitationsView`) filters on `projectId: null` and
 * deliberately excludes these — the same separation as in the audit log.
 */
export const getPendingProjectInvitationsView = cache(
  async (
    projectId: string,
    cursor?: string,
    limit: number = TABLE_PAGE_SIZE,
  ): Promise<PendingInvitationsView | null> => {
    const access = await accessFor(await currentUserId(), { projectId });
    if (!access.has("member.invite")) return null;

    const now = new Date();
    const invitations = await db.invitation.findMany({
      where: { projectId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { cursor: { token: cursor }, skip: 1 } : {}),
      select: {
        token: true,
        createdAt: true,
        expires: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            projectMemberships: {
              where: { projectId },
              select: { role: { select: { name: true } } },
            },
          },
        },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });

    const rows: PendingInvitationRow[] = invitations.map((inv) => ({
      token: inv.token,
      // See workspaces/queries.ts: an invitation's shadow account always has
      // the invited address, the fallback is purely for type safety.
      email: inv.user.email ?? "",
      firstName: inv.user.firstName,
      lastName: inv.user.lastName,
      roleName: inv.user.projectMemberships[0]?.role.name ?? "—",
      invitedByName: inv.invitedBy
        ? `${inv.invitedBy.firstName} ${inv.invitedBy.lastName}`.trim()
        : null,
      createdAt: inv.createdAt,
      expires: inv.expires,
      expired: inv.expires <= now,
    }));

    return {
      rows,
      canManage: true,
      nextCursor:
        invitations.length === limit
          ? invitations[invitations.length - 1].token
          : null,
    };
  },
);

/** A project's shareable invitation link, along with the roles available
 *  for a new link. The project equivalent of `getWorkspaceInviteLinkView`. */
export const getProjectInviteLinkView = cache(
  async (projectId: string): Promise<InviteLinkView | null> => {
    const access = await accessFor(await currentUserId(), { projectId });
    if (!access.has("member.invite")) return null;

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) return null;

    const actorRank = assignmentCeiling(access, "PROJECT");
    const now = new Date();

    const [roles, link] = await Promise.all([
      db.role.findMany({
        where: {
          scope: "PROJECT",
          OR: [
            { system: true },
            { workspaceId: project.workspaceId, projectId: null },
            { projectId },
          ],
        },
        orderBy: { rank: "desc" },
      }),
      db.inviteLink.findFirst({
        where: { projectId, revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          token: true,
          roleId: true,
          expiresAt: true,
          role: { select: { name: true } },
        },
      }),
    ]);

    const active =
      link && (!link.expiresAt || link.expiresAt > now)
        ? {
            token: link.token,
            url: inviteLinkUrl(link.token),
            roleId: link.roleId,
            roleName: link.role.name,
            expiresAt: link.expiresAt,
          }
        : null;

    return {
      activeLink: active,
      assignableRoles: roles
        .filter((r) => r.rank <= actorRank)
        .map((r) => ({ id: r.key, name: r.name, desc: r.desc, rank: r.rank })),
      canManage: true,
    };
  },
);

// ── Labels ───────────────────────────────────────────────────────────────────

/**
 * The labels that apply in a project — separated into the ones it owns and
 * the ones it inherits from the workspace.
 *
 * The separation isn't cosmetic: the three `label.*` permissions are
 * resolved here in project scope and therefore only cover the project's own
 * labels. A workspace label still appears in the list because it can show
 * up on any issue in this project — but it can only be touched where it
 * actually belongs.
 */
export const getProjectLabelsView = cache(
  async (
    projectId: string,
    ownCursor?: string,
    inheritedCursor?: string,
    limit: number = TABLE_PAGE_SIZE,
  ): Promise<ProjectLabelsView | null> => {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) return null;

    const access = await accessFor(await currentUserId(), { projectId });
    if (!access.has("project.view")) return null;

    const [ownLabels, inheritedLabels, tagged, hidden] = await Promise.all([
      db.label.findMany({
        where: { workspaceId: project.workspaceId, projectId },
        orderBy: { name: "asc" },
        take: limit,
        ...(ownCursor ? { cursor: { id: ownCursor }, skip: 1 } : {}),
      }),
      db.label.findMany({
        where: { workspaceId: project.workspaceId, projectId: null },
        orderBy: { name: "asc" },
        take: limit,
        ...(inheritedCursor
          ? { cursor: { id: inheritedCursor }, skip: 1 }
          : {}),
      }),
      // `Issue.labels` is an ID array without a foreign key — the only way
      // to count usage is to go through this project's arrays once.
      // Deliberately loads only this one column.
      db.issue.findMany({ where: { projectId }, select: { labels: true } }),
      db.projectHiddenLabel.findMany({
        where: { projectId },
        select: { labelId: true },
      }),
    ]);

    const used = new Map<string, number>();
    for (const issue of tagged) {
      for (const id of issue.labels) used.set(id, (used.get(id) ?? 0) + 1);
    }

    const hiddenIds = new Set(hidden.map((h) => h.labelId));

    const toRow = (l: (typeof ownLabels)[number]): ProjectLabelRow => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      color: l.color,
      issueCount: used.get(l.id) ?? 0,
      hidden: hiddenIds.has(l.id),
    });

    return {
      own: ownLabels.map(toRow),
      inherited: inheritedLabels.map(toRow),
      canCreate: access.has("label.create"),
      canUpdate: access.has("label.update"),
      canDelete: access.has("label.delete"),
      ownNextCursor:
        ownLabels.length === limit ? ownLabels[ownLabels.length - 1].id : null,
      inheritedNextCursor:
        inheritedLabels.length === limit
          ? inheritedLabels[inheritedLabels.length - 1].id
          : null,
    };
  },
);
