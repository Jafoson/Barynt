import "server-only";
import {
  type ApiAttachment,
  type ApiComment,
  type ApiContentSource,
  type ApiIssue,
  type ApiIssueRelationKind,
  type ApiLabelDetail,
  type ApiProject,
  type ApiWorkspace,
  attachmentSelect,
  getCommentUnchecked,
  getIssueUnchecked,
  mapApiAttachment,
  resolveIssueId,
} from "@/features/api-v1/queries";
import { richTextFromApiMarkdown } from "@/features/api-v1/richtext";
import {
  issueAuditCtx,
  issueRef,
  issueTypeName,
  priorityName,
  recordIssueAudit,
  recordLabelsChangeAudit,
  recordStatusChangeAudit,
  relationKinds,
} from "@/features/issues/audit";
import {
  ESTIMATE_UNIT_ABBR,
  ESTIMATE_UNITS,
  hoursToEstimate,
} from "@/features/issues/estimate";
import { DEFAULT_HIDDEN_DETAIL_FIELDS } from "@/features/projects/detail-fields";
import type { ProjectVisibility } from "@/features/projects/types";
import { recordAudit } from "@/lib/audit";
import type { RelationChangeMeta } from "@/lib/audit/actions";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recordStatusEvent } from "@/lib/issue-status-events";
import { notify } from "@/lib/notify";
import { can } from "@/lib/permissions";
import { enrollMember, enrollWorkspaceMembers } from "@/lib/project-membership";
import { OWNER_ROLE_KEY, systemRoleId } from "@/lib/rbac";
import {
  emptyDoc,
  mentionedUserIds,
  stripAttachmentAttrs,
  toPlainText,
  toPreview,
} from "@/lib/richtext";
import { hostOf } from "@/lib/richtext/link";
import { slugify } from "@/lib/slug";
import { isClosedStatus } from "@/lib/statuses";
import {
  deleteAttachmentObject,
  finalizeAttachmentUpload,
  PUT_EXPIRES_IN,
  requestAttachmentUpload,
  storeAttachmentBytes,
} from "@/lib/storage";
import { guessContentType } from "@/lib/storage/validation";
import { canCreateWorkspace, getSystemSettings } from "@/lib/system-settings";
import { uid } from "@/lib/utils/id";
import { fireWebhookEvent } from "@/lib/webhooks/deliver";
import {
  DEFAULT_ISSUE_TYPES,
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
} from "@/lib/workspace-defaults";
import type { EstimateUnit } from "@/types";

// Thin, `userId`-parameterized write helpers for the public API
// (`app/api/v1`) — deliberately NOT calls into `features/issues/actions.ts`.
// Those resolve the actor via `requirePermission()` → `currentUserId()` →
// the cookie session, with no parameter to inject a token-resolved identity
// through. This duplicates their minimal write logic instead, reusing the
// same shared helpers (`toPlainText`, `stripAttachmentAttrs`, `uid`,
// `isClosedStatus`) so the two paths can't drift on *how* a write happens,
// only on the plumbing around it. Known duplication, accepted for this MVP
// slice — revisit once real API usage patterns are clear. Mention
// *notifications* and audit logging are the two exceptions:
// `notifyMentions()` below mirrors actions.ts's own helper of the same name
// closely enough (down to the diffing on update) that leaving it out would
// make an API-authored `@handle` a chip that quietly never tells the person
// it named, and the audit calls (`recordIssueAudit` & co., now shared via
// `features/issues/audit.ts` instead of file-private to actions.ts) mirror
// `updateIssue()`'s diff block field for field — otherwise an issue's
// activity tab would silently miss whatever the MCP server or the API did
// to it. Comments stay unaudited on both surfaces alike: there's no
// `comment.*` action in `AUDIT_ACTIONS` at all yet.

/** Who was newly mentioned in a document, minus whoever wrote it — mirrors
 *  `notifyMentions()` in `features/issues/actions.ts` (private there, so
 *  duplicated here rather than imported; see the file comment above). */
async function notifyMentions(
  ids: string[],
  ctx: {
    workspaceId: string;
    projectId: string;
    issueId: string;
    text: string;
  },
  actorId: string,
): Promise<void> {
  const recipients = ids.filter((userId) => userId !== actorId);
  if (recipients.length === 0) return;
  await notify(
    recipients.map((userId) => ({
      userId,
      type: "mentioned" as const,
      actorId,
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      issueId: ctx.issueId,
      text: ctx.text,
    })),
  );
}

export type MutationResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: 403 | 404 | 422;
      /** A specific reason, where a bare `invalid_body` wouldn't tell the
       *  caller what to fix (attachments: too large, storage off, …). */
      error?: { code: string; message: string };
    };

function fail(status: 403 | 404 | 422): { ok: false; status: 403 | 404 | 422 } {
  return { ok: false, status };
}

/** Same rule as `closedPatch()` in `features/issues/actions.ts`: setting a
 *  closed status stamps `closedAt` only if it isn't already stamped (Done →
 *  Canceled keeps the original date); leaving a closed status clears it. */
async function closedPatch(
  before: { status: string; closedAt: Date | null },
  next: string | undefined,
): Promise<{ closedAt?: Date | null }> {
  if (next === undefined || next === before.status) return {};
  if (await isClosedStatus(next))
    return before.closedAt ? {} : { closedAt: new Date() };
  return before.closedAt ? { closedAt: null } : {};
}

/** Parses a `dueDate` input string (ISO 8601) into a `Date`. `null`/`undefined`
 *  both mean "no due date" — `createIssueForUser` doesn't need to tell them
 *  apart (a brand-new issue has no "before" state either way);
 *  `updateIssueForUser` only calls this once it has already checked
 *  `patch.dueDate !== undefined`, so there `undefined` never reaches here.
 *  The literal `"invalid"` return lets the caller turn an unparseable
 *  string into a 422 rather than silently storing `Invalid Date`. */
function parseDueDateInput(
  value: string | null | undefined,
): Date | null | "invalid" {
  if (value === undefined || value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

/** Same shape as `parseDueDateInput` — `undefined` means "not sent",
 *  validated against `ESTIMATE_UNITS` (BARY-4) so a typo doesn't silently
 *  store a unit the UI could never look up a label for. */
function parseEstimateUnitInput(
  value: string | null | undefined,
): EstimateUnit | null | "invalid" {
  if (value === undefined || value === null) return null;
  return (ESTIMATE_UNITS as string[]).includes(value)
    ? (value as EstimateUnit)
    : "invalid";
}

/** Mirrors the private `chainContains` in `features/issues/actions.ts`:
 *  walks the parent chain upward from `startId`, `true` as soon as `target`
 *  appears in it — guards `updateIssueForUser`'s `parentId` patch against
 *  creating a cycle. Bounded at 50 hops for the same reason as there. */
async function chainContains(
  startId: string,
  target: string,
): Promise<boolean> {
  let cursor: string | null = startId;
  for (let hop = 0; cursor && hop < 50; hop++) {
    if (cursor === target) return true;
    cursor =
      (
        await db.issue.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        })
      )?.parentId ?? null;
  }
  return false;
}

/**
 * Validates a `parentId` patch: the parent must exist, be visible to the
 * caller, not be the issue itself, and not turn the issue into its own
 * (possibly indirect) ancestor. Mirrors `setIssueParent`'s checks
 * (`features/issues/actions.ts`) — `null` means valid, otherwise the
 * `MutationResult` status to fail with.
 */
async function validateParentId(
  userId: string,
  issueId: string | null,
  parentId: string,
): Promise<422 | 404 | null> {
  if (parentId === issueId) return 422;
  const parent = await db.issue.findUnique({
    where: { id: parentId },
    select: { projectId: true },
  });
  if (!parent) return 404;
  if (!(await can(userId, "project.view", { projectId: parent.projectId })))
    return 404;
  // A brand-new issue (`issueId === null`, `createIssueForUser`) can't
  // already be anywhere in `parentId`'s chain — nothing points at it yet.
  if (issueId && (await chainContains(parentId, issueId))) return 422;
  return null;
}

export interface CreateIssueInput {
  title: string;
  /** Markdown — converted server-side. The internal ProseMirror JSON isn't
   *  a public API contract. */
  description?: string;
  status?: string;
  priority?: number;
  assignee?: string | null;
  labels?: string[];
  type?: string;
  /** Makes the new issue a sub-issue of this one right away — the same
   *  "sub-issue of" relationship as `updateIssueForUser`'s `parentId`
   *  patch, just set at creation instead of after the fact. */
  parentId?: string | null;
  /** ISO 8601 date/datetime string, e.g. `"2026-09-20"`. */
  dueDate?: string | null;
  /** Typically a Fibonacci value (1/2/3/5/8/13), not enforced. */
  storyPoints?: number | null;
  /** Normalized to hours, e.g. `2.5`. */
  estimateHours?: number | null;
  /** Which unit `estimateHours` was entered in — `"hours"` (default),
   *  `"days"`, `"weeks"`, `"months"`, or `"years"`; purely a display hint,
   *  doesn't change what `estimateHours` means. */
  estimateUnit?: EstimateUnit | null;
}

export async function createIssueForUser(
  userId: string,
  projectId: string,
  rawInput: CreateIssueInput,
  /** Which of the two public-API surfaces made this call — never `APP`,
   *  the web app's own `createIssue()` (`features/issues/actions.ts`)
   *  doesn't go through here and leaves `Issue.source` at its `APP`
   *  default instead. */
  source: Exclude<ApiContentSource, "APP">,
): Promise<MutationResult<ApiIssue>> {
  const input = {
    ...rawInput,
    ...(rawInput.parentId && {
      parentId: await resolveIssueId(userId, rawInput.parentId),
    }),
  };
  if (!(await can(userId, "issue.create", { projectId }))) return fail(404);

  const title = input.title?.trim();
  if (!title) return fail(422);

  // Checked before `project.update` below claims a key — a rejected
  // `parentId` shouldn't burn one of the project's issue numbers.
  if (input.parentId) {
    const invalid = await validateParentId(userId, null, input.parentId);
    if (invalid) return fail(invalid);
  }

  const dueDate = parseDueDateInput(input.dueDate);
  if (dueDate === "invalid") return fail(422);

  const estimateUnit = parseEstimateUnitInput(input.estimateUnit);
  if (estimateUnit === "invalid") return fail(422);

  const status = input.status ?? "backlog";

  const { lastIssueKey, workspaceId, prefix } = await db.project.update({
    where: { id: projectId },
    data: { lastIssueKey: { increment: 1 } },
    select: { lastIssueKey: true, workspaceId: true, prefix: true },
  });

  // Markdown → doc, with `@handle`/`#PREFIX-123`/`//date`/`[label|url]`
  // resolved into real chips scoped to the project's workspace — see
  // `features/api-v1/richtext.ts`. Needs `workspaceId`, so this can't run
  // until after the `project.update` above resolves it.
  const doc = input.description
    ? stripAttachmentAttrs(
        await richTextFromApiMarkdown(input.description, workspaceId),
      )
    : emptyDoc();

  const id = uid("i");
  await db.issue.create({
    data: {
      id,
      key: lastIssueKey,
      projectId,
      title,
      description: doc as unknown as Prisma.InputJsonValue,
      descriptionText: toPlainText(doc),
      status,
      ...((await isClosedStatus(status)) ? { closedAt: new Date() } : {}),
      priority: input.priority ?? 0,
      assigneeId: input.assignee ?? null,
      labels: input.labels ?? [],
      type: input.type ?? "feature",
      reporterId: userId,
      source,
      parentId: input.parentId ?? null,
      dueDate,
      storyPoints: input.storyPoints ?? null,
      estimateHours: input.estimateHours ?? null,
      estimateUnit:
        input.estimateHours != null ? (estimateUnit ?? "hours") : null,
    },
  });
  await recordStatusEvent(id, null, status);

  // Re-fetched via the shared, permission-free resolver rather than mapped
  // by hand here — that's the one place that resolves `assignee`/`reporter`
  // to `{id, name}` and label ids to `{id, name, color}` (`resolveLabels`,
  // `features/api-v1/queries.ts`), so this can't drift from what a GET
  // returns for the same issue.
  const data = await getIssueUnchecked(id);
  if (!data) return fail(404);
  fireWebhookEvent(workspaceId, "issue.created", data);
  await notifyMentions(
    mentionedUserIds(doc),
    { workspaceId, projectId, issueId: id, text: toPreview(doc) },
    userId,
  );

  const auditCtx = {
    key: lastIssueKey,
    projectId,
    project: { workspaceId, prefix },
  };
  await recordIssueAudit("issue.created", id, auditCtx, userId, title);

  // A sub-issue set at creation is a relationship worth logging on both
  // ends, same as `setIssueParent` does after the fact — the web app has no
  // equivalent at creation time, but the relationship itself is identical.
  if (input.parentId) {
    const newParent = await issueAuditCtx(input.parentId);
    if (newParent) {
      await recordIssueAudit(
        "issue.parent.set",
        id,
        auditCtx,
        userId,
        issueRef(newParent),
      );
      await recordIssueAudit(
        "issue.child.added",
        input.parentId,
        newParent,
        userId,
        issueRef(auditCtx),
      );
    }
  }

  return { ok: true, data };
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  assignee?: string | null;
  labels?: string[];
  type?: string;
  /** Sets or clears (`null`) the issue's parent — the same "sub-issue of"
   *  relationship shown on both ends in the app (`IssueRelations`'s
   *  "Parent"/"Sub-issues"). */
  parentId?: string | null;
  /** ISO 8601 date/datetime string; `null` clears it. */
  dueDate?: string | null;
  storyPoints?: number | null;
  /** Normalized to hours; `null` clears it (and `estimateUnit` with it). */
  estimateHours?: number | null;
  /** Relabels `estimateHours`'s display unit — independent of whether
   *  `estimateHours` itself changes in the same request. Omitted alongside
   *  a new `estimateHours` defaults to `"hours"`, same as on create. */
  estimateUnit?: EstimateUnit | null;
}

export async function updateIssueForUser(
  userId: string,
  idOrRef: string,
  input: UpdateIssueInput,
): Promise<MutationResult<{ id: string }>> {
  const issueId = await resolveIssueId(userId, idOrRef);
  const patch = {
    ...input,
    ...(input.parentId && {
      parentId: await resolveIssueId(userId, input.parentId),
    }),
  };
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: {
      key: true,
      title: true,
      projectId: true,
      reporterId: true,
      assigneeId: true,
      status: true,
      priority: true,
      type: true,
      labels: true,
      parentId: true,
      closedAt: true,
      dueDate: true,
      storyPoints: true,
      estimateHours: true,
      estimateUnit: true,
      // Only read for the mention diff below (`mentionedUserIds`) — the
      // rest of this function never looks at the current description.
      description: true,
      project: { select: { workspaceId: true, prefix: true } },
    },
  });
  if (!issue) return fail(404);

  const ctx = { projectId: issue.projectId };
  const isOwner = issue.reporterId === userId || issue.assigneeId === userId;
  const allowed =
    (await can(userId, "issue.update.any", ctx)) ||
    (isOwner && (await can(userId, "issue.update.own", ctx)));
  if (!allowed) return fail(404);

  if (
    patch.assignee !== undefined &&
    !(await can(userId, "issue.assign", ctx))
  ) {
    return fail(404);
  }

  if (patch.parentId) {
    const invalid = await validateParentId(userId, issueId, patch.parentId);
    if (invalid) return fail(invalid);
  }

  const dueDate =
    patch.dueDate !== undefined ? parseDueDateInput(patch.dueDate) : undefined;
  if (dueDate === "invalid") return fail(422);

  const estimateUnit =
    patch.estimateUnit !== undefined
      ? parseEstimateUnitInput(patch.estimateUnit)
      : undefined;
  if (estimateUnit === "invalid") return fail(422);

  const doc =
    patch.description !== undefined
      ? stripAttachmentAttrs(
          await richTextFromApiMarkdown(
            patch.description,
            issue.project.workspaceId,
          ),
        )
      : null;

  await db.issue.update({
    where: { id: issueId },
    data: {
      ...(patch.status !== undefined && { status: patch.status }),
      ...(await closedPatch(issue, patch.status)),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.type !== undefined && { type: patch.type }),
      ...(patch.assignee !== undefined && { assigneeId: patch.assignee }),
      ...(patch.labels !== undefined && { labels: patch.labels }),
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.parentId !== undefined && { parentId: patch.parentId }),
      ...(dueDate !== undefined && { dueDate }),
      ...(patch.storyPoints !== undefined && {
        storyPoints: patch.storyPoints,
      }),
      ...(patch.estimateHours !== undefined && {
        estimateHours: patch.estimateHours,
        // Defaults to "hours" unless an explicit unit follows below —
        // same rule as `createIssueForUser`.
        estimateUnit: patch.estimateHours === null ? null : "hours",
      }),
      ...(estimateUnit !== undefined && { estimateUnit }),
      ...(doc !== null && {
        description: doc as unknown as Prisma.InputJsonValue,
        descriptionText: toPlainText(doc),
      }),
    },
  });

  // Re-fetched (not built from `patch`) so the webhook payload carries the
  // full, current issue — not just the fields this particular request
  // touched. `getIssueUnchecked` (no permission check) rather than
  // `getIssueForUser`: the actor already passed a stricter check above, a
  // second `can()` call would be redundant.
  const updated = await getIssueUnchecked(issueId);
  if (updated)
    fireWebhookEvent(issue.project.workspaceId, "issue.updated", updated);

  if (doc !== null) {
    const before = new Set(mentionedUserIds(issue.description));
    const newlyMentioned = mentionedUserIds(doc).filter(
      (id) => !before.has(id),
    );
    await notifyMentions(
      newlyMentioned,
      {
        workspaceId: issue.project.workspaceId,
        projectId: issue.projectId,
        issueId,
        text: toPreview(doc),
      },
      userId,
    );
  }

  // ── Broadly log what changed ──
  // Mirrors the diff block in `updateIssue()` (`features/issues/actions.ts`)
  // field for field, so an edit looks the same in the activity tab whether
  // it came from the app, the MCP server, or the public API.
  const auditCtx = {
    key: issue.key,
    projectId: issue.projectId,
    title: issue.title,
    project: issue.project,
  };

  if (patch.assignee !== undefined && patch.assignee !== issue.assigneeId) {
    if (patch.assignee) {
      const [assignee, previous] = await Promise.all([
        db.user.findUnique({
          where: { id: patch.assignee },
          select: { firstName: true, lastName: true, color: true },
        }),
        issue.assigneeId
          ? db.user.findUnique({
              where: { id: issue.assigneeId },
              select: { firstName: true, lastName: true },
            })
          : null,
      ]);
      const assigneeName = assignee
        ? `${assignee.firstName} ${assignee.lastName}`.trim()
        : patch.assignee;
      const previousName = previous
        ? `${previous.firstName} ${previous.lastName}`.trim()
        : null;
      await recordIssueAudit(
        "issue.assigned",
        issueId,
        auditCtx,
        userId,
        previousName ? `${previousName} → ${assigneeName}` : assigneeName,
        undefined,
        assignee?.color ?? null,
      );
    } else {
      await recordIssueAudit("issue.unassigned", issueId, auditCtx, userId);
    }
  }

  if (patch.title !== undefined && patch.title !== issue.title) {
    await recordIssueAudit(
      "issue.title.changed",
      issueId,
      auditCtx,
      userId,
      `${issue.title} → ${patch.title}`,
    );
  }

  if (
    doc !== null &&
    JSON.stringify(doc) !== JSON.stringify(issue.description)
  ) {
    await recordIssueAudit(
      "issue.description.changed",
      issueId,
      auditCtx,
      userId,
    );
  }

  if (patch.status !== undefined && patch.status !== issue.status) {
    await recordStatusChangeAudit(
      issueId,
      auditCtx,
      userId,
      issue.status,
      patch.status,
    );
  }

  if (patch.priority !== undefined && patch.priority !== issue.priority) {
    const [fromName, toName] = await Promise.all([
      priorityName(issue.priority),
      priorityName(patch.priority),
    ]);
    await recordIssueAudit(
      "issue.priority.changed",
      issueId,
      auditCtx,
      userId,
      `${fromName ?? issue.priority} → ${toName ?? patch.priority}`,
      { from: issue.priority, to: patch.priority },
    );
  }

  if (patch.type !== undefined && patch.type !== issue.type) {
    const [fromName, toName] = await Promise.all([
      issueTypeName(issue.type),
      issueTypeName(patch.type),
    ]);
    await recordIssueAudit(
      "issue.type.changed",
      issueId,
      auditCtx,
      userId,
      `${fromName ?? issue.type} → ${toName ?? patch.type}`,
      { from: issue.type, to: patch.type },
    );
  }

  if (patch.labels !== undefined) {
    await recordLabelsChangeAudit(
      issueId,
      auditCtx,
      userId,
      issue.labels,
      patch.labels,
    );
  }

  if (
    dueDate !== undefined &&
    (dueDate?.getTime() ?? null) !== (issue.dueDate?.getTime() ?? null)
  ) {
    const fmt = (d: Date | null) =>
      d === null ? "—" : d.toISOString().slice(0, 10);
    await recordIssueAudit(
      "issue.dueDate.changed",
      issueId,
      auditCtx,
      userId,
      `${fmt(issue.dueDate)} → ${fmt(dueDate)}`,
      {
        from: issue.dueDate?.getTime() ?? null,
        to: dueDate?.getTime() ?? null,
      },
    );
  }

  if (
    patch.storyPoints !== undefined &&
    patch.storyPoints !== issue.storyPoints
  ) {
    await recordIssueAudit(
      "issue.storyPoints.changed",
      issueId,
      auditCtx,
      userId,
      `${issue.storyPoints ?? "—"} → ${patch.storyPoints ?? "—"}`,
      { from: issue.storyPoints, to: patch.storyPoints },
    );
  }

  if (
    patch.estimateHours !== undefined &&
    patch.estimateHours !== issue.estimateHours
  ) {
    // Each side in the unit it actually had/gets, same as `updateIssue()`
    // (`features/issues/actions.ts`).
    const fromUnit = (issue.estimateUnit as EstimateUnit | null) ?? "hours";
    const toUnit =
      (estimateUnit !== undefined
        ? estimateUnit
        : (issue.estimateUnit as EstimateUnit | null)) ?? "hours";
    const fmt = (hours: number | null, unit: EstimateUnit) =>
      hours === null
        ? "—"
        : `${hoursToEstimate(hours, unit)}${ESTIMATE_UNIT_ABBR[unit]}`;
    await recordIssueAudit(
      "issue.estimateHours.changed",
      issueId,
      auditCtx,
      userId,
      `${fmt(issue.estimateHours, fromUnit)} → ${fmt(patch.estimateHours, toUnit)}`,
      { from: issue.estimateHours, to: patch.estimateHours },
    );
  }

  if (patch.parentId !== undefined && patch.parentId !== issue.parentId) {
    const [newParent, oldParent] = await Promise.all([
      patch.parentId ? issueAuditCtx(patch.parentId) : Promise.resolve(null),
      issue.parentId ? issueAuditCtx(issue.parentId) : Promise.resolve(null),
    ]);
    if (newParent) {
      await recordIssueAudit(
        "issue.parent.set",
        issueId,
        auditCtx,
        userId,
        oldParent
          ? `${issueRef(oldParent)} → ${issueRef(newParent)}`
          : issueRef(newParent),
      );
      await recordIssueAudit(
        "issue.child.added",
        patch.parentId as string,
        newParent,
        userId,
        issueRef(auditCtx),
      );
    } else if (patch.parentId === null) {
      await recordIssueAudit("issue.parent.cleared", issueId, auditCtx, userId);
    }
    if (oldParent) {
      await recordIssueAudit(
        "issue.child.removed",
        issue.parentId as string,
        oldParent,
        userId,
        issueRef(auditCtx),
      );
    }
  }

  return { ok: true, data: { id: issueId } };
}

// ─── Issue relations ───────────────────────────────────────────────────────
//
// Blocks/relates-to/duplicates edges — a separate resource from the issue
// itself (like comments), not a patchable field on it, hence their own
// add/remove functions instead of another `UpdateIssueInput` key. Mirrors
// `addIssueRelation`/`removeIssueRelation` (`features/issues/actions.ts`),
// `userId`-parameterized the same way every other function in this file is.

export interface AddIssueRelationInput {
  relatedId: string;
  type: ApiIssueRelationKind;
}

/**
 * Links two issues with a typed edge. `RELATES_TO` has no real direction —
 * the pair is stored under whichever id sorts first, so "A relates to B"
 * and "B relates to A" can't end up as two separate rows for the same
 * statement; `BLOCKS`/`DUPLICATES` keep `issueId`/`relatedId` as given,
 * since which side is the source is part of what they mean. Permission is
 * checked against `issueId` (the issue the edge is added from) — the
 * related issue only needs to be one the caller can *see*.
 */
export async function addIssueRelationForUser(
  userId: string,
  idOrRef: string,
  input: AddIssueRelationInput,
): Promise<MutationResult<{ id: string }>> {
  const issueId = await resolveIssueId(userId, idOrRef);
  const relatedId = input.relatedId
    ? await resolveIssueId(userId, input.relatedId)
    : input.relatedId;
  if (!relatedId || relatedId === issueId) return fail(422);

  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: { projectId: true, reporterId: true, assigneeId: true },
  });
  if (!issue) return fail(404);

  const ctx = { projectId: issue.projectId };
  const isOwner = issue.reporterId === userId || issue.assigneeId === userId;
  const allowed =
    (await can(userId, "issue.update.any", ctx)) ||
    (isOwner && (await can(userId, "issue.update.own", ctx)));
  if (!allowed) return fail(404);

  const related = await db.issue.findUnique({
    where: { id: relatedId },
    select: { projectId: true },
  });
  if (
    !related ||
    !(await can(userId, "project.view", { projectId: related.projectId }))
  ) {
    return fail(404);
  }

  const [fromId, toId] =
    input.type === "RELATES_TO" && relatedId < issueId
      ? [relatedId, issueId]
      : [issueId, relatedId];

  const existing = await db.issueRelation.findUnique({
    where: {
      issueId_relatedId_type: {
        issueId: fromId,
        relatedId: toId,
        type: input.type,
      },
    },
  });
  const row =
    existing ??
    (await db.issueRelation.create({
      data: {
        id: uid("ir"),
        type: input.type,
        issueId: fromId,
        relatedId: toId,
      },
    }));

  // Only for an edge that's actually new — same as `addIssueRelation()`
  // (`features/issues/actions.ts`), which this mirrors. Logged on both
  // issues it connects, each phrased from its own side.
  if (!existing) {
    const [ownCtx, relatedCtx] = await Promise.all([
      issueAuditCtx(issueId),
      issueAuditCtx(relatedId),
    ]);
    if (ownCtx && relatedCtx) {
      const [ownKind, relatedKind] = relationKinds(input.type);
      const ownRef = issueRef(ownCtx);
      const relatedRef = issueRef(relatedCtx);
      await recordIssueAudit(
        "issue.relation.added",
        issueId,
        ownCtx,
        userId,
        relatedRef,
        { kind: ownKind, ref: relatedRef } satisfies RelationChangeMeta,
      );
      await recordIssueAudit(
        "issue.relation.added",
        relatedId,
        relatedCtx,
        userId,
        ownRef,
        { kind: relatedKind, ref: ownRef } satisfies RelationChangeMeta,
      );
    }
  }

  return { ok: true, data: { id: row.id } };
}

/** Whether the caller can edit this side of a relation — own/any, same as
 *  `updateIssueForUser`'s check, just factored out since
 *  `removeIssueRelationForUser` runs it against both connected issues. */
async function canEditIssue(
  userId: string,
  issue: { projectId: string; reporterId: string; assigneeId: string | null },
): Promise<boolean> {
  const ctx = { projectId: issue.projectId };
  const isOwner = issue.reporterId === userId || issue.assigneeId === userId;
  return (
    (await can(userId, "issue.update.any", ctx)) ||
    (isOwner && (await can(userId, "issue.update.own", ctx)))
  );
}

/**
 * Removes a relation edge — shown on both issues it connects
 * (`IssueRelations`), so removable from either side, not only the one that
 * originally created it: whoever can edit *either* end may take it down.
 */
export async function removeIssueRelationForUser(
  userId: string,
  relationId: string,
): Promise<MutationResult<{ id: string }>> {
  const relation = await db.issueRelation.findUnique({
    where: { id: relationId },
    include: {
      issue: {
        select: { projectId: true, reporterId: true, assigneeId: true },
      },
      related: {
        select: { projectId: true, reporterId: true, assigneeId: true },
      },
    },
  });
  if (!relation) return fail(404);

  const allowed =
    (await canEditIssue(userId, relation.issue)) ||
    (await canEditIssue(userId, relation.related));
  if (!allowed) return fail(404);

  await db.issueRelation.delete({ where: { id: relationId } });

  // Same "shown on both ends" treatment as `removeIssueRelation()`
  // (`features/issues/actions.ts`), which this mirrors.
  const [fromCtx, toCtx] = await Promise.all([
    issueAuditCtx(relation.issueId),
    issueAuditCtx(relation.relatedId),
  ]);
  if (fromCtx && toCtx) {
    const [fromKind, toKind] = relationKinds(relation.type);
    const fromRef = issueRef(fromCtx);
    const toRef = issueRef(toCtx);
    await recordIssueAudit(
      "issue.relation.removed",
      relation.issueId,
      fromCtx,
      userId,
      toRef,
      { kind: fromKind, ref: toRef } satisfies RelationChangeMeta,
    );
    await recordIssueAudit(
      "issue.relation.removed",
      relation.relatedId,
      toCtx,
      userId,
      fromRef,
      { kind: toKind, ref: fromRef } satisfies RelationChangeMeta,
    );
  }

  return { ok: true, data: { id: relationId } };
}

export interface CreateCommentInput {
  body: string;
  parentId?: string;
}

export async function createCommentForUser(
  userId: string,
  idOrRef: string,
  input: CreateCommentInput,
  /** See `createIssueForUser`'s parameter of the same name. */
  source: Exclude<ApiContentSource, "APP">,
): Promise<MutationResult<ApiComment>> {
  const issueId = await resolveIssueId(userId, idOrRef);
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: {
      key: true,
      title: true,
      projectId: true,
      project: { select: { workspaceId: true, prefix: true } },
    },
  });
  if (!issue) return fail(404);
  if (!(await can(userId, "comment.create", { projectId: issue.projectId })))
    return fail(404);

  const body = input.body?.trim();
  if (!body) return fail(422);

  if (input.parentId) {
    // Same tamper guard as `addComment()`: a reply must belong to the same
    // issue as the id in the path.
    const parent = await db.comment.findUnique({
      where: { id: input.parentId },
      select: { issueId: true },
    });
    if (!parent || parent.issueId !== issueId) return fail(422);
  }

  const doc = await richTextFromApiMarkdown(body, issue.project.workspaceId);
  const row = await db.comment.create({
    data: {
      id: uid("c"),
      issueId,
      authorId: userId,
      parentId: input.parentId ?? null,
      body: doc as unknown as Prisma.InputJsonValue,
      bodyText: toPlainText(doc),
      source,
    },
  });

  const data = await getCommentUnchecked(row.id);
  if (!data) return fail(404);
  fireWebhookEvent(issue.project.workspaceId, "comment.created", data);
  await notifyMentions(
    mentionedUserIds(doc),
    {
      workspaceId: issue.project.workspaceId,
      projectId: issue.projectId,
      issueId,
      text: toPreview(doc),
    },
    userId,
  );
  await recordIssueAudit(
    "issue.comment.added",
    issueId,
    issue,
    userId,
    toPreview(doc),
  );

  return { ok: true, data };
}

export interface UpdateCommentInput {
  body: string;
}

/** Mirrors `updateComment()`'s own/any check: the author can always edit
 *  their own comment, `comment.update.any` covers editing someone else's. */
export async function updateCommentForUser(
  userId: string,
  commentId: string,
  input: UpdateCommentInput,
): Promise<MutationResult<{ id: string }>> {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: {
      authorId: true,
      issue: {
        select: { projectId: true, project: { select: { workspaceId: true } } },
      },
    },
  });
  if (!comment) return fail(404);

  const ctx = { projectId: comment.issue.projectId };
  const isOwner = comment.authorId === userId;
  const allowed =
    (await can(userId, "comment.update.any", ctx)) ||
    (isOwner && (await can(userId, "comment.update.own", ctx)));
  if (!allowed) return fail(404);

  const body = input.body?.trim();
  if (!body) return fail(422);

  // No mention notification here, deliberately — `updateComment()`
  // (`features/issues/actions.ts`) doesn't send one on edit either
  // (only `addComment` does), so an edited comment stays consistent
  // between the two surfaces. The chips still resolve, just quietly.
  const doc = await richTextFromApiMarkdown(
    body,
    comment.issue.project.workspaceId,
  );
  await db.comment.update({
    where: { id: commentId },
    data: {
      body: doc as unknown as Prisma.InputJsonValue,
      bodyText: toPlainText(doc),
      updated: new Date(),
    },
  });

  return { ok: true, data: { id: commentId } };
}

/** Mirrors `deleteComment()`'s own/any check. Replies cascade in the
 *  database (`Comment.parentId`'s `onDelete: Cascade`) — nothing extra to
 *  clean up here. */
export async function deleteCommentForUser(
  userId: string,
  commentId: string,
): Promise<MutationResult<{ id: string }>> {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: {
      authorId: true,
      issueId: true,
      body: true,
      issue: {
        select: {
          key: true,
          title: true,
          projectId: true,
          project: { select: { workspaceId: true, prefix: true } },
        },
      },
    },
  });
  if (!comment) return fail(404);

  const ctx = { projectId: comment.issue.projectId };
  const isOwner = comment.authorId === userId;
  const allowed =
    (await can(userId, "comment.delete.any", ctx)) ||
    (isOwner && (await can(userId, "comment.delete.own", ctx)));
  if (!allowed) return fail(404);

  await db.comment.delete({ where: { id: commentId } });
  await recordIssueAudit(
    "issue.comment.removed",
    comment.issueId,
    comment.issue,
    userId,
    toPreview(comment.body),
  );

  return { ok: true, data: { id: commentId } };
}

// ─── Labels ──────────────────────────────────────────────────────────────────

/** Mirrors the private `uniqueLabelSlug` in `features/issues/actions.ts`. */
async function uniqueLabelSlug(
  workspaceId: string,
  name: string,
): Promise<string> {
  const base = slugify(name) || "label";
  let slug = base;
  let n = 1;
  while (
    await db.label.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
    })
  ) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

/** Mirrors the private `labelScope` in `features/issues/actions.ts`: resolves
 *  whether a label is workspace- or project-scoped, so its permission check
 *  runs in the right context either way. */
async function labelScope(labelId: string) {
  const label = await db.label.findUnique({
    where: { id: labelId },
    select: { id: true, name: true, workspaceId: true, projectId: true },
  });
  if (!label) return null;

  return {
    label,
    ctx: label.projectId
      ? ({ projectId: label.projectId } as const)
      : ({ workspaceId: label.workspaceId } as const),
  };
}

export interface CreateLabelInput {
  name: string;
  color: string;
  /** Omit for a workspace-wide label. */
  projectId?: string | null;
}

export async function createLabelForUser(
  userId: string,
  workspaceId: string,
  input: CreateLabelInput,
): Promise<MutationResult<ApiLabelDetail>> {
  const name = input.name?.trim();
  if (!name) return fail(422);

  let effectiveWorkspaceId = workspaceId;
  if (input.projectId) {
    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: { workspaceId: true },
    });
    if (!project) return fail(404);
    effectiveWorkspaceId = project.workspaceId;
    if (!(await can(userId, "label.create", { projectId: input.projectId })))
      return fail(404);
  } else {
    if (!(await can(userId, "label.create", { workspaceId }))) return fail(404);
  }

  const slug = await uniqueLabelSlug(effectiveWorkspaceId, name);
  const label = await db.label.create({
    data: {
      id: uid("l"),
      name,
      slug,
      color: input.color,
      workspace: { connect: { id: effectiveWorkspaceId } },
      ...(input.projectId
        ? { project: { connect: { id: input.projectId } } }
        : {}),
    },
    select: { id: true, name: true, slug: true, color: true, projectId: true },
  });

  await recordAudit({
    action: "label.created",
    actorId: userId,
    target: { type: "label", id: label.id, label: label.name },
    workspaceId: effectiveWorkspaceId,
    projectId: input.projectId ?? null,
  });

  return { ok: true, data: label };
}

export interface UpdateLabelInput {
  name?: string;
  color?: string;
}

export async function updateLabelForUser(
  userId: string,
  labelId: string,
  input: UpdateLabelInput,
): Promise<MutationResult<{ id: string }>> {
  const scoped = await labelScope(labelId);
  if (!scoped) return fail(404);
  if (!(await can(userId, "label.update", scoped.ctx))) return fail(404);

  const name = input.name?.trim();
  if (name !== undefined && !name) return fail(422);

  await db.label.update({
    where: { id: labelId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });

  return { ok: true, data: { id: labelId } };
}

export async function deleteLabelForUser(
  userId: string,
  labelId: string,
): Promise<MutationResult<{ id: string }>> {
  const scoped = await labelScope(labelId);
  if (!scoped) return fail(404);
  if (!(await can(userId, "label.delete", scoped.ctx))) return fail(404);

  // `Issue.labels` is a plain id array without a foreign key — clean up the
  // references in the same transaction, same as `deleteLabel()`.
  const tagged = await db.issue.findMany({
    where: { labels: { has: labelId } },
    select: { id: true, labels: true },
  });

  await db.$transaction([
    ...tagged.map((issue) =>
      db.issue.update({
        where: { id: issue.id },
        data: { labels: issue.labels.filter((id) => id !== labelId) },
      }),
    ),
    db.label.delete({ where: { id: labelId } }),
  ]);

  await recordAudit({
    action: "label.deleted",
    actorId: userId,
    target: { type: "label", id: labelId, label: scoped.label.name },
    workspaceId: scoped.label.workspaceId,
    projectId: scoped.label.projectId,
  });

  return { ok: true, data: { id: labelId } };
}

// ─── Workspaces ──────────────────────────────────────────────────────────────

/** Mirrors the private `uniqueWorkspaceSlug` in `features/workspaces/actions.ts`
 *  — the workspace's `id` and `slug` are always set to the same value there,
 *  so this doubles as the id generator too. */
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

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
  color?: string;
}

/**
 * No RBAC check — creating a workspace only needs an authenticated user,
 * same as `createWorkspace()`. Deliberately does NOT also create a first
 * project the way the UI action does: an API caller creates projects
 * explicitly via `POST /workspaces/{id}/projects`, and a side-created
 * resource nobody asked for would be a surprising REST response.
 */
export async function createWorkspaceForUser(
  userId: string,
  input: CreateWorkspaceInput,
): Promise<MutationResult<ApiWorkspace>> {
  if (!canCreateWorkspace(await getSystemSettings())) return fail(403);

  const name = input.name?.trim();
  const slug = input.slug?.trim();
  if (!name || !slug) return fail(422);
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 1) {
    return fail(422);
  }

  const finalSlug = await uniqueWorkspaceSlug(slug);
  const color = input.color?.trim() || "#6e63e6";

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
    await tx.workspaceMember.create({
      data: {
        workspaceId: finalSlug,
        userId,
        roleId: systemRoleId("WORKSPACE", OWNER_ROLE_KEY),
        pending: false,
      },
    });
  });

  return {
    ok: true,
    data: { id: finalSlug, name, color, avatarUrl: null },
  };
}

export interface UpdateWorkspaceInput {
  name?: string;
  color?: string;
  desc?: string;
}

export async function updateWorkspaceForUser(
  userId: string,
  workspaceId: string,
  input: UpdateWorkspaceInput,
): Promise<MutationResult<{ id: string }>> {
  if (!(await can(userId, "workspace.update", { workspaceId })))
    return fail(404);

  const name = input.name?.trim();
  if (name !== undefined && !name) return fail(422);

  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.desc !== undefined ? { desc: input.desc.trim() } : {}),
    },
  });

  return { ok: true, data: { id: workspaceId } };
}

export async function deleteWorkspaceForUser(
  userId: string,
  workspaceId: string,
): Promise<MutationResult<{ id: string }>> {
  if (!(await can(userId, "workspace.delete", { workspaceId })))
    return fail(404);

  await db.$transaction(async (tx) => {
    await tx.issue.deleteMany({ where: { project: { workspaceId } } });
    await tx.workspace.delete({ where: { id: workspaceId } });
  });

  return { ok: true, data: { id: workspaceId } };
}

// ─── Projects ────────────────────────────────────────────────────────────────

/** Mirrors the private helpers of the same name in
 *  `features/projects/actions.ts`. */
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

async function uniqueProjectSlug(
  workspaceId: string,
  base: string,
): Promise<string> {
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

export interface CreateProjectInput {
  name: string;
  desc?: string;
  prefix?: string;
  color: string;
  visibility?: ProjectVisibility;
}

export async function createProjectForUser(
  userId: string,
  workspaceId: string,
  input: CreateProjectInput,
): Promise<MutationResult<ApiProject>> {
  if (!(await can(userId, "project.create", { workspaceId }))) return fail(404);

  const name = input.name?.trim();
  if (!name) return fail(422);

  const visibility: ProjectVisibility =
    input.visibility === "private" ? "private" : "public";

  const desired =
    (input.prefix?.trim() || basePrefix(name))
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 4) || basePrefix(name);
  const prefix = await uniquePrefix(workspaceId, desired);
  const slug = await uniqueProjectSlug(workspaceId, slugify(name));
  const id = uid("p");

  await db.$transaction(async (tx) => {
    await tx.project.create({
      data: {
        id,
        workspaceId,
        name,
        desc: input.desc?.trim() ?? "",
        slug,
        prefix,
        color: input.color,
        visibility,
        createdById: userId,
        // Same default as the web app's own createProject() (BARY-31) — the
        // planning fields hidden, everything else shown.
        hiddenDetailFields: DEFAULT_HIDDEN_DETAIL_FIELDS,
      },
    });

    const project = { id, workspaceId };
    if (visibility === "private") {
      await enrollMember(tx, project, userId);
    } else {
      await enrollWorkspaceMembers(tx, project);
    }
  });

  return { ok: true, data: { id, name, slug, prefix, color: input.color } };
}

export interface UpdateProjectInput {
  name?: string;
  desc?: string;
  prefix?: string;
  color?: string;
  visibility?: ProjectVisibility;
}

export async function updateProjectForUser(
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
): Promise<MutationResult<{ id: string }>> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project) return fail(404);
  if (!(await can(userId, "project.update", { projectId }))) return fail(404);

  const name = input.name?.trim();
  if (name !== undefined && !name) return fail(422);

  let prefix: string | undefined;
  if (input.prefix !== undefined) {
    prefix = input.prefix
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 4);
    if (!prefix) return fail(422);

    const taken = await db.project.findUnique({
      where: {
        workspaceId_prefix: { workspaceId: project.workspaceId, prefix },
      },
      select: { id: true },
    });
    if (taken && taken.id !== projectId) return fail(422);
  }

  const updated = await db.project.update({
    where: { id: projectId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(input.desc !== undefined ? { desc: input.desc.trim() } : {}),
      ...(prefix !== undefined ? { prefix } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.visibility !== undefined
        ? { visibility: input.visibility }
        : {}),
    },
    select: { id: true, workspaceId: true },
  });

  if (input.visibility === "public") {
    await enrollWorkspaceMembers(db, updated);
  }

  return { ok: true, data: { id: projectId } };
}

export async function deleteProjectForUser(
  userId: string,
  projectId: string,
): Promise<MutationResult<{ id: string }>> {
  if (!(await can(userId, "project.delete", { projectId }))) return fail(404);

  await db.$transaction(async (tx) => {
    await tx.issue.deleteMany({ where: { projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });

  return { ok: true, data: { id: projectId } };
}

// ─── Attachments ─────────────────────────────────────────────────────────────

/** Inline uploads (base64 in the request body) stop here — a bigger file
 *  goes through `requestAttachmentUploadForUser` and a direct PUT, the same
 *  way the browser uploads, instead of a 130 MB JSON body. */
export const INLINE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

function invalid(code: string, message: string): MutationResult<never> {
  return { ok: false, status: 422, error: { code, message } };
}

/** The issue an attachment write goes to — `null` (→ 404) when it doesn't
 *  exist or the caller may not edit it. Same permission as the app's
 *  attachment actions (`requireAttachmentAccess`): an attachment is part of
 *  the description, editing the issue covers it. */
async function editableIssueForAttachments(userId: string, idOrRef: string) {
  const issueId = await resolveIssueId(userId, idOrRef);
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      key: true,
      title: true,
      projectId: true,
      reporterId: true,
      assigneeId: true,
      project: { select: { workspaceId: true, prefix: true } },
    },
  });
  if (!issue || !(await canEditIssue(userId, issue))) return null;
  return issue;
}

/** Only `http(s)://`, like `addIssueLinkAttachment()`. */
function isWebUrl(href: string): boolean {
  try {
    return /^https?:$/i.test(new URL(href).protocol);
  } catch {
    return false;
  }
}

/**
 * Base64 (or a `data:` URL) to bytes — `null` when it isn't valid base64.
 * A `data:` URL also brings its MIME type along.
 */
function decodeBase64(
  content: string,
): { bytes: Uint8Array<ArrayBuffer>; mimeType: string | null } | null {
  let raw = content.trim();
  let mimeType: string | null = null;
  const dataUrl = raw.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,/i);
  if (dataUrl) {
    mimeType = dataUrl[1] ?? null;
    raw = raw.slice(dataUrl[0].length);
  }
  raw = raw.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) return null;
  const buffer = Buffer.from(raw, "base64");
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return { bytes, mimeType };
}

export interface RequestAttachmentUploadInput {
  fileName: string;
  contentType?: string;
  /** Bytes. Checked against the limit up front, and again (for real) when
   *  the upload is confirmed. */
  contentLength: number;
}

export interface AttachmentUploadTicket {
  /** Send this back as `key` to create the attachment once the PUT is done. */
  key: string;
  /** PUT the file's bytes here, with the `headers` below. */
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
}

/**
 * Step one of a large upload: a presigned URL the caller PUTs the file to
 * directly (not through Barynt), then `createAttachmentForUser` with the
 * returned `key` — the same two steps the app's own uploader takes.
 */
export async function requestAttachmentUploadForUser(
  userId: string,
  idOrRef: string,
  input: RequestAttachmentUploadInput,
): Promise<MutationResult<AttachmentUploadTicket>> {
  const issue = await editableIssueForAttachments(userId, idOrRef);
  if (!issue) return fail(404);

  const fileName = input.fileName?.trim();
  if (!fileName) return invalid("invalid_name", "fileName is required.");
  if (
    typeof input.contentLength !== "number" ||
    !Number.isFinite(input.contentLength) ||
    input.contentLength < 0
  ) {
    return invalid(
      "invalid_size",
      "contentLength must be the file's size in bytes.",
    );
  }

  const contentType = input.contentType?.trim() || guessContentType(fileName);
  const result = await requestAttachmentUpload({
    issueId: issue.id,
    fileName,
    contentType,
    contentLength: input.contentLength,
  });
  if ("error" in result) return invalid("upload_rejected", result.error);

  return {
    ok: true,
    data: {
      key: result.key,
      uploadUrl: result.uploadUrl,
      method: "PUT",
      headers: { "Content-Type": contentType },
      expiresAt: new Date(Date.now() + PUT_EXPIRES_IN * 1000),
    },
  };
}

export interface CreateAttachmentInput {
  /** A link attachment: an `http(s)://` address. */
  url?: string;
  /** A file uploaded beforehand (`requestAttachmentUploadForUser`). */
  key?: string;
  /** A small file inline: base64, or a `data:` URL. */
  content?: string;
  /** Display name — the file name for a file (required for `content` and
   *  `key`), defaults to the host for a link. */
  name?: string;
  mimeType?: string;
}

/**
 * Adds an attachment — exactly one of `url` (link), `key` (a finished
 * upload) or `content` (inline file). Shows up in the issue's attachments
 * section like one added in the app, and in its activity.
 */
export async function createAttachmentForUser(
  userId: string,
  idOrRef: string,
  input: CreateAttachmentInput,
): Promise<MutationResult<ApiAttachment>> {
  const issue = await editableIssueForAttachments(userId, idOrRef);
  if (!issue) return fail(404);

  const sources = [input.url, input.key, input.content].filter(
    (v) => typeof v === "string" && v.trim() !== "",
  );
  if (sources.length !== 1) {
    return invalid(
      "invalid_source",
      "Send exactly one of url (a link), key (a finished upload) or content (base64).",
    );
  }

  const name = input.name?.trim();
  let data: Prisma.AttachmentUncheckedCreateInput;

  if (input.url) {
    const href = input.url.trim();
    if (!isWebUrl(href)) {
      return invalid("invalid_url", "Only http(s) links are allowed.");
    }
    data = {
      id: uid("att"),
      issueId: issue.id,
      authorId: userId,
      kind: "link",
      name: name || hostOf(href),
      url: href,
      mimeType: input.mimeType?.trim() || null,
    };
  } else {
    if (!name) {
      return invalid("invalid_name", "name (the file name) is required.");
    }
    let key: string;
    let size: number;
    let mimeType = input.mimeType?.trim() || null;

    if (input.key) {
      const finalized = await finalizeAttachmentUpload(issue.id, input.key);
      if ("error" in finalized) {
        return invalid("upload_rejected", finalized.error);
      }
      key = input.key;
      size = finalized.size;
    } else {
      const decoded = decodeBase64(input.content ?? "");
      if (!decoded) {
        return invalid("invalid_content", "content must be base64.");
      }
      if (decoded.bytes.byteLength > INLINE_ATTACHMENT_MAX_BYTES) {
        return invalid(
          "too_large",
          "Inline content is limited to 10 MB — request an upload URL for larger files.",
        );
      }
      mimeType ??= decoded.mimeType;
      const stored = await storeAttachmentBytes({
        issueId: issue.id,
        fileName: name,
        contentType: mimeType ?? guessContentType(name),
        bytes: decoded.bytes,
      });
      if ("error" in stored) return invalid("upload_rejected", stored.error);
      key = stored.key;
      size = stored.size;
    }

    data = {
      id: uid("att"),
      issueId: issue.id,
      authorId: userId,
      kind: "file",
      name,
      key,
      mimeType: mimeType ?? guessContentType(name),
      size,
    };
  }

  const row = await db.attachment.create({ data, select: attachmentSelect });
  await recordIssueAudit(
    "issue.attachment.added",
    issue.id,
    issue,
    userId,
    row.name,
  );
  return { ok: true, data: await mapApiAttachment(row) };
}

/** Removes an attachment — and, for a file, its stored object. */
export async function deleteAttachmentForUser(
  userId: string,
  attachmentId: string,
): Promise<MutationResult<{ id: string }>> {
  const row = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, kind: true, key: true, name: true, issueId: true },
  });
  if (!row) return fail(404);
  const issue = await editableIssueForAttachments(userId, row.issueId);
  if (!issue) return fail(404);

  await db.attachment.delete({ where: { id: attachmentId } });
  if (row.kind === "file") await deleteAttachmentObject(row.key);
  await recordIssueAudit(
    "issue.attachment.removed",
    issue.id,
    issue,
    userId,
    row.name,
  );
  return { ok: true, data: { id: attachmentId } };
}
