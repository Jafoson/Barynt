"use server";

import { revalidatePath } from "next/cache";
import {
  getCommentUnchecked,
  getIssueUnchecked,
} from "@/features/api-v1/queries";
import {
  issueRef,
  issueTypeName,
  priorityName,
  recordIssueAudit,
  recordLabelsChangeAudit,
  recordStatusChangeAudit,
  relationKinds,
} from "@/features/issues/audit";
import { searchWorkspaceIssues } from "@/features/issues/queries";
import type { IssuePatch } from "@/features/issues/types";
import { recordAudit } from "@/lib/audit";
import type { RelationChangeMeta } from "@/lib/audit/actions";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  ISSUE_SHARE_LINK_DAYS,
  issueShareUrl,
  newIssueShareToken,
} from "@/lib/issue-share";
import { sendIssueShareLinkEmail } from "@/lib/mail";
import { notify } from "@/lib/notify";
import {
  currentUserId,
  hasPermission,
  PermissionError,
  requirePermission,
  requirePermissionOr,
} from "@/lib/permissions";
import { recordProjectChange } from "@/lib/realtime/store";
import { stripAttachmentAttrs } from "@/lib/richtext/attachments";
import { hostOf } from "@/lib/richtext/link";
import { mentionedUserIds, toPlainText, toPreview } from "@/lib/richtext/text";
import type { PMDoc } from "@/lib/richtext/types";
import { slugify } from "@/lib/slug";
import {
  deleteAttachmentObject,
  finalizeAttachmentUpload,
  type RequestAttachmentUploadResult,
  requestAttachmentUpload,
  resolveAttachmentUrl,
} from "@/lib/storage";
import { uid } from "@/lib/utils/id";
import { isValidEmail } from "@/lib/utils/parse-emails";
import { fireWebhookEvent } from "@/lib/webhooks/deliver";
import { isClosedStatus } from "@/lib/workspace-defaults";
import type {
  IssueAttachment,
  IssueRelationKind,
  SearchableIssue,
} from "@/types";

/**
 * Revalidates the acting user's own view (`revalidatePath`, as before) and,
 * given a workspace, records a "something changed" timestamp that everyone
 * else's global update banner polls for (BARY-26) — the acting user's own
 * view already refreshes through the Server Action's RSC response, so it
 * doesn't need to be told about its own write; `useProjectUpdates` compares
 * `actorId` against the polling user's own id to skip that.
 *
 * Polling, not Server-Sent Events: a first attempt used SSE
 * (`/api/workspaces/[id]/updates` as a long-lived stream), which worked
 * against the local dev server but never delivered anything in production —
 * the production path runs through a Cloudflare Tunnel whose ingress/
 * buffering config lives in the Cloudflare dashboard, not in this repo, so
 * there was nothing here left to fix. A plain polled GET has no persistent
 * connection for any intermediary to buffer, mirroring how Jira itself
 * surfaces this kind of notice.
 *
 * `projectId`/`issueId` are accepted but currently unused by the store — the
 * banner is workspace-wide (`GlobalUpdateBanner`, mounted once in
 * `[workspace]/layout.tsx`), not scoped to a single board or issue. Kept on
 * the call sites so a future per-project or per-issue narrowing doesn't need
 * to touch every action again.
 */
async function revalidate(ctx?: {
  workspaceId?: string | null;
  projectId?: string;
  issueId?: string;
}) {
  revalidatePath("/", "layout");
  if (ctx?.workspaceId && ctx.projectId) {
    const actorId = await currentUserId();
    if (actorId) {
      recordProjectChange(ctx.workspaceId, actorId);
    }
  }
}

/**
 * The one read in this file, not a mutation: the command palette (`⌘K`,
 * `CommandPalette.tsx`) is a client component and needs a ranked,
 * per-keystroke search, which only a Server Function it can call directly
 * provides. `searchWorkspaceIssues` (`features/issues/queries.ts`) does the
 * actual work.
 */
export async function searchIssuesForPalette(
  workspaceId: string,
  q: string,
): Promise<SearchableIssue[]> {
  return searchWorkspaceIssues(workspaceId, q);
}

// Build a workspace-unique slug for a label (slug is unique per workspace).
async function uniqueLabelSlug(workspaceId: string, name: string) {
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

// Loads the issue fields needed for `.own`/`.any` checks — and the status
// that `closedAt` depends on (see `closedPatch`). Also carries what the
// notifications below need (title, description, workspace/prefix of the
// project), so no second query is needed for that.
async function issueContext(id: string) {
  const issue = await db.issue.findUnique({
    where: { id },
    select: {
      key: true,
      projectId: true,
      reporterId: true,
      assigneeId: true,
      status: true,
      priority: true,
      type: true,
      labels: true,
      closedAt: true,
      title: true,
      description: true,
      shareToken: true,
      shareTokenExpiresAt: true,
      parentId: true,
      project: { select: { workspaceId: true, prefix: true } },
    },
  });
  if (!issue) throw new PermissionError("issue.update.any");
  return issue;
}

/**
 * Notifies the assignee and reporter about a status change — called equally
 * from `moveIssue`, `reorderIssue` and `updateIssue`, since a status change
 * via drag-and-drop is the same occasion as one from the panel.
 */
async function notifyStatusChange(
  issueId: string,
  issue: {
    projectId: string;
    status: string;
    assigneeId: string | null;
    reporterId: string;
    project: { workspaceId: string };
  },
  actorId: string,
  nextStatus: string,
): Promise<void> {
  if (nextStatus === issue.status) return;
  const recipients = [...new Set([issue.assigneeId, issue.reporterId])].filter(
    (userId): userId is string => !!userId && userId !== actorId,
  );
  if (recipients.length === 0) return;
  await notify(
    recipients.map((userId) => ({
      userId,
      type: "status" as const,
      actorId,
      workspaceId: issue.project.workspaceId,
      projectId: issue.projectId,
      issueId,
      text: nextStatus,
    })),
  );
}

/** Who was newly mentioned in a document, minus whoever wrote it. */
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

/**
 * What needs to change on the closed date when the status changes to `next`.
 *
 * Three cases, and the third is the reason this function exists: reopening a
 * completed task must clear the date — otherwise the dashboard keeps
 * counting it toward the throughput of the day it was once finished. And
 * moving it from "Done" to "Canceled" keeps the original date: it was
 * closed back then, only how it was closed got renamed.
 *
 * An empty object means "nothing to touch" and can be spread into `data`
 * unchanged.
 */
function closedPatch(
  before: { status: string; closedAt: Date | null },
  next: string | undefined,
): { closedAt?: Date | null } {
  if (next === undefined || next === before.status) return {};

  if (isClosedStatus(next)) {
    // Already has a date? Then it stays as-is — see "Done" → "Canceled".
    return before.closedAt ? {} : { closedAt: new Date() };
  }
  return before.closedAt ? { closedAt: null } : {};
}

export async function moveIssue(id: string, status: string) {
  const issue = await issueContext(id);
  const actorId = await requirePermissionOr([
    {
      permission: "issue.update.any",
      ctx: { projectId: issue.projectId },
    },
    {
      permission: "issue.update.own",
      ctx: { projectId: issue.projectId },
      ownerIds: [issue.reporterId, issue.assigneeId],
    },
  ]);
  await db.issue.update({
    where: { id },
    data: { status, ...closedPatch(issue, status) },
  });
  await notifyStatusChange(id, issue, actorId, status);
  if (status !== issue.status) {
    await recordStatusChangeAudit(id, issue, actorId, issue.status, status);
  }
  await revalidate({
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    issueId: id,
  });
}

export async function reorderIssue(id: string, status: string, rank: number) {
  const issue = await issueContext(id);
  const actorId = await requirePermissionOr([
    {
      permission: "issue.update.any",
      ctx: { projectId: issue.projectId },
    },
    {
      permission: "issue.update.own",
      ctx: { projectId: issue.projectId },
      ownerIds: [issue.reporterId, issue.assigneeId],
    },
  ]);
  await db.issue.update({
    where: { id },
    data: { status, rank, ...closedPatch(issue, status) },
  });
  await notifyStatusChange(id, issue, actorId, status);
  if (status !== issue.status) {
    await recordStatusChangeAudit(id, issue, actorId, issue.status, status);
  }
  await revalidate({
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    issueId: id,
  });
}

export async function updateIssue(id: string, patch: IssuePatch) {
  const issue = await issueContext(id);
  const ctx = { projectId: issue.projectId };
  const actorId = await requirePermissionOr([
    { permission: "issue.update.any", ctx },
    {
      permission: "issue.update.own",
      ctx,
      ownerIds: [issue.reporterId, issue.assigneeId],
    },
  ]);
  // (Re-)assigning an issue additionally requires the assign permission.
  if (patch.assignee !== undefined) {
    await requirePermission("issue.assign", ctx);
  }

  await db.issue.update({
    where: { id },
    data: {
      ...(patch.status !== undefined && { status: patch.status }),
      ...closedPatch(issue, patch.status),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.type !== undefined && { type: patch.type }),
      ...(patch.assignee !== undefined && { assigneeId: patch.assignee }),
      ...(patch.labels !== undefined && { labels: patch.labels }),
      ...(patch.title !== undefined && { title: patch.title }),
      // The document and its derived plain text belong together — otherwise
      // search would run against a stale state. `stripAttachmentAttrs`
      // strips back off the attachment attributes (url, name, mimeType,
      // size) that were only added for display — otherwise a presigned URL
      // that expires after an hour would end up permanently in the column.
      ...(patch.description !== undefined && {
        description: stripAttachmentAttrs(
          patch.description,
        ) as unknown as Prisma.InputJsonValue,
        descriptionText: toPlainText(patch.description),
      }),
    },
  });

  if (
    patch.assignee &&
    patch.assignee !== issue.assigneeId &&
    patch.assignee !== actorId
  ) {
    await notify({
      userId: patch.assignee,
      type: "assigned",
      actorId,
      workspaceId: issue.project.workspaceId,
      projectId: issue.projectId,
      issueId: id,
    });
  }

  if (patch.status !== undefined) {
    await notifyStatusChange(id, issue, actorId, patch.status);
  }

  if (patch.description !== undefined) {
    const before = new Set(mentionedUserIds(issue.description));
    const newlyMentioned = mentionedUserIds(patch.description).filter(
      (userId) => !before.has(userId),
    );
    await notifyMentions(
      newlyMentioned,
      {
        workspaceId: issue.project.workspaceId,
        projectId: issue.projectId,
        issueId: id,
        text: toPreview(patch.description),
      },
      actorId,
    );
  }

  // ── Broadly log what changed ──
  //
  // One entry per changed aspect, not a field-by-field diff: "title changed"
  // says enough, the old text doesn't belong in the log. Every comparison
  // runs against the state of `issue` (before this patch) — saving the same
  // value again (a picker without a real change) therefore produces no line.
  if (patch.assignee !== undefined && patch.assignee !== issue.assigneeId) {
    if (patch.assignee) {
      const [assignee, previous] = await Promise.all([
        db.user.findUnique({
          where: { id: patch.assignee },
          select: { firstName: true, lastName: true, color: true },
        }),
        // Whoever had the task before — included in the line, otherwise a
        // reassignment would look like a first-time assignment.
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
        id,
        issue,
        actorId,
        previousName ? `${previousName} → ${assigneeName}` : assigneeName,
        undefined,
        assignee?.color ?? null,
      );
    } else {
      await recordIssueAudit("issue.unassigned", id, issue, actorId);
    }
  }

  if (patch.title !== undefined && patch.title !== issue.title) {
    await recordIssueAudit(
      "issue.title.changed",
      id,
      issue,
      actorId,
      `${issue.title} → ${patch.title}`,
    );
  }

  if (
    patch.description !== undefined &&
    JSON.stringify(patch.description) !== JSON.stringify(issue.description)
  ) {
    await recordIssueAudit("issue.description.changed", id, issue, actorId);
  }

  if (patch.status !== undefined && patch.status !== issue.status) {
    await recordStatusChangeAudit(
      id,
      issue,
      actorId,
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
      id,
      issue,
      actorId,
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
      id,
      issue,
      actorId,
      `${fromName ?? issue.type} → ${toName ?? patch.type}`,
      { from: issue.type, to: patch.type },
    );
  }

  if (patch.labels !== undefined) {
    await recordLabelsChangeAudit(
      id,
      issue,
      actorId,
      issue.labels,
      patch.labels,
    );
  }

  const updated = await getIssueUnchecked(id);
  if (updated)
    fireWebhookEvent(issue.project.workspaceId, "issue.updated", updated);

  await revalidate({
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    issueId: id,
  });
}

// ── Attachments ────────────────────────────────────────────────────────────
//
// Same permission as editing the description itself (`issue.update.any`/
// `.own`) — an attachment is part of the description, no separate
// permission needed.

async function requireAttachmentAccess(issueId: string) {
  const issue = await issueContext(issueId);
  const actorId = await requirePermissionOr([
    { permission: "issue.update.any", ctx: { projectId: issue.projectId } },
    {
      permission: "issue.update.own",
      ctx: { projectId: issue.projectId },
      ownerIds: [issue.reporterId, issue.assigneeId],
    },
  ]);
  return { actorId, issue };
}

export async function requestIssueAttachmentUpload(
  issueId: string,
  input: { fileName: string; contentType: string; contentLength: number },
): Promise<RequestAttachmentUploadResult> {
  await requireAttachmentAccess(issueId);
  return requestAttachmentUpload({ issueId, ...input });
}

export async function confirmIssueAttachmentUpload(
  issueId: string,
  key: string,
  input: { fileName: string; contentType: string },
): Promise<{ ok: true; attachment: IssueAttachment } | { error: string }> {
  const { actorId, issue } = await requireAttachmentAccess(issueId);

  const finalized = await finalizeAttachmentUpload(issueId, key);
  if ("error" in finalized) return finalized;

  const row = await db.attachment.create({
    data: {
      id: uid("att"),
      issueId,
      authorId: actorId,
      kind: "file",
      name: input.fileName,
      key,
      mimeType: input.contentType,
      size: finalized.size,
    },
  });

  await revalidate({
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    issueId,
  });
  await recordIssueAudit(
    "issue.attachment.added",
    issueId,
    issue,
    actorId,
    row.name,
  );
  return {
    ok: true,
    attachment: {
      id: row.id,
      kind: "file",
      name: row.name,
      url: await resolveAttachmentUrl(row.key),
      mimeType: row.mimeType,
      size: row.size,
      createdAt: row.created.getTime(),
      authorId: row.authorId,
    },
  };
}

/** Only `http(s)://` — the same restraint as for any other address that
 *  ends up in an `href` (see `lib/richtext/link.ts`). */
function isWebUrl(href: string): boolean {
  try {
    return /^https?:$/i.test(new URL(href).protocol);
  } catch {
    return false;
  }
}

export async function addIssueLinkAttachment(
  issueId: string,
  input: { url: string; name?: string; mimeType?: string | null },
): Promise<{ ok: true; attachment: IssueAttachment } | { error: string }> {
  const { actorId, issue } = await requireAttachmentAccess(issueId);

  const href = input.url.trim();
  if (!isWebUrl(href)) return { error: "Only http(s) links are allowed." };

  const row = await db.attachment.create({
    data: {
      id: uid("att"),
      issueId,
      authorId: actorId,
      kind: "link",
      name: input.name?.trim() || hostOf(href),
      url: href,
      mimeType: input.mimeType ?? null,
    },
  });

  await revalidate({
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    issueId,
  });
  await recordIssueAudit(
    "issue.attachment.added",
    issueId,
    issue,
    actorId,
    row.name,
  );
  return {
    ok: true,
    attachment: {
      id: row.id,
      kind: "link",
      name: row.name,
      url: row.url,
      mimeType: row.mimeType,
      size: null,
      createdAt: row.created.getTime(),
      authorId: row.authorId,
    },
  };
}

export async function deleteIssueAttachment(
  issueId: string,
  attachmentId: string,
): Promise<{ ok: true } | { error: string }> {
  const { actorId, issue } = await requireAttachmentAccess(issueId);

  const row = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!row || row.issueId !== issueId) return { error: "Not found." };

  await db.attachment.delete({ where: { id: attachmentId } });
  if (row.kind === "file") await deleteAttachmentObject(row.key);

  await revalidate({
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    issueId,
  });
  await recordIssueAudit(
    "issue.attachment.removed",
    issueId,
    issue,
    actorId,
    row.name,
  );
  return { ok: true };
}

export async function createIssue(data: {
  title: string;
  description: PMDoc;
  status: string;
  priority: number;
  assignee: string | null;
  labels: string[];
  type: string;
  projectId: string;
  reporterId: string;
}) {
  // The reporter is always the logged-in user — not the client parameter.
  const userId = await requirePermission("issue.create", {
    projectId: data.projectId,
  });

  // Atomically claim the next key for this project. The counter only ever
  // increments, so deleted keys are never reused and each key stays unique.
  const { lastIssueKey, workspaceId, prefix } = await db.project.update({
    where: { id: data.projectId },
    data: { lastIssueKey: { increment: 1 } },
    select: { lastIssueKey: true, workspaceId: true, prefix: true },
  });
  const id = uid("i");
  await db.issue.create({
    data: {
      id,
      key: lastIssueKey,
      title: data.title,
      description: stripAttachmentAttrs(
        data.description,
      ) as unknown as Prisma.InputJsonValue,
      descriptionText: toPlainText(data.description),
      status: data.status,
      // Creating a task as already done — backfilled work — closes it in
      // the same second.
      ...(isClosedStatus(data.status) ? { closedAt: new Date() } : {}),
      priority: data.priority,
      assigneeId: data.assignee,
      labels: data.labels,
      type: data.type,
      projectId: data.projectId,
      reporterId: userId,
      rank: Date.now(),
    },
  });

  if (data.assignee && data.assignee !== userId) {
    await notify({
      userId: data.assignee,
      type: "assigned",
      actorId: userId,
      workspaceId,
      projectId: data.projectId,
      issueId: id,
    });
  }

  await notifyMentions(
    mentionedUserIds(data.description),
    {
      workspaceId,
      projectId: data.projectId,
      issueId: id,
      text: toPreview(data.description),
    },
    userId,
  );

  await recordIssueAudit(
    "issue.created",
    id,
    {
      key: lastIssueKey,
      projectId: data.projectId,
      project: { workspaceId, prefix },
    },
    userId,
    data.title,
  );

  const created = await getIssueUnchecked(id);
  if (created) fireWebhookEvent(workspaceId, "issue.created", created);

  await revalidate({ workspaceId, projectId: data.projectId, issueId: id });
  return { id };
}

export async function createLabel(data: {
  name: string;
  color: string;
  workspaceId: string;
  projectId?: string | null;
}) {
  // A project label belongs to two parents: the project and its workspace.
  // The workspace is therefore taken from the project, not from the call —
  // the check happens in the project context, otherwise a write could land
  // elsewhere. A call with someone else's `workspaceId` can no longer
  // create a label in a foreign tenant this way.
  let workspaceId = data.workspaceId;
  let actorId: string;

  if (data.projectId) {
    const project = await db.project.findUnique({
      where: { id: data.projectId },
      select: { workspaceId: true },
    });
    if (!project) throw new PermissionError("label.create");
    workspaceId = project.workspaceId;

    actorId = await requirePermission("label.create", {
      projectId: data.projectId,
    });
  } else {
    actorId = await requirePermission("label.create", { workspaceId });
  }

  const slug = await uniqueLabelSlug(workspaceId, data.name);
  const label = await db.label.create({
    data: {
      id: uid("l"),
      name: data.name,
      slug,
      color: data.color,
      workspace: { connect: { id: workspaceId } },
      ...(data.projectId
        ? { project: { connect: { id: data.projectId } } }
        : {}),
    },
  });

  await recordAudit({
    action: "label.created",
    actorId,
    target: { type: "label", id: label.id, label: label.name },
    workspaceId,
    projectId: data.projectId ?? null,
  });

  await revalidate({ workspaceId, projectId: data.projectId ?? undefined });
  return {
    id: label.id,
    name: label.name,
    slug: label.slug,
    color: label.color,
    projectId: label.projectId,
  };
}

/**
 * Unlike `createLabel`, update and delete don't throw but report the reason
 * back — they're called from the management page, which displays the
 * message instead of hitting an error boundary.
 */
type LabelResult = { ok: true } | { error: string };

/**
 * The scope in which a label is decided.
 *
 * A project label belongs to its project, a label without a `projectId`
 * belongs to the whole workspace. Same permission key, two levels — exactly
 * the distinction `WORKSPACE_AND_PROJECT` stands for in the registry. A
 * workspace label therefore can't be changed from a single project's
 * settings: it also applies in all the others.
 */
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

/**
 * Change a label's name and color.
 *
 * The slug stays as it is. It appears in saved filters and in the URLs of
 * open tabs (`?label=…`) — a rename shouldn't make those point at nothing.
 * Anyone who really needs a new slug creates a new label.
 */
export async function updateLabel(
  labelId: string,
  data: { name?: string; color?: string },
): Promise<LabelResult> {
  const scoped = await labelScope(labelId);
  if (!scoped) return { error: "This label no longer exists." };

  if (!(await hasPermission("label.update", scoped.ctx)))
    return { error: "You are not allowed to edit this label." };

  const name = data.name?.trim();
  if (name !== undefined && !name) return { error: "Name is required." };

  await db.label.update({
    where: { id: labelId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
    },
  });
  await revalidate({
    workspaceId: scoped.label.workspaceId,
    projectId: scoped.label.projectId ?? undefined,
  });
  return { ok: true };
}

/**
 * Delete a label and remove it from every issue it's attached to.
 *
 * `Issue.labels` is an array of IDs without a foreign key — the database
 * doesn't clean up after this. Without the second step, every affected
 * issue would be left with an ID pointing at nothing: the display would
 * silently ignore it, but filters would still count it.
 *
 * Both steps in one transaction, so there's no in-between state where the
 * label is already gone but the references still exist.
 */
export async function deleteLabel(labelId: string): Promise<LabelResult> {
  const scoped = await labelScope(labelId);
  if (!scoped) return { error: "This label no longer exists." };

  if (!(await hasPermission("label.delete", scoped.ctx)))
    return { error: "You are not allowed to delete this label." };

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
    actorId: await currentUserId(),
    target: { type: "label", id: labelId, label: scoped.label.name },
    workspaceId: scoped.label.workspaceId,
    projectId: scoped.label.projectId,
  });

  await revalidate({
    workspaceId: scoped.label.workspaceId,
    projectId: scoped.label.projectId ?? undefined,
  });
  return { ok: true };
}

/**
 * Hide or unhide a workspace label within a project.
 *
 * The counterpart to deleting: the label stays where it belongs and still
 * applies in every other project — it's just no longer offered here. This
 * lets a workspace-wide collection be used without every project having to
 * carry every label along.
 *
 * The decision is made in the project scope via `label.update`: it's a
 * statement about this project, not about the label. Someone with no
 * workspace permissions can still tidy up here — without changing anything
 * for the others.
 *
 * The call is pointless for project labels and is rejected: they only apply
 * here anyway, so hiding them would mean deleting them. The label on issues
 * that already carry it is left untouched in both directions.
 */
export async function setLabelHidden(
  projectId: string,
  labelId: string,
  hidden: boolean,
): Promise<LabelResult> {
  const label = await db.label.findUnique({
    where: { id: labelId },
    select: { workspaceId: true, projectId: true },
  });
  if (!label) return { error: "This label no longer exists." };
  if (label.projectId)
    return { error: "Only workspace labels can be hidden in a project." };

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  // A label from a foreign tenant has no business in this project — not
  // even as a hidden row.
  if (!project || project.workspaceId !== label.workspaceId)
    return { error: "This label does not belong to this project." };

  if (!(await hasPermission("label.update", { projectId })))
    return { error: "You are not allowed to change the labels here." };

  // Both directions tolerate a second call: two clicks on the same toggle
  // should not produce an error, just the same end state.
  if (hidden) {
    await db.projectHiddenLabel.upsert({
      where: { projectId_labelId: { projectId, labelId } },
      create: { projectId, labelId },
      update: {},
    });
  } else {
    await db.projectHiddenLabel.deleteMany({ where: { projectId, labelId } });
  }

  await revalidate({ workspaceId: project.workspaceId, projectId });
  return { ok: true };
}

export async function deleteIssue(id: string) {
  const issue = await issueContext(id);
  const actorId = await requirePermissionOr([
    {
      permission: "issue.delete.any",
      ctx: { projectId: issue.projectId },
    },
    {
      permission: "issue.delete.own",
      ctx: { projectId: issue.projectId },
      ownerIds: [issue.reporterId, issue.assigneeId],
    },
  ]);
  await db.issue.delete({ where: { id } });

  await recordIssueAudit("issue.deleted", id, issue, actorId, issue.title);

  // Minimal payload, not the full `ApiIssue` shape the other events use —
  // the issue no longer exists to re-fetch, this is a snapshot from just
  // before the delete.
  fireWebhookEvent(issue.project.workspaceId, "issue.deleted", {
    id,
    ref: `${issue.project.prefix}-${issue.key}`,
    projectId: issue.projectId,
    title: issue.title,
  });

  // No `issueId` here — the issue is gone, so a subscriber's card just needs
  // to disappear on the next board refresh, not a targeted single-issue update.
  await revalidate({
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
  });
}

/** New token + the metadata `/share/[token]` displays about the current link
 *  (who, when, until when) — in one place, so `enableIssueShare` and the
 *  silent enabling from `shareIssueByEmail` don't drift apart. */
function newShareTokenData(actorId: string, now: Date) {
  return {
    shareToken: newIssueShareToken(),
    shareTokenCreatedAt: now,
    shareTokenCreatedById: actorId,
    shareTokenExpiresAt: new Date(
      now.getTime() + ISSUE_SHARE_LINK_DAYS * 24 * 60 * 60 * 1000,
    ),
  };
}

/**
 * Enables an issue's public read-only link and generates (or renews) the
 * token. Anyone who knows the link sees title, description, status/
 * priority/type/labels, and comments — nothing that `issue.share.manage`
 * couldn't already see itself, just without logging in (`/share/[token]`).
 */
export async function enableIssueShare(
  id: string,
): Promise<{ ok: true; url: string }> {
  const issue = await issueContext(id);
  const actorId = await requirePermission("issue.share.manage", {
    projectId: issue.projectId,
  });

  const data = newShareTokenData(actorId, new Date());
  await db.issue.update({ where: { id }, data });

  await recordIssueAudit("issue.shared", id, issue, actorId);

  // No `projectId` — the share link isn't part of the board card or the
  // fields shown in the detail view, so a stale-view banner would have
  // nothing to point at.
  await revalidate();
  return { ok: true, url: issueShareUrl(data.shareToken) };
}

/** Disables the public read-only link again — the old token becomes invalid. */
export async function disableIssueShare(id: string): Promise<{ ok: true }> {
  const issue = await issueContext(id);
  const actorId = await requirePermission("issue.share.manage", {
    projectId: issue.projectId,
  });

  await db.issue.update({
    where: { id },
    data: {
      shareToken: null,
      shareTokenCreatedAt: null,
      shareTokenExpiresAt: null,
      shareTokenCreatedById: null,
    },
  });

  await recordIssueAudit("issue.share.revoked", id, issue, actorId);

  await revalidate();
  return { ok: true };
}

/**
 * Notifies a workspace member about this issue — in-app and, if the person
 * has it enabled, by mail (`lib/notify`, "issueShared" event). Unlike the
 * public link, this needs no token: the person sees the issue through their
 * own, entirely normal permission, just like with a mention — if they lack
 * it, they hit the same access barrier on opening as with any other mention.
 */
export async function shareIssueWithMember(
  id: string,
  userId: string,
  message?: string,
): Promise<{ ok: true }> {
  const issue = await issueContext(id);
  const actorId = await requirePermission("issue.share.manage", {
    projectId: issue.projectId,
  });

  await notify({
    userId,
    type: "issueShared",
    actorId,
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    issueId: id,
    text: message?.trim() ?? "",
  });

  return { ok: true };
}

/**
 * Sends the public read-only link by mail to any address — unlike
 * `shareIssueWithMember`, no account in the system, hence via the
 * `/share/[token]` route instead of the internal issue page. If sharing is
 * still off, sending it enables it at the same time (the same token as the
 * explicit "create link") — a mail with a dead link would be pointless.
 */
export async function shareIssueByEmail(
  id: string,
  email: string,
  message?: string,
): Promise<{ ok: true; url: string } | { error: string }> {
  const issue = await issueContext(id);
  const actorId = await requirePermission("issue.share.manage", {
    projectId: issue.projectId,
  });

  const to = email.trim().toLowerCase();
  if (!isValidEmail(to)) return { error: "invalid-email" };

  const now = new Date();
  let token: string;
  if (
    issue.shareToken &&
    (!issue.shareTokenExpiresAt || issue.shareTokenExpiresAt > now)
  ) {
    token = issue.shareToken;
  } else {
    const data = newShareTokenData(actorId, now);
    token = data.shareToken;
    await db.issue.update({ where: { id }, data });
    await recordIssueAudit("issue.shared", id, issue, actorId);
    await revalidate();
  }

  const url = issueShareUrl(token);

  await sendIssueShareLinkEmail({
    to,
    actorId,
    issueIdentifier: `${issue.project.prefix}-${issue.key}`,
    issueTitle: issue.title,
    text: message?.trim() || undefined,
    url,
  });

  return { ok: true, url };
}

export async function addComment(
  issueId: string,
  body: PMDoc,
  _authorId: string,
  /** Reply to another comment — `undefined` means top-level. */
  parentId?: string,
) {
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: {
      projectId: true,
      assigneeId: true,
      reporterId: true,
      project: { select: { workspaceId: true } },
    },
  });
  if (!issue) throw new PermissionError("comment.create");
  // The author is always the logged-in user — the parameter is ignored.
  const userId = await requirePermission("comment.create", {
    projectId: issue.projectId,
  });

  let parentAuthorId: string | null = null;
  if (parentId) {
    // Prevents a reply from docking onto a comment on a different issue via
    // that issue's `issueId` — the client sends `issueId` and `parentId`
    // separately, so a tampered call could otherwise pull them apart.
    const parent = await db.comment.findUnique({
      where: { id: parentId },
      select: { issueId: true, authorId: true },
    });
    if (!parent || parent.issueId !== issueId) {
      throw new PermissionError("comment.create");
    }
    parentAuthorId = parent.authorId;
  }

  const comment = await db.comment.create({
    data: {
      id: uid("c"),
      body: body as unknown as Prisma.InputJsonValue,
      bodyText: toPlainText(body),
      issueId,
      authorId: userId,
      parentId,
    },
  });

  const commentForWebhook = await getCommentUnchecked(comment.id);
  if (commentForWebhook) {
    fireWebhookEvent(
      issue.project.workspaceId,
      "comment.created",
      commentForWebhook,
    );
  }

  const text = toPreview(body);
  const mentionedIds = mentionedUserIds(body).filter((id) => id !== userId);
  await notifyMentions(
    mentionedIds,
    {
      workspaceId: issue.project.workspaceId,
      projectId: issue.projectId,
      issueId,
      text,
    },
    userId,
  );

  // Anyone explicitly mentioned only gets the more specific "mentioned"
  // notification, not additionally the generic "comment" one for the same
  // line.
  const mentioned = new Set(mentionedIds);

  // On a reply, the original author gets the more specific "commentReply"
  // notification instead of the generic "comment" one — even if they
  // happen to be the assignee or reporter of the issue.
  const replyRecipientId =
    parentAuthorId &&
    parentAuthorId !== userId &&
    !mentioned.has(parentAuthorId)
      ? parentAuthorId
      : null;
  if (replyRecipientId) {
    await notify({
      userId: replyRecipientId,
      type: "commentReply",
      actorId: userId,
      workspaceId: issue.project.workspaceId,
      projectId: issue.projectId,
      issueId,
      text,
    });
  }

  const commentRecipients = [
    ...new Set([issue.assigneeId, issue.reporterId]),
  ].filter(
    (id): id is string =>
      !!id && id !== userId && !mentioned.has(id) && id !== replyRecipientId,
  );
  if (commentRecipients.length > 0) {
    await notify(
      commentRecipients.map((recipientId) => ({
        userId: recipientId,
        type: "comment" as const,
        actorId: userId,
        workspaceId: issue.project.workspaceId,
        projectId: issue.projectId,
        issueId,
        text,
      })),
    );
  }

  await revalidate({
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    issueId,
  });
}

export async function deleteComment(commentId: string) {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: {
      authorId: true,
      issueId: true,
      issue: {
        select: { projectId: true, project: { select: { workspaceId: true } } },
      },
    },
  });
  if (!comment) throw new PermissionError("comment.delete.any");
  const ctx = { projectId: comment.issue.projectId };
  await requirePermissionOr([
    { permission: "comment.delete.any", ctx },
    {
      permission: "comment.delete.own",
      ctx,
      ownerIds: [comment.authorId],
    },
  ]);
  await db.comment.delete({ where: { id: commentId } });
  await revalidate({
    workspaceId: comment.issue.project.workspaceId,
    projectId: comment.issue.projectId,
    issueId: comment.issueId,
  });
}

export async function updateComment(commentId: string, body: PMDoc) {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: {
      authorId: true,
      issueId: true,
      issue: {
        select: { projectId: true, project: { select: { workspaceId: true } } },
      },
    },
  });
  if (!comment) throw new PermissionError("comment.update.any");
  const ctx = { projectId: comment.issue.projectId };
  await requirePermissionOr([
    { permission: "comment.update.any", ctx },
    {
      permission: "comment.update.own",
      ctx,
      ownerIds: [comment.authorId],
    },
  ]);
  await db.comment.update({
    where: { id: commentId },
    data: {
      body: body as unknown as Prisma.InputJsonValue,
      bodyText: toPlainText(body),
      updated: new Date(),
    },
  });
  await revalidate({
    workspaceId: comment.issue.project.workspaceId,
    projectId: comment.issue.projectId,
    issueId: comment.issueId,
  });
}

/**
 * Reaction on/off — at most one row per person, comment, and emoji
 * (`@@unique([commentId, userId, emoji])`). Instead of checking beforehand
 * whether it already exists (a race window for a double-click), it's
 * created directly and a conflict is read as "already there, so remove it"
 * — the unique index turns the create attempt itself into the check.
 */
export async function toggleCommentReaction(commentId: string, emoji: string) {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: {
      issueId: true,
      issue: {
        select: { projectId: true, project: { select: { workspaceId: true } } },
      },
    },
  });
  if (!comment) throw new PermissionError("comment.react");
  const userId = await requirePermission("comment.react", {
    projectId: comment.issue.projectId,
  });

  try {
    await db.commentReaction.create({
      data: { id: uid("cr"), commentId, userId, emoji },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      await db.commentReaction.delete({
        where: { commentId_userId_emoji: { commentId, userId, emoji } },
      });
    } else {
      throw err;
    }
  }
  await revalidate({
    workspaceId: comment.issue.project.workspaceId,
    projectId: comment.issue.projectId,
    issueId: comment.issueId,
  });
}

// ── Sub-issues & relations (BARY-1) ─────────────────────────────────────────
//
// Same permission as any other field on the issue (`issue.update.any`/`.own`
// — see `updateIssue`): a parent or a relation is part of editing the issue
// it's set on, not a separate capability. Both report `{ error }` instead of
// throwing for the validations that are genuine user mistakes (self-
// reference, a cycle, an issue that no longer exists) — `PermissionError`
// stays reserved for "you're not allowed", same restraint as
// `updateLabel`/`deleteLabel`.

type ActionResult = { ok: true } | { error: string };

/**
 * Walks the parent chain upward from `startId`, `true` as soon as `target`
 * appears in it — guards `setIssueParent` against creating a cycle (`target`
 * becoming its own, possibly indirect, sub-issue). Bounded at 50 hops: a
 * genuine chain never gets remotely that deep, and it keeps the walk from
 * looping forever if one ever did.
 */
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
 * Sets or clears an issue's parent — the two ends of the same "sub-issue of"
 * relationship (`IssueRelations`'s "Parent" and "Sub-issues"). `parentId:
 * null` detaches it back to the top level.
 */
export async function setIssueParent(
  id: string,
  parentId: string | null,
): Promise<ActionResult> {
  const issue = await issueContext(id);
  const ctx = { projectId: issue.projectId };
  const actorId = await requirePermissionOr([
    { permission: "issue.update.any", ctx },
    {
      permission: "issue.update.own",
      ctx,
      ownerIds: [issue.reporterId, issue.assigneeId],
    },
  ]);

  if (parentId === issue.parentId) return { ok: true };

  if (parentId) {
    if (parentId === id) return { error: "An issue cannot be its own parent." };
    const parent = await db.issue.findUnique({
      where: { id: parentId },
      select: { projectId: true },
    });
    if (
      !parent ||
      !(await hasPermission("project.view", { projectId: parent.projectId }))
    ) {
      return { error: "That issue could not be found." };
    }
    // `id` would end up somewhere in its own future parent chain — the
    // parent being made its own (possibly indirect) sub-issue.
    if (await chainContains(parentId, id)) {
      return { error: "That would create a circular relationship." };
    }
  }

  // Fetched before the write, for the audit trail below — `issueRef()`
  // needs each side's key/prefix, and the old parent won't be reachable
  // through `issue` anymore afterwards.
  const [newParent, oldParent] = await Promise.all([
    parentId ? issueContext(parentId) : Promise.resolve(null),
    issue.parentId ? issueContext(issue.parentId) : Promise.resolve(null),
  ]);

  await db.issue.update({ where: { id }, data: { parentId } });
  await revalidate({
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    issueId: id,
  });

  // Logged on every issue the change is visible from — this one, the
  // parent it lost, and the parent it gained — the same "shown on both
  // ends" framing `IssueRelations` already uses for relation edges.
  if (newParent) {
    await recordIssueAudit(
      "issue.parent.set",
      id,
      issue,
      actorId,
      oldParent
        ? `${issueRef(oldParent)} → ${issueRef(newParent)}`
        : issueRef(newParent),
    );
    await recordIssueAudit(
      "issue.child.added",
      parentId as string,
      newParent,
      actorId,
      issueRef(issue),
    );
  } else {
    await recordIssueAudit("issue.parent.cleared", id, issue, actorId);
  }
  if (oldParent) {
    await recordIssueAudit(
      "issue.child.removed",
      issue.parentId as string,
      oldParent,
      actorId,
      issueRef(issue),
    );
  }

  return { ok: true };
}

/**
 * Links two issues with a typed edge. `RELATES_TO` has no real direction —
 * the pair is stored under whichever id sorts first, so "A relates to B"
 * and "B relates to A" can't end up as two separate rows for the same
 * statement; `BLOCKS`/`DUPLICATES` keep `issueId`/`relatedId` as given,
 * since which side is the source is part of what they mean.
 *
 * Permission is checked against `id` (the issue the UI action was triggered
 * from) — same as any other field on it. The other issue only needs to be
 * one the caller can *see* (`project.view`): the relation records that it
 * exists, it doesn't change anything on that side.
 */
export async function addIssueRelation(
  id: string,
  relatedId: string,
  type: IssueRelationKind,
): Promise<ActionResult> {
  if (relatedId === id) return { error: "An issue cannot relate to itself." };

  const issue = await issueContext(id);
  const ctx = { projectId: issue.projectId };
  const actorId = await requirePermissionOr([
    { permission: "issue.update.any", ctx },
    {
      permission: "issue.update.own",
      ctx,
      ownerIds: [issue.reporterId, issue.assigneeId],
    },
  ]);

  const related = await db.issue.findUnique({
    where: { id: relatedId },
    select: { projectId: true },
  });
  if (
    !related ||
    !(await hasPermission("project.view", { projectId: related.projectId }))
  ) {
    return { error: "That issue could not be found." };
  }

  const [fromId, toId] =
    type === "RELATES_TO" && relatedId < id ? [relatedId, id] : [id, relatedId];

  const existing = await db.issueRelation.findUnique({
    where: {
      issueId_relatedId_type: { issueId: fromId, relatedId: toId, type },
    },
  });
  if (!existing) {
    await db.issueRelation.create({
      data: { id: uid("ir"), type, issueId: fromId, relatedId: toId },
    });
  }

  await revalidate({
    workspaceId: issue.project.workspaceId,
    projectId: issue.projectId,
    issueId: id,
  });

  // Only for an edge that's actually new — repicking the same pair and type
  // is a no-op above (`existing`), and shouldn't add a second log line.
  // Logged on both issues it connects, each phrased from its own side
  // (`relationKinds`) — the same "shown on both ends" the relation itself
  // already gets in `IssueRelations`.
  if (!existing) {
    const relatedCtx = await issueContext(relatedId);
    const [ownKind, relatedKind] = relationKinds(type);
    const ownRef = issueRef(issue);
    const relatedRef = issueRef(relatedCtx);
    await recordIssueAudit(
      "issue.relation.added",
      id,
      issue,
      actorId,
      relatedRef,
      { kind: ownKind, ref: relatedRef } satisfies RelationChangeMeta,
    );
    await recordIssueAudit(
      "issue.relation.added",
      relatedId,
      relatedCtx,
      actorId,
      ownRef,
      { kind: relatedKind, ref: ownRef } satisfies RelationChangeMeta,
    );
  }

  return { ok: true };
}

/**
 * Removes a relation edge — shown on both issues it connects
 * (`IssueRelations`), so removable from either side, not only the one that
 * originally created it: whoever can edit *either* end may take it down.
 */
export async function removeIssueRelation(
  relationId: string,
): Promise<ActionResult> {
  const relation = await db.issueRelation.findUnique({
    where: { id: relationId },
    include: {
      issue: {
        select: {
          projectId: true,
          reporterId: true,
          assigneeId: true,
          project: { select: { workspaceId: true } },
        },
      },
      related: {
        select: { projectId: true, reporterId: true, assigneeId: true },
      },
    },
  });
  if (!relation) return { error: "This relation no longer exists." };

  const actorId = await requirePermissionOr([
    {
      permission: "issue.update.any",
      ctx: { projectId: relation.issue.projectId },
    },
    {
      permission: "issue.update.own",
      ctx: { projectId: relation.issue.projectId },
      ownerIds: [relation.issue.reporterId, relation.issue.assigneeId],
    },
    {
      permission: "issue.update.any",
      ctx: { projectId: relation.related.projectId },
    },
    {
      permission: "issue.update.own",
      ctx: { projectId: relation.related.projectId },
      ownerIds: [relation.related.reporterId, relation.related.assigneeId],
    },
  ]);

  await db.issueRelation.delete({ where: { id: relationId } });
  await revalidate({ workspaceId: relation.issue.project.workspaceId });

  // Full ref-capable context for both ends — `relation.issue`/`.related`
  // above only carry what the permission check needed.
  const [fromCtx, toCtx] = await Promise.all([
    issueContext(relation.issueId),
    issueContext(relation.relatedId),
  ]);
  const [fromKind, toKind] = relationKinds(relation.type);
  const fromRef = issueRef(fromCtx);
  const toRef = issueRef(toCtx);
  await recordIssueAudit(
    "issue.relation.removed",
    relation.issueId,
    fromCtx,
    actorId,
    toRef,
    { kind: fromKind, ref: toRef } satisfies RelationChangeMeta,
  );
  await recordIssueAudit(
    "issue.relation.removed",
    relation.relatedId,
    toCtx,
    actorId,
    fromRef,
    { kind: toKind, ref: fromRef } satisfies RelationChangeMeta,
  );

  return { ok: true };
}
