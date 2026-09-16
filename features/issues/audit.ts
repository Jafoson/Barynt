import "server-only";
import { recordAudit } from "@/lib/audit";
import type {
  LabelChangeItem,
  LabelsChangeMeta,
  RelationChangeMeta,
  StatusChangeMeta,
} from "@/lib/audit/actions";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { IssueRelationKind } from "@/types";

// ─── Issue activity log ──────────────────────────────────────────────────────
//
// Shared by `features/issues/actions.ts` (the web app's Server Actions,
// actor from the cookie session) and `features/api-v1/mutations.ts` (the MCP
// server and the public REST API, actor resolved from a personal API key or
// an OAuth token) — both need the exact same entries for the same edits, or
// an issue's activity tab would silently miss whatever happened through the
// other surface. Moved out of `actions.ts` (where it used to be file-private)
// for that reason: one place to log an issue event, not two that could drift.

export type IssueAuditCtx = {
  key: number;
  projectId: string;
  title: string;
  project: { workspaceId: string; prefix: string };
};

/** `MOB-1` — the same identifier used everywhere else in the UI, instead of
 * the (possibly long, or by now changed) title. */
export function issueRef(issue: { key: number; project: { prefix: string } }) {
  return `${issue.project.prefix}-${issue.key}`;
}

/** Just enough of an issue to build a ref and route the entry to the right
 *  workspace/project — for call sites that only have an id, not the fuller
 *  context a permission check would have already loaded. */
export async function issueAuditCtx(id: string): Promise<IssueAuditCtx | null> {
  return db.issue.findUnique({
    where: { id },
    select: {
      key: true,
      projectId: true,
      title: true,
      project: { select: { workspaceId: true, prefix: true } },
    },
  });
}

/**
 * An audit log entry for an issue — the same three pieces of data (target,
 * workspace, project) for each of the broadly distinguished edit occasions
 * below, so bundled here instead of repeated at every call site.
 *
 * `detail` is deliberately optional: for some occasions (assignment removed,
 * description changed) the action itself already says enough, and the key
 * alone identifies the ticket.
 *
 * The "broadly" applies to the occasion (which aspect changed), not to the
 * label itself: where there's a meaningful old and new value (status,
 * priority, type, labels, title), "Old → New" goes directly into
 * `targetLabel` — the same information an audit log is expected to provide
 * by common practice, just without a dedicated column for it. The UI
 * (`AuditLog`/`ActivityFeed`) splits "key: Old → New" back into its parts
 * when displaying it. `meta` additionally carries the same values raw (not
 * visible in the list, but traceable in the database).
 */
export async function recordIssueAudit(
  action:
    | "issue.created"
    | "issue.deleted"
    | "issue.assigned"
    | "issue.unassigned"
    | "issue.title.changed"
    | "issue.description.changed"
    | "issue.status.changed"
    | "issue.priority.changed"
    | "issue.type.changed"
    | "issue.labels.changed"
    | "issue.shared"
    | "issue.share.revoked"
    | "issue.parent.set"
    | "issue.parent.cleared"
    | "issue.child.added"
    | "issue.child.removed"
    | "issue.relation.added"
    | "issue.relation.removed"
    | "issue.attachment.added"
    | "issue.attachment.removed",
  id: string,
  issue: { projectId: string; project: { workspaceId: string } } & Parameters<
    typeof issueRef
  >[0],
  actorId: string,
  detail?: string,
  meta?: object,
  /** Account color of the assignee, for the avatar next to their name in
   * `detail` — the target itself is the issue, not them. */
  personColor?: string | null,
) {
  const ref = issueRef(issue);
  await recordAudit({
    action,
    actorId,
    target: { type: "issue", id, label: detail ? `${ref}: ${detail}` : ref },
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    ...(meta !== undefined ? { meta: meta as Prisma.InputJsonValue } : {}),
    ...(personColor !== undefined ? { personColor } : {}),
  });
}

/** Name and color of a status — the color goes into the log too (frozen,
 * like `actorColor`), so `StatusIcon` can show it without querying the
 * catalog again at read time. */
export async function statusInfo(
  id: string,
): Promise<{ name: string; color: string } | null> {
  return db.status.findUnique({
    where: { id },
    select: { name: true, color: true },
  });
}

export async function priorityName(id: number): Promise<string | null> {
  return (
    (await db.priority.findUnique({ where: { id }, select: { name: true } }))
      ?.name ?? null
  );
}

export async function issueTypeName(id: string): Promise<string | null> {
  return (
    (await db.issueType.findUnique({ where: { id }, select: { name: true } }))
      ?.name ?? null
  );
}

/** Log a status change — shared by `moveIssue`, `reorderIssue` and `updateIssue`
 *  (and their API/MCP counterpart, `updateIssueForUser`). */
export async function recordStatusChangeAudit(
  id: string,
  issue: IssueAuditCtx,
  actorId: string,
  from: string,
  to: string,
) {
  const [fromInfo, toInfo] = await Promise.all([
    statusInfo(from),
    statusInfo(to),
  ]);
  const meta: StatusChangeMeta = {
    from,
    to,
    fromColor: fromInfo?.color ?? null,
    toColor: toInfo?.color ?? null,
  };
  await recordIssueAudit(
    "issue.status.changed",
    id,
    issue,
    actorId,
    `${fromInfo?.name ?? from} → ${toInfo?.name ?? to}`,
    meta,
  );
}

/** Which labels were added and which were removed — not just "something changed". */
export async function recordLabelsChangeAudit(
  id: string,
  issue: IssueAuditCtx,
  actorId: string,
  before: string[],
  after: string[],
) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((labelId) => !beforeSet.has(labelId));
  const removed = before.filter((labelId) => !afterSet.has(labelId));
  if (added.length === 0 && removed.length === 0) return;

  const rows = await db.label.findMany({
    where: { id: { in: [...added, ...removed] } },
    select: { id: true, name: true, color: true },
  });
  const itemFor = (labelId: string): LabelChangeItem =>
    rows.find((r) => r.id === labelId) ?? {
      id: labelId,
      name: labelId,
      color: "#8a9099",
    };
  const parts = [
    added.length > 0
      ? `+ ${added.map((l) => itemFor(l).name).join(", ")}`
      : null,
    removed.length > 0
      ? `− ${removed.map((l) => itemFor(l).name).join(", ")}`
      : null,
  ].filter((p): p is string => p !== null);
  const meta: LabelsChangeMeta = {
    added: added.map(itemFor),
    removed: removed.map(itemFor),
  };

  await recordIssueAudit(
    "issue.labels.changed",
    id,
    issue,
    actorId,
    parts.join(" / "),
    meta,
  );
}

/** The two sides of a relation edge, in the same wording `IssueRelations.tsx`
 *  already uses to render them (`RELATION_GROUPS`) — `[fromId's kind,
 *  relatedId's kind]`. `RELATES_TO` reads the same from either end. */
export function relationKinds(
  type: IssueRelationKind,
): [RelationChangeMeta["kind"], RelationChangeMeta["kind"]] {
  switch (type) {
    case "BLOCKS":
      return ["blocks", "blockedBy"];
    case "DUPLICATES":
      return ["duplicateOf", "duplicatedBy"];
    case "RELATES_TO":
      return ["relatesTo", "relatesTo"];
  }
}
