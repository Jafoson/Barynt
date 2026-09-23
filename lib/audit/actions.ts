// ─── Audit log: the registry ────────────────────────────────────────────────────
//
// Pure data definition — no DB access, no `server-only`, no Prisma imports.
// Same separation as `lib/rbac`, and for the same reason: the UI needs to be
// able to name these events, and a list in the log renders in the browser.
// If this lived next to `db`, a `"use client"` module would pull the Prisma
// client into the bundle — and the build would break with "server-only".
//
// Written and read next door, in `lib/audit/index.ts`.
//
// A log answers three questions, and the selection below follows exactly
// those: **Who was here, and when?** (`auth.*`) **Who gave whom
// permissions?** (`user.role.platform`, `member.role.changed`) **Who
// deleted or broke into something big?** (`project.deleted`,
// `workspace.deleted`, `project.breakglass`).
//
// What isn't listed here is deliberately absent. Logging every page view
// creates a volume no one reviews anymore — and a log no one reviews
// protects no one. What gets recorded is what shifts permissions or
// destroys data.

/**
 * The events that get logged — key and plain-language text.
 *
 * The key lives in the database and never changes. The text here is for
 * people reading the log directly in the database; the label shown in the
 * UI comes from `messages/*.json`. The two names are **not** the same:
 * next-intl reads the dot as nesting, so the messages are named flat, and
 * the bridge lives in `PlatformAudit`.
 */
export const AUDIT_ACTIONS = {
  "auth.login": "Signed in",
  "auth.login.failed": "Sign-in failed",
  "user.role.platform": "Platform role changed",
  "user.deactivated": "Account deactivated",
  "user.reactivated": "Account reactivated",
  "member.role.changed": "Role in workspace changed",
  "project.breakglass": "Emergency access to a project",
  "project.owner.changed": "Project reassigned",
  "project.archived": "Project archived",
  "project.unarchived": "Project unarchived",
  "project.deleted": "Project deleted",
  "workspace.suspended": "Workspace suspended",
  "workspace.unsuspended": "Workspace unsuspended",
  "workspace.deleted": "Workspace deleted",
  "mail.template.updated": "Mail template edited",
  "mail.template.reset": "Mail template reset to default",
  "system.settings.updated": "System settings changed",
  "plugin.store.added": "Plugin store connected",
  "plugin.store.enabled": "Plugin store switched on",
  "plugin.store.disabled": "Plugin store switched off",
  "plugin.store.removed": "Plugin store removed",

  // ── Everyday events in project and workspace ───────────────────────────────
  //
  // Unlike the rest of this list, these aren't security-relevant events —
  // they're the lifecycle of what fills the activity feed on the project
  // and workspace overview (`features/audit`). Create/remove for most
  // objects — for issues, additionally a coarse edit history (which aspect
  // changed, not how: no before/after, that would be a diff, not a log
  // entry).
  "project.created": "Project created",
  "project.visibility.changed": "Visibility changed",
  "member.added": "Member added to workspace",
  "member.removed": "Member removed from workspace",
  "project.member.added": "Member added to project",
  "project.member.removed": "Member removed from project",
  "project.member.role.changed": "Role in project changed",
  "issue.created": "Issue created",
  "issue.deleted": "Issue deleted",
  "issue.assigned": "Issue assigned",
  "issue.unassigned": "Assignment removed",
  "issue.title.changed": "Title changed",
  "issue.description.changed": "Description changed",
  "issue.status.changed": "Status changed",
  "issue.priority.changed": "Priority changed",
  "issue.type.changed": "Type changed",
  "issue.labels.changed": "Labels changed",
  "issue.shared": "Public link created",
  "issue.share.revoked": "Public link revoked",
  "issue.parent.set": "Parent issue set",
  "issue.parent.cleared": "Parent issue cleared",
  "issue.child.added": "Sub-issue added",
  "issue.child.removed": "Sub-issue removed",
  "issue.relation.added": "Relation added",
  "issue.relation.removed": "Relation removed",
  "issue.attachment.added": "Attachment added",
  "issue.attachment.removed": "Attachment removed",
  "issue.comment.added": "Comment added",
  "issue.comment.removed": "Comment removed",
  "issue.dueDate.changed": "Due date changed",
  "issue.storyPoints.changed": "Story points changed",
  "issue.estimateHours.changed": "Time estimate changed",
  "label.created": "Label created",
  "label.deleted": "Label deleted",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_ACTION_KEYS = Object.keys(AUDIT_ACTIONS) as AuditAction[];

/**
 * Narrows a key from the database to the known set.
 *
 * The log is older than any given version of the UI: it can contain events
 * this version no longer knows (or doesn't know yet). The list then shows
 * such rows raw instead of swallowing them — an unknown row in the log is
 * information, not a malfunction.
 */
export function toAuditAction(value: string): AuditAction | null {
  return (AUDIT_ACTION_KEYS as string[]).includes(value)
    ? (value as AuditAction)
    : null;
}

/**
 * What was acted on. Deliberately a small, open list instead of a relation
 * per type: the log outlives its targets (see `prisma/schema.prisma`), so it
 * can't point at them at all.
 */
export type AuditTargetType =
  | "user"
  | "project"
  | "workspace"
  | "role"
  | "mailTemplate"
  | "systemSettings"
  | "pluginStore"
  | "issue"
  | "label";

export interface AuditTarget {
  type: AuditTargetType;
  id: string;
  /** What the target was called at the time of the action. */
  label: string;
}

/**
 * Just the name from `actorLabel` (the format is always "First Last
 * (email)") — the avatar needs the initials, not the address in parentheses
 * after it. A typed-in address with no account (failed login) carries no
 * parentheses anyway and passes through unchanged.
 */
export function actorDisplayName(actorLabel: string): string {
  return actorLabel.replace(/\s*\([^)]*\)\s*$/, "");
}

/** A code like `MOB-1` at the start of `targetLabel` — issue events
 * (`features/issues/actions.ts#issueRef`), followed by `: ` and optionally
 * an "old → new". */
const REF_PATTERN = /^([A-Z0-9]{1,4}-\d+)(?:: ([\s\S]*))?$/;

export interface ParsedTargetLabel {
  /** The code, if `targetLabel` starts with one — otherwise `undefined`. */
  ref?: string;
  /** The old value, when the rest is an "old → new". */
  before?: string;
  /** The new value (for "old → new") or the entire rest without the code. */
  after?: string;
}

/**
 * Splits `targetLabel` into code, before, and after — for a display that
 * doesn't come across as one indistinguishable block of text (`TargetLabel`
 * in `features/audit/components/AuditLog/AuditLog.tsx`). Pure string
 * handling, deliberately separate from the React component: this way it can
 * be tested without rendering anything.
 */
export function parseTargetLabel(text: string): ParsedTargetLabel {
  const match = text.match(REF_PATTERN);
  const ref = match?.[1];
  const rest = match ? match[2] : text;
  if (!rest) return { ref };

  const arrowIdx = rest.indexOf(" → ");
  if (arrowIdx === -1) return { ref, after: rest };
  return {
    ref,
    before: rest.slice(0, arrowIdx),
    after: rest.slice(arrowIdx + 3),
  };
}

/**
 * A row of the log, as the UI receives it.
 *
 * Lives here rather than with the query, because the list receives it as a
 * prop and renders it in the browser — the type therefore needs to be
 * reachable from there without pulling in the server part.
 */
export interface AuditEntry {
  id: string;
  createdAt: Date;
  action: string;
  actorId: string | null;
  actorLabel: string;
  /** Account color at the time of the action, for the avatar — `null` with no
   * account (failed login) or if it has since been deleted. */
  actorColor: string | null;
  /**
   * The actor's uploaded profile picture, looked up live like `projectRef`
   * — unlike `actorColor`, not frozen: a signed URL is only valid for an
   * hour anyway, so an "as of the time of the action" picture couldn't be
   * preserved at all. `null` with no account, no picture, or if the account
   * has since been deleted — the list then shows the initials.
   */
  actorAvatarUrl: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  /** Account color of the person named in `targetLabel`, when the target
   * itself isn't a person (e.g. the assignee of an issue) — otherwise `null`. */
  personColor: string | null;
  workspaceId: string | null;
  projectId: string | null;
  reason: string | null;
  /**
   * Raw data depending on the event — unused for most rows. For status,
   * priority, and label changes on an issue it carries rendering hints
   * (icon, color) that `TargetLabel` reads out — see `PriorityChangeMeta`,
   * `StatusChangeMeta`, `LabelsChangeMeta`. Unvalidated: it's only ever
   * written by `features/issues/actions.ts`, in exactly this shape.
   */
  meta: unknown;
  /**
   * Slug, name, color, and profile picture of the project behind
   * `projectId`, looked up live like `actorColor` in `withCurrentColor`
   * (`lib/audit/index.ts`) — not frozen, because it only needs to serve a
   * link and an avatar, not stand as a historical record. `null` with no
   * `projectId` or if the project has since been deleted; the row then
   * stays unlinked text.
   */
  projectRef: {
    slug: string;
    name: string;
    color: string;
    avatarUrl: string | null;
  } | null;
  /**
   * The same for the workspace behind `workspaceId` — without a link (a
   * platform admin isn't a member of other workspaces, see
   * `PlatformWorkspaces`), only for the avatar next to `workspace.*`
   * events. `null` with no `workspaceId` or if the workspace has since been
   * deleted.
   */
  workspaceRef: {
    slug: string;
    name: string;
    color: string;
    avatarUrl: string | null;
  } | null;
}

/** `meta` for `issue.priority.changed` — the priority id is enough, the
 * icon comes from `PriorityIcon` (fixed mapping, no color needed). */
export interface PriorityChangeMeta {
  from: number;
  to: number;
}

/** `meta` for `issue.status.changed` — color frozen like `actorColor`,
 * because `Status.color` can change. */
export interface StatusChangeMeta {
  from: string;
  to: string;
  fromColor: string | null;
  toColor: string | null;
}

export interface LabelChangeItem {
  id: string;
  name: string;
  color: string;
}

/** `meta` for `issue.labels.changed`. */
export interface LabelsChangeMeta {
  added: LabelChangeItem[];
  removed: LabelChangeItem[];
}

/**
 * `meta` for `issue.relation.added`/`issue.relation.removed` — the verb
 * ("blocks"/"is blocked by"/…) depends on which side of the edge this
 * issue sits on and needs a translation, so it's carried as a kind rather
 * than baked into `targetLabel` as English/German text (same reason
 * `StatusChangeMeta` carries a status id and not its name).
 */
export interface RelationChangeMeta {
  /** Matches the `relations.*` message keys 1:1 (`IssueRelations.tsx`'s own
   *  `RELATION_GROUPS`) — same wording in the relations list and the
   *  activity log, not two phrasings for the same fact. */
  kind: "blocks" | "blockedBy" | "duplicateOf" | "duplicatedBy" | "relatesTo";
  /** Reference of the *other* issue, e.g. "MOB-7". */
  ref: string;
}
