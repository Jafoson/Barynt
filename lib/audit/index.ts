import "server-only";
import type { AuditAction, AuditEntry, AuditTarget } from "@/lib/audit/actions";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveAvatarUrl } from "@/lib/storage";

// ─── Audit log: writing and reading ─────────────────────────────────────────────
//
// The events themselves live in `lib/audit/actions.ts` — dependency-free, so
// the UI can name them without pulling the Prisma client into the bundle.
// This is where what only the server does lives.
//
// ── Two ways in ──
//
// `recordAudit` swallows its errors: a login shouldn't fail because the log
// is jammed. `recordAuditIn` writes into a running transaction and swallows
// nothing — for events where the entry isn't just accompanying, it's the
// point. Break-glass access uses this path: the membership and its log
// entry come into being together, or not at all.

// The registry gets re-exported through this module: server code imports
// `@/lib/audit` and gets both, without needing to know two paths. Whoever
// renders in the browser imports `@/lib/audit/actions` directly.
export * from "@/lib/audit/actions";

export interface AuditInput {
  action: AuditAction;
  /** Who acted. The label is looked up from this. */
  actorId?: string | null;
  /**
   * Label for the actor when there's no id — for a failed login this holds
   * the typed-in address. If both are set, the looked-up name wins.
   */
  actorLabel?: string;
  target?: AuditTarget;
  /**
   * Account color of the person the event is about, when the target itself
   * isn't a person — for an assignment, say, the target is "issue", not the
   * new assignee. Optional, because not every event names a person.
   */
  personColor?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  /** The justification — mandatory for break-glass access, otherwise empty. */
  reason?: string | null;
  meta?: Prisma.InputJsonValue;
}

/** The narrow slice of `db` the log needs. */
type AuditClient = Pick<typeof db, "auditLog" | "user">;

const UNKNOWN_ACTOR = "Unbekannt";

interface ActorInfo {
  label: string;
  color: string | null;
}

/**
 * What the actor was called and looked like (avatar color) at the time of
 * the action.
 *
 * Both are frozen at write time, not resolved at read time. Whoever later
 * marries, renames their account, changes their color, or gets deleted
 * doesn't retroactively change what's in the log — and a deleted account
 * doesn't leave a row without a name (only without a color, in which case
 * the list shows the placeholder avatar).
 */
async function actorInfoFor(
  client: AuditClient,
  actorId: string | null | undefined,
  fallback: string | undefined,
): Promise<ActorInfo> {
  if (!actorId)
    return { label: fallback?.trim() || UNKNOWN_ACTOR, color: null };
  const user = await client.user.findUnique({
    where: { id: actorId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      handle: true,
      color: true,
    },
  });
  if (!user) return { label: fallback?.trim() || UNKNOWN_ACTOR, color: null };
  // Passkey accounts without an address: `@handle` instead of the
  // parenthetical, so the row still stays unambiguous instead of showing
  // "(null)".
  return {
    label:
      `${user.firstName} ${user.lastName} (${user.email ?? `@${user.handle}`})`.trim(),
    color: user.color,
  };
}

function rowFor(input: AuditInput, actor: ActorInfo) {
  return {
    action: input.action,
    actorId: input.actorId ?? null,
    actorLabel: actor.label,
    actorColor: actor.color,
    targetType: input.target?.type ?? null,
    targetId: input.target?.id ?? null,
    targetLabel: input.target?.label ?? null,
    personColor: input.personColor ?? null,
    workspaceId: input.workspaceId ?? null,
    projectId: input.projectId ?? null,
    reason: input.reason?.trim() || null,
    ...(input.meta === undefined ? {} : { meta: input.meta }),
  };
}

/**
 * Log an event, inside a running transaction.
 *
 * Errors propagate here. For events where the entry isn't just
 * accompanying but the precondition: a break-glass access without a log
 * entry would be exactly what the log is meant to prevent.
 */
export async function recordAuditIn(
  client: AuditClient,
  input: AuditInput,
): Promise<void> {
  const actor = await actorInfoFor(client, input.actorId, input.actorLabel);
  await client.auditLog.create({ data: rowFor(input, actor) });
}

/**
 * Log an event.
 *
 * Swallows its errors and only reports them to the console: a login, a role
 * change, or a deletion shouldn't fail because the log happens to be
 * jammed. Whoever doesn't want that uses `recordAuditIn`.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await recordAuditIn(db, input);
  } catch (error) {
    console.error("[audit] Eintrag nicht geschrieben:", input.action, error);
  }
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export interface AuditFilter {
  /** Only events of this workspace. If omitted: the whole platform. */
  workspaceId?: string;
  /** Only events of this project. */
  projectId?: string;
  action?: AuditAction;
  actorId?: string;
  /** Only events on this one target — e.g. a single issue's id, for its
   *  activity tab. Combine with `projectId` where available: `targetId`
   *  alone is already unique, `projectId` is defense-in-depth against a
   *  same-id collision across target types. */
  targetId?: string;
  /**
   * Only events involving this person — as actor or as target. For views
   * without `audit.view`: whoever can't see the full list at least sees
   * what they did themselves or what happened to them (added, removed,
   * re-rolled). Pure object events where the person is neither actor nor
   * target are correctly excluded by this.
   */
  selfOnly?: string;
  /** Maximum number of rows. Default 100, cap 500. */
  limit?: number;
  /** Load more starting after (exclusive) this id, for infinite scroll. */
  cursor?: string;
}

/**
 * Issue events and project-bound label events carry `workspaceId` just as
 * much as `projectId` (see `recordIssueAudit` and `createLabel` in
 * `features/issues/actions.ts`) — not because they belong to the workspace
 * as a whole, but so they show up in the project feed, whose query only
 * knows `projectId`. In the workspace feed (`workspaceId` without
 * `projectId`), on the other hand, they'd be the day-to-day business of
 * each individual project, not of the workspace — and would spam it. A
 * label without `projectId` is created directly in the workspace context
 * (`WorkspaceLabels`) and stays visible.
 */
function whereFor(filter: AuditFilter): Prisma.AuditLogWhereInput {
  const workspaceFeed = filter.workspaceId && !filter.projectId;

  return {
    ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.targetId ? { targetId: filter.targetId } : {}),
    ...(filter.selfOnly
      ? {
          OR: [
            { actorId: filter.selfOnly },
            { targetType: "user", targetId: filter.selfOnly },
          ],
        }
      : {}),
    ...(workspaceFeed
      ? {
          NOT: [
            { action: { startsWith: "issue." } },
            { action: "label.created", projectId: { not: null } },
            { action: "label.deleted", projectId: { not: null } },
          ],
        }
      : {}),
  };
}

/**
 * Read the log, newest first.
 *
 * Does **not** check permissions itself — the slice is the permission. The
 * callers ensure `audit.view` in the appropriate context and pass exactly
 * the slice they checked for: the platform admin panel everything, a
 * workspace view only its own `workspaceId`.
 */
export async function listAudit(
  filter: AuditFilter = {},
): Promise<AuditEntry[]> {
  const take = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const entries = await db.auditLog.findMany({
    where: whereFor(filter),
    orderBy: { createdAt: "desc" },
    take,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      action: true,
      actorId: true,
      actorLabel: true,
      actorColor: true,
      targetType: true,
      targetId: true,
      targetLabel: true,
      personColor: true,
      workspaceId: true,
      projectId: true,
      reason: true,
      // Unlike previously documented, it is included in the selection after
      // all: some issue events carry rendering hints in it (status/priority
      // ids, label colors) for the icon and chip in `TargetLabel`. The rest
      // of the rows carry `null` here and stay untouched.
      meta: true,
    },
  });
  // `projectRef`/`workspaceRef`/`actorAvatarUrl` aren't columns —
  // placeholders that the three functions below fill in, just like
  // `withCurrentColor` does for a missing `actorColor`.
  const withPlaceholder: AuditEntry[] = entries.map((entry) => ({
    ...entry,
    actorAvatarUrl: null,
    projectRef: null,
    workspaceRef: null,
  }));
  const withColor = await withCurrentColor(withPlaceholder);
  const withAvatar = await withActorAvatar(withColor);
  const withProject = await withProjectRef(withAvatar);
  return withWorkspaceRef(withProject);
}

/**
 * Fills in the current account color where none was frozen — rows created
 * before this column existed. Unlike `actorLabel`, historical accuracy
 * doesn't apply to the color: an avatar without a color would just be a
 * gray placeholder, and today's color is a better answer than none at all.
 * New rows already bring their own color (`actorInfoFor`) and trigger
 * nothing here.
 */
async function withCurrentColor(entries: AuditEntry[]): Promise<AuditEntry[]> {
  const missing = [
    ...new Set(
      entries
        .filter((e) => e.actorColor === null && e.actorId)
        .map((e) => e.actorId as string),
    ),
  ];
  if (missing.length === 0) return entries;

  const users = await db.user.findMany({
    where: { id: { in: missing } },
    select: { id: true, color: true },
  });
  const colorOf = new Map(users.map((u) => [u.id, u.color]));

  return entries.map((entry) =>
    entry.actorColor === null && entry.actorId && colorOf.has(entry.actorId)
      ? { ...entry, actorColor: colorOf.get(entry.actorId) as string }
      : entry,
  );
}

/**
 * Fills in the actor's profile picture, looked up live — unlike
 * `actorColor`, no historical accuracy applies here (see
 * `AuditEntry.actorAvatarUrl`): a signed URL would be invalid after an hour
 * anyway, so "frozen" wouldn't make sense. A deleted account yields no
 * picture — the list then shows the color or placeholder avatar.
 */
async function withActorAvatar(entries: AuditEntry[]): Promise<AuditEntry[]> {
  const actorIds = [
    ...new Set(
      entries.filter((e) => e.actorId).map((e) => e.actorId as string),
    ),
  ];
  if (actorIds.length === 0) return entries;

  const users = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, avatarKey: true },
  });
  const avatarOf = new Map(
    await Promise.all(
      users.map(
        async (u) => [u.id, await resolveAvatarUrl(u.avatarKey)] as const,
      ),
    ),
  );

  return entries.map((entry) =>
    entry.actorId && avatarOf.has(entry.actorId)
      ? { ...entry, actorAvatarUrl: avatarOf.get(entry.actorId) ?? null }
      : entry,
  );
}

/**
 * Fills in slug, name, color, and profile picture of the project the row
 * belongs to — for the link plus avatar in `TargetLabel` (`AuditLog`/
 * `ActivityFeed`). No foreign key on `AuditLog` (see
 * `prisma/schema.prisma`), so this is the only way to a clickable project:
 * a batched follow-up query, no different from `withCurrentColor` next
 * door. A project that has since been deleted yields `null` — the row then
 * stays unlinked text instead of a dead link.
 */
async function withProjectRef(entries: AuditEntry[]): Promise<AuditEntry[]> {
  const projectIds = [
    ...new Set(
      entries.filter((e) => e.projectId).map((e) => e.projectId as string),
    ),
  ];
  if (projectIds.length === 0) return entries;

  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, slug: true, name: true, color: true, avatarKey: true },
  });
  const refOf = new Map(
    await Promise.all(
      projects.map(
        async (p) =>
          [
            p.id,
            {
              slug: p.slug,
              name: p.name,
              color: p.color,
              avatarUrl: await resolveAvatarUrl(p.avatarKey),
            },
          ] as const,
      ),
    ),
  );

  return entries.map((entry) =>
    entry.projectId && refOf.has(entry.projectId)
      ? { ...entry, projectRef: refOf.get(entry.projectId) ?? null }
      : entry,
  );
}

/**
 * The same for the workspace behind `workspaceId` — without a link, see
 * `AuditEntry.workspaceRef`. In practice only affects `workspace.*` events
 * in the platform log; a deleted workspace yields `null`, the row then
 * stays plain text.
 */
async function withWorkspaceRef(entries: AuditEntry[]): Promise<AuditEntry[]> {
  const workspaceIds = [
    ...new Set(
      entries.filter((e) => e.workspaceId).map((e) => e.workspaceId as string),
    ),
  ];
  if (workspaceIds.length === 0) return entries;

  const workspaces = await db.workspace.findMany({
    where: { id: { in: workspaceIds } },
    select: { id: true, slug: true, name: true, color: true, avatarKey: true },
  });
  const refOf = new Map(
    await Promise.all(
      workspaces.map(
        async (w) =>
          [
            w.id,
            {
              slug: w.slug,
              name: w.name,
              color: w.color,
              avatarUrl: await resolveAvatarUrl(w.avatarKey),
            },
          ] as const,
      ),
    ),
  );

  return entries.map((entry) =>
    entry.workspaceId && refOf.has(entry.workspaceId)
      ? { ...entry, workspaceRef: refOf.get(entry.workspaceId) ?? null }
      : entry,
  );
}

/** How many events there are in total — for the overview. */
export async function countAudit(filter: AuditFilter = {}): Promise<number> {
  return db.auditLog.count({ where: whereFor(filter) });
}
