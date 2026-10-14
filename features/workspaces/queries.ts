import "server-only";
import { cache } from "react";
import {
  getIssueTypes,
  getLabels,
  getMembers,
  getPriorities,
  getProjects,
  getRoles,
  getSearchIssues,
  getStatuses,
  getUserWorkspaces,
  getWorkspace,
} from "@/features/issues/queries";
import type { ProjectVisibility } from "@/features/projects/types";
import type {
  InviteLinkView,
  PendingInvitationRow,
  PendingInvitationsView,
  ProjectWithWorkspace,
  TeamProjectRow,
  WorkspaceLabelRow,
  WorkspaceLabelsView,
  WorkspaceMemberRow,
  WorkspaceMembersView,
  WorkspaceProjectRow,
  WorkspaceProjectsView,
  WorkspaceSettingsView,
  WorkspaceTeamRow,
  WorkspaceTeamsView,
} from "@/features/workspaces/types";
import { getCurrentWorkspaceId } from "@/lib/current-workspace";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { inviteLinkUrl } from "@/lib/invite-links";
import { TABLE_PAGE_SIZE } from "@/lib/pagination";
import {
  accessFor,
  assignmentCeiling,
  currentUserCanEnterWorkspace,
  currentUserId,
  visibleProjectIds,
} from "@/lib/permissions";
import { OWNER_ROLE_KEY } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { closedStatusIds } from "@/lib/statuses";
import { resolveAvatarUrl } from "@/lib/storage";
import type {
  IssueType,
  Label,
  Priority,
  Project,
  Role,
  SearchableIssue,
  Status,
  User,
  Workspace,
} from "@/types";

// Server-side replacement for the former `useWorkspace()` client context —
// the same pattern as `getSession()`: no prop drilling, no provider needed,
// callable directly from any Server Component. The active workspace id comes
// from the request store (`lib/current-workspace.ts`), which the app layout seeds.
//
// All functions are deduplicated per request via `cache()` — multiple calls
// from different components cost only one DB query.

/** Active workspace id, or an error outside the workspace shell (e.g. /admin). */
function requireWorkspaceId(): string {
  const id = getCurrentWorkspaceId();
  if (!id) {
    throw new Error(
      "No active workspace in the request — this query can only be used inside the workspace shell.",
    );
  }
  return id;
}

/** Current workspace, or `null` outside the workspace shell. Analogous to `getSession()`. */
export const getCurrentWorkspace = cache(
  async (): Promise<Workspace | null> => {
    const id = getCurrentWorkspaceId();
    return id ? getWorkspace(id) : null;
  },
);

/** All workspaces of the logged-in user. */
export const getMyWorkspaces = cache(async (): Promise<Workspace[]> => {
  const session = await getSession();
  return session ? getUserWorkspaces(session.userId) : [];
});

/**
 * Every project the logged-in user is allowed to see — across all of their
 * workspaces, not just the current one.
 *
 * Meant for navigation that reaches beyond a single workspace's boundary
 * (the project switcher in settings). `getProjects` already applies the
 * visibility rule: what it returns are exactly the projects with
 * `project.view` — the same hurdle the project settings depend on. So
 * whatever's listed here is also reachable.
 *
 * Costs one resolution per workspace (`accessibleProjectIds`), not per
 * project. Whoever is in many workspaces pays that cost accordingly — both
 * are `cache`d and incurred only once per request.
 */
export const getMyProjects = cache(
  async (): Promise<ProjectWithWorkspace[]> => {
    const workspaces = await getMyWorkspaces();
    const lists = await Promise.all(workspaces.map((ws) => getProjects(ws.id)));
    return workspaces.flatMap((ws, i) =>
      (lists[i] ?? []).map((project) => ({
        ...project,
        workspaceId: ws.id,
        workspaceName: ws.name,
      })),
    );
  },
);

/**
 * The logged-in user as a member of the active workspace.
 *
 * The normal case is the row from the member list — it comes with role and
 * rank. Whoever isn't in it isn't necessarily nobody, though: a project
 * guest is invited to exactly one project and has no workspace membership.
 * For them, the data comes directly from their account, without a role.
 *
 * Without this second path, `getMe()` would be `null` for guests — and
 * since the issue UI depends on it (`getIssueComposerData`), they'd hit a
 * 404 everywhere, even though their access to the project is fine.
 */
export const getMe = cache(async (): Promise<User | null> => {
  const session = await getSession();
  if (!session) return null;

  const members = await getWorkspaceMembers();
  const member = members.find((m) => m.id === session.userId);
  if (member) return member;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      handle: true,
      email: true,
      color: true,
      image: true,
      avatarKey: true,
    },
  });
  if (!user) return null;

  const image = (await resolveAvatarUrl(user.avatarKey)) ?? user.image;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    handle: user.handle,
    email: user.email,
    color: user.color,
    ...(image ? { image } : {}),
  };
});

export const getWorkspaceMembers = cache(
  async (): Promise<User[]> => getMembers(requireWorkspaceId()),
);

export const getWorkspaceProjects = cache(
  async (): Promise<Project[]> => getProjects(requireWorkspaceId()),
);

export const getWorkspaceLabels = cache(
  async (): Promise<Label[]> => getLabels(requireWorkspaceId()),
);

export const getWorkspaceStatuses = cache(
  async (): Promise<Status[]> => getStatuses(requireWorkspaceId()),
);

export const getWorkspacePriorities = cache(
  async (): Promise<Priority[]> => getPriorities(requireWorkspaceId()),
);

export const getWorkspaceIssueTypes = cache(
  async (): Promise<IssueType[]> => getIssueTypes(requireWorkspaceId()),
);

export const getWorkspaceRoles = cache(
  async (): Promise<Role[]> => getRoles(requireWorkspaceId()),
);

export const getWorkspaceSearchIssues = cache(
  async (): Promise<SearchableIssue[]> => getSearchIssues(requireWorkspaceId()),
);

// ─── Workspace settings ─────────────────────────────────────────────────────
//
// Five views, one per section of the settings page. Structured like the
// project's (`features/projects/queries.ts`): each returns ready-made rows
// along with the permissions that go with them, and `null` means "doesn't
// exist for you" — the page turns this into a 404 without revealing whether
// the workspace is missing or entry is denied.
//
// Entry itself isn't a permission (see `canEnterWorkspace`): whoever doesn't
// belong gets nothing here at all, not even the empty list.

/** The workspace's core data along with what depends on it. */
export const getWorkspaceSettingsView = cache(
  async (): Promise<WorkspaceSettingsView | null> => {
    const workspaceId = requireWorkspaceId();
    if (!(await currentUserCanEnterWorkspace(workspaceId))) return null;

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        desc: true,
        avatarKey: true,
        _count: { select: { projects: true, members: true } },
        links: {
          select: { id: true, label: true, url: true },
          orderBy: { position: "asc" },
        },
        domains: {
          select: { domain: true },
          orderBy: { domain: "asc" },
        },
      },
    });
    if (!workspace) return null;

    // The total count, not the count of visible projects: it appears in the
    // deletion warning and therefore has to tell the truth.
    const issueCount = await db.issue.count({
      where: { project: { workspaceId } },
    });

    const access = await accessFor(await currentUserId(), { workspaceId });

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        color: workspace.color,
        desc: workspace.desc,
        avatarUrl: await resolveAvatarUrl(workspace.avatarKey),
        projectCount: workspace._count.projects,
        memberCount: workspace._count.members,
        issueCount,
        links: workspace.links,
        domains: workspace.domains.map((d) => d.domain),
      },
      canUpdate: access.has("workspace.update"),
      canDelete: access.has("workspace.delete"),
    };
  },
);

/**
 * The workspace's projects as an overview — with the permissions per row.
 *
 * `project.update` and `project.delete` apply at the project level, not the
 * workspace level. They're therefore resolved per project: leading one by
 * no means grants the right to change all of them. The workspace's
 * leadership reaches through everywhere anyway via `project.admin.all` —
 * that too is decided by the resolver, not this list.
 */
const workspaceProjectSelect = {
  id: true,
  name: true,
  slug: true,
  prefix: true,
  color: true,
  avatarKey: true,
  desc: true,
  visibility: true,
  _count: { select: { issues: true, members: true } },
  // Only the first four: the avatar stack doesn't show more anyway, and the
  // total count sits right next to it (`_count.members`).
  members: {
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
    orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
    take: 4,
  },
} satisfies Prisma.ProjectSelect;

async function toWorkspaceProjectRows(
  projects: Prisma.ProjectGetPayload<{
    select: typeof workspaceProjectSelect;
  }>[],
  userId: string | null,
): Promise<WorkspaceProjectRow[]> {
  return Promise.all(
    projects.map(async (project): Promise<WorkspaceProjectRow> => {
      const access = await accessFor(userId, { projectId: project.id });
      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        prefix: project.prefix,
        color: project.color,
        avatarUrl: await resolveAvatarUrl(project.avatarKey),
        desc: project.desc,
        visibility: project.visibility as ProjectVisibility,
        issueCount: project._count.issues,
        memberCount: project._count.members,
        members: await Promise.all(
          project.members.map(async (m) => {
            const { avatarKey, ...user } = m.user;
            return {
              ...user,
              image:
                (await resolveAvatarUrl(avatarKey)) ?? user.image ?? undefined,
            };
          }),
        ),
        canUpdate: access.has("project.update"),
        canDelete: access.has("project.delete"),
      };
    }),
  );
}

export const getWorkspaceProjectsView = cache(
  async (
    cursor?: string,
    publicCursor?: string,
    privateCursor?: string,
    limit: number = TABLE_PAGE_SIZE,
  ): Promise<WorkspaceProjectsView | null> => {
    const workspaceId = requireWorkspaceId();
    if (!(await currentUserCanEnterWorkspace(workspaceId))) return null;

    const userId = await currentUserId();
    const visible = await visibleProjectIds(workspaceId);
    const access = await accessFor(userId, { workspaceId });
    // The same master keys that make `accessibleProjectIds` unlock every
    // project — just asked here in workspace scope, where support already
    // holds every permission anyway. Whoever has them may split the list by
    // visibility.
    const seesAllProjects =
      access.has("project.view.all") || access.has("project.admin.all");
    const canCreate = access.has("project.create");

    if (seesAllProjects) {
      const [publicProjects, privateProjects] = await Promise.all([
        db.project.findMany({
          where: {
            workspaceId,
            id: { in: [...visible] },
            visibility: "public",
          },
          select: workspaceProjectSelect,
          orderBy: { name: "asc" },
          take: limit,
          ...(publicCursor ? { cursor: { id: publicCursor }, skip: 1 } : {}),
        }),
        db.project.findMany({
          where: {
            workspaceId,
            id: { in: [...visible] },
            visibility: "private",
          },
          select: workspaceProjectSelect,
          orderBy: { name: "asc" },
          take: limit,
          ...(privateCursor ? { cursor: { id: privateCursor }, skip: 1 } : {}),
        }),
      ]);

      return {
        rows: [],
        publicRows: await toWorkspaceProjectRows(publicProjects, userId),
        privateRows: await toWorkspaceProjectRows(privateProjects, userId),
        canCreate,
        seesAllProjects,
        nextCursor: null,
        publicNextCursor:
          publicProjects.length === limit
            ? publicProjects[publicProjects.length - 1].id
            : null,
        privateNextCursor:
          privateProjects.length === limit
            ? privateProjects[privateProjects.length - 1].id
            : null,
      };
    }

    const projects = await db.project.findMany({
      where: { workspaceId, id: { in: [...visible] } },
      select: workspaceProjectSelect,
      orderBy: { name: "asc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    return {
      rows: await toWorkspaceProjectRows(projects, userId),
      publicRows: [],
      privateRows: [],
      canCreate,
      seesAllProjects,
      nextCursor:
        projects.length === limit ? projects[projects.length - 1].id : null,
      publicNextCursor: null,
      privateNextCursor: null,
    };
  },
);

/**
 * The workspace's labels, separated from those of its projects.
 *
 * On top, what applies everywhere and can be changed here. Below, what
 * belongs to individual projects: the same columns, but for reference
 * only — the `label.*` permissions are resolved here in workspace scope,
 * and that doesn't cover a project label (`features/issues/actions.ts`,
 * `labelScope`).
 */
export const getWorkspaceLabelsView = cache(
  async (
    ownCursor?: string,
    fromProjectsCursor?: string,
    limit: number = TABLE_PAGE_SIZE,
  ): Promise<WorkspaceLabelsView | null> => {
    const workspaceId = requireWorkspaceId();
    if (!(await currentUserCanEnterWorkspace(workspaceId))) return null;

    const labelSelect = {
      id: true,
      name: true,
      slug: true,
      color: true,
      project: { select: { name: true, slug: true } },
    } as const;

    const [ownLabels, projectLabels, tagged, hidden] = await Promise.all([
      db.label.findMany({
        where: { workspaceId, projectId: null },
        select: labelSelect,
        orderBy: { name: "asc" },
        take: limit,
        ...(ownCursor ? { cursor: { id: ownCursor }, skip: 1 } : {}),
      }),
      db.label.findMany({
        where: { workspaceId, projectId: { not: null } },
        select: labelSelect,
        orderBy: { name: "asc" },
        take: limit,
        ...(fromProjectsCursor
          ? { cursor: { id: fromProjectsCursor }, skip: 1 }
          : {}),
      }),
      // `Issue.labels` is an ID array without a foreign key — the only way
      // to count is to go through the workspace's arrays once.
      db.issue.findMany({
        where: { project: { workspaceId } },
        select: { labels: true },
      }),
      db.projectHiddenLabel.groupBy({
        by: ["labelId"],
        where: { project: { workspaceId } },
        _count: { labelId: true },
      }),
    ]);

    const used = new Map<string, number>();
    for (const issue of tagged) {
      for (const id of issue.labels) used.set(id, (used.get(id) ?? 0) + 1);
    }
    const hiddenIn = new Map(hidden.map((h) => [h.labelId, h._count.labelId]));

    const toRow = (l: (typeof ownLabels)[number]): WorkspaceLabelRow => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      color: l.color,
      issueCount: used.get(l.id) ?? 0,
      hiddenIn: hiddenIn.get(l.id) ?? 0,
      ...(l.project
        ? { projectName: l.project.name, projectSlug: l.project.slug }
        : {}),
    });

    const access = await accessFor(await currentUserId(), { workspaceId });

    return {
      own: ownLabels.map(toRow),
      fromProjects: projectLabels.map(toRow),
      canCreate: access.has("label.create"),
      canUpdate: access.has("label.update"),
      canDelete: access.has("label.delete"),
      ownNextCursor:
        ownLabels.length === limit ? ownLabels[ownLabels.length - 1].id : null,
      fromProjectsNextCursor:
        projectLabels.length === limit
          ? projectLabels[projectLabels.length - 1].id
          : null,
    };
  },
);

/**
 * The workspace's teams — who's in them, what they're working on, how much
 * is open.
 *
 * A team groups people and projects. It grants rights only where a
 * `TeamProject` link explicitly carries a role — that then lands in
 * `ProjectMember` like any other assignment (`syncProjectTeamRoles`,
 * lib/project-membership.ts) and takes effect through the usual path. For
 * reading here, mere entry to the workspace is enough; the five `team.*`
 * permissions only govern changes.
 */
export const getWorkspaceTeamsView = cache(
  async (
    cursor?: string,
    limit: number = TABLE_PAGE_SIZE,
  ): Promise<WorkspaceTeamsView | null> => {
    const workspaceId = requireWorkspaceId();
    if (!(await currentUserCanEnterWorkspace(workspaceId))) return null;

    const actorId = await currentUserId();
    const access = await accessFor(actorId, { workspaceId });
    // Without `team.view.all`, only the teams you're a member of yourself —
    // not a gate like for members, but a filtered list instead of an empty
    // one (`lib/rbac/permissions.ts`).
    const canViewAllTeams = access.has("team.view.all");

    const [teams, members, projects, assignableProjectRoles] =
      await Promise.all([
        db.team.findMany({
          where: {
            workspaceId,
            ...(canViewAllTeams || !actorId
              ? {}
              : { members: { some: { userId: actorId } } }),
          },
          include: {
            lead: true,
            members: { select: { userId: true } },
            projects: {
              select: {
                projectId: true,
                role: { select: { key: true, name: true, rank: true } },
              },
            },
          },
          orderBy: { name: "asc" },
          take: limit,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
        getMembers(workspaceId),
        db.project.findMany({
          where: { workspaceId },
          select: { id: true, name: true, color: true },
          orderBy: { name: "asc" },
        }),
        // Project roles that apply in every project of the workspace — the
        // only ones that can be offered for a team without regard to a
        // specific project. See the comment on
        // `WorkspaceTeamsView.assignableProjectRoles`.
        db.role.findMany({
          where: {
            scope: "PROJECT",
            OR: [{ system: true }, { workspaceId, projectId: null }],
          },
          select: { key: true, name: true, rank: true },
          orderBy: { rank: "desc" },
        }),
      ]);

    // One query for all teams instead of one per team: count the open
    // tasks per project once, then assign them afterward.
    const openPerProject = await db.issue.groupBy({
      by: ["projectId"],
      where: {
        project: { workspaceId },
        status: { notIn: await closedStatusIds() },
      },
      _count: { _all: true },
    });
    const openOf = new Map(
      openPerProject.map((p) => [p.projectId, p._count._all]),
    );

    const userById = new Map(members.map((m) => [m.id, m]));
    const projectById = new Map(projects.map((p) => [p.id, p]));

    const rows: WorkspaceTeamRow[] = await Promise.all(
      teams.map(async (team) => {
        const teamProjects: TeamProjectRow[] = team.projects
          .map((p) => {
            const project = projectById.get(p.projectId);
            if (!project) return undefined;
            return { ...project, role: p.role };
          })
          .filter((p) => p !== undefined);

        const leadImage =
          (await resolveAvatarUrl(team.lead.avatarKey)) ?? team.lead.image;

        return {
          id: team.id,
          name: team.name,
          key: team.key,
          color: team.color,
          desc: team.desc,
          // The lead is fixed via the foreign key and doesn't have to still
          // be a workspace member — in that case they're missing from
          // `members`, and the row takes their core data directly from the
          // relation.
          lead: userById.get(team.leadId) ?? {
            id: team.lead.id,
            firstName: team.lead.firstName,
            lastName: team.lead.lastName,
            email: team.lead.email,
            color: team.lead.color,
            ...(leadImage ? { image: leadImage } : {}),
          },
          members: team.members
            .map((m) => userById.get(m.userId))
            .filter((m) => m !== undefined),
          projects: teamProjects,
          openIssues: teamProjects.reduce(
            (sum, p) => sum + (openOf.get(p.id) ?? 0),
            0,
          ),
        };
      }),
    );

    return {
      rows,
      candidates: members,
      projects,
      assignableProjectRoles,
      canCreate: access.has("team.create"),
      canUpdate: access.has("team.update"),
      canDelete: access.has("team.delete"),
      canManageMembers: access.has("team.member.manage"),
      canManageProjects: access.has("team.project.manage"),
      nextCursor: teams.length === limit ? teams[teams.length - 1].id : null,
    };
  },
);

/**
 * The workspace's members with role, teams, and status.
 *
 * The rank rules exist twice: here for the UI, and in the actions for
 * enforcement (`setMemberRole`, `removeMember`). Both sides compare against
 * the rank of the actor's **own workspace role** — not the ceiling from
 * `assignmentCeiling`. Someone with no role in the workspace at all
 * (support access via `tenant.access`) would otherwise end up with a
 * selection every action then rejects.
 */
export const getWorkspaceMembersView = cache(
  async (
    cursor?: string,
    limit: number = TABLE_PAGE_SIZE,
  ): Promise<WorkspaceMembersView | null> => {
    const workspaceId = requireWorkspaceId();
    if (!(await currentUserCanEnterWorkspace(workspaceId))) return null;

    const actorId = await currentUserId();
    const access = await accessFor(actorId, { workspaceId });
    if (!access.has("member.view")) return null;

    const [rowsRaw, teams, roles] = await Promise.all([
      db.workspaceMember.findMany({
        where: { workspaceId },
        include: {
          user: true,
          role: { select: { key: true, name: true, rank: true } },
        },
        orderBy: [
          { user: { firstName: "asc" } },
          { user: { lastName: "asc" } },
        ],
        take: limit,
        ...(cursor
          ? {
              cursor: { workspaceId_userId: { workspaceId, userId: cursor } },
              skip: 1,
            }
          : {}),
      }),
      db.team.findMany({
        where: { workspaceId },
        select: {
          id: true,
          name: true,
          color: true,
          members: { select: { userId: true } },
        },
        orderBy: { name: "asc" },
      }),
      getRoles(workspaceId),
    ]);

    const canInvite = access.has("member.invite");
    const canSetRole = access.has("member.role.update");
    const canRemove = access.has("member.remove");
    const actorRank = access.rank("WORKSPACE");

    const teamsOf = new Map<
      string,
      { id: string; name: string; color: string }[]
    >();
    for (const team of teams) {
      for (const member of team.members) {
        const list = teamsOf.get(member.userId) ?? [];
        list.push({ id: team.id, name: team.name, color: team.color });
        teamsOf.set(member.userId, list);
      }
    }

    const rows: WorkspaceMemberRow[] = await Promise.all(
      rowsRaw.map(async (m) => {
        const image =
          (await resolveAvatarUrl(m.user.avatarKey)) ?? m.user.image;
        return {
          user: {
            id: m.user.id,
            firstName: m.user.firstName,
            lastName: m.user.lastName,
            handle: m.user.handle,
            email: m.user.email,
            color: m.user.color,
            ...(image ? { image } : {}),
            role: m.role.key,
            roleRank: m.role.rank,
            pending: m.pending,
          },
          role: m.role.key,
          roleName: m.role.name,
          roleRank: m.role.rank,
          pending: m.pending,
          teams: teamsOf.get(m.userId) ?? [],
          you: m.userId === actorId,
          // The owner stays untouchable — only an ownership transfer leads
          // to owner, and no button leads out of the role.
          manageable:
            (canSetRole || canRemove) &&
            m.userId !== actorId &&
            m.role.key !== OWNER_ROLE_KEY &&
            m.role.rank <= actorRank,
        };
      }),
    );

    const assignableRoles =
      canSetRole || canInvite
        ? roles.filter((r) => r.id !== OWNER_ROLE_KEY && r.rank <= actorRank)
        : [];

    return {
      rows,
      assignableRoles,
      canInvite,
      canSetRole,
      canRemove,
      nextCursor:
        rowsRaw.length === limit ? rowsRaw[rowsRaw.length - 1].userId : null,
    };
  },
);

/**
 * The workspace's pending invitations — not yet accepted, regardless of
 * whether they've already expired (the row shows that instead of hiding
 * them).
 *
 * Only the workspace-wide invitations: one with a `projectId` belongs to a
 * project guest without workspace membership (see `inviteOneProjectMember`)
 * and is handled by `getPendingProjectInvitationsView` — the same
 * separation as `whereFor()` uses in the audit log between the workspace
 * and project feeds.
 */
export const getPendingWorkspaceInvitationsView = cache(
  async (
    cursor?: string,
    limit: number = TABLE_PAGE_SIZE,
  ): Promise<PendingInvitationsView | null> => {
    const workspaceId = requireWorkspaceId();
    if (!(await currentUserCanEnterWorkspace(workspaceId))) return null;

    const actorId = await currentUserId();
    const access = await accessFor(actorId, { workspaceId });
    if (!access.has("member.invite")) return null;

    const now = new Date();
    const invitations = await db.invitation.findMany({
      where: { workspaceId, projectId: null, acceptedAt: null },
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
            workspaces: {
              where: { workspaceId },
              select: { role: { select: { name: true } } },
            },
          },
        },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });

    const rows: PendingInvitationRow[] = invitations.map((inv) => ({
      token: inv.token,
      // An invitation's shadow account is always created with the invited
      // address (`inviteOneWorkspaceMember`) — unlike a passkey-first
      // account, `email` here is never empty. The fallback is purely for
      // type safety, not an expected case.
      email: inv.user.email ?? "",
      firstName: inv.user.firstName,
      lastName: inv.user.lastName,
      roleName: inv.user.workspaces[0]?.role.name ?? "—",
      invitedByName: inv.invitedBy
        ? `${inv.invitedBy.firstName} ${inv.invitedBy.lastName}`.trim()
        : null,
      createdAt: inv.createdAt,
      expires: inv.expires,
      expired: inv.expires <= now,
    }));

    return {
      rows,
      canManage: access.has("member.invite"),
      nextCursor:
        invitations.length === limit
          ? invitations[invitations.length - 1].token
          : null,
    };
  },
);

/** The workspace's shareable invitation link, along with the roles
 *  available for creating a new one. */
export const getWorkspaceInviteLinkView = cache(
  async (): Promise<InviteLinkView | null> => {
    const workspaceId = requireWorkspaceId();
    if (!(await currentUserCanEnterWorkspace(workspaceId))) return null;

    const actorId = await currentUserId();
    const access = await accessFor(actorId, { workspaceId });
    if (!access.has("member.invite")) return null;

    const ceiling = assignmentCeiling(access, "WORKSPACE");
    const now = new Date();

    const [roles, link] = await Promise.all([
      getRoles(workspaceId),
      db.inviteLink.findFirst({
        where: { workspaceId, projectId: null, revokedAt: null },
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
      assignableRoles: roles.filter(
        (r) => r.id !== OWNER_ROLE_KEY && r.rank <= ceiling,
      ),
      canManage: true,
    };
  },
);
