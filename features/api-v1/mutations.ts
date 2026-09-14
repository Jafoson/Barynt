import "server-only";
import {
  type ApiComment,
  type ApiContentSource,
  type ApiIssue,
  type ApiIssueRelationKind,
  type ApiLabelDetail,
  type ApiProject,
  type ApiWorkspace,
  getCommentUnchecked,
  getIssueUnchecked,
} from "@/features/api-v1/queries";
import { richTextFromApiMarkdown } from "@/features/api-v1/richtext";
import type { ProjectVisibility } from "@/features/projects/types";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
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
import { slugify } from "@/lib/slug";
import { canCreateWorkspace, getSystemSettings } from "@/lib/system-settings";
import { uid } from "@/lib/utils/id";
import { fireWebhookEvent } from "@/lib/webhooks/deliver";
import {
  DEFAULT_ISSUE_TYPES,
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
  isClosedStatus,
} from "@/lib/workspace-defaults";

// Thin, `userId`-parameterized write helpers for the public API
// (`app/api/v1`) — deliberately NOT calls into `features/issues/actions.ts`.
// Those resolve the actor via `requirePermission()` → `currentUserId()` →
// the cookie session, with no parameter to inject a token-resolved identity
// through. This duplicates their minimal write logic instead, reusing the
// same shared helpers (`toPlainText`, `stripAttachmentAttrs`, `uid`,
// `isClosedStatus`) so the two paths can't drift on *how* a write happens,
// only on the plumbing around it. Known duplication, accepted for this MVP
// slice — revisit once real API usage patterns are clear. Audit logging
// (`recordIssueAudit` in actions.ts) stays out of scope for the same
// reason: it's private to that file. Mention *notifications* are the one
// exception — `notifyMentions()` below mirrors actions.ts's own helper of
// the same name closely enough (down to the diffing on update) that
// leaving it out would make an API-authored `@handle` a chip that quietly
// never tells the person it named.

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
  | { ok: false; status: 403 | 404 | 422 };

function fail(status: 403 | 404 | 422): { ok: false; status: 403 | 404 | 422 } {
  return { ok: false, status };
}

/** Same rule as `closedPatch()` in `features/issues/actions.ts`: setting a
 *  closed status stamps `closedAt` only if it isn't already stamped (Done →
 *  Canceled keeps the original date); leaving a closed status clears it. */
function closedPatch(
  before: { status: string; closedAt: Date | null },
  next: string | undefined,
): { closedAt?: Date | null } {
  if (next === undefined || next === before.status) return {};
  if (isClosedStatus(next))
    return before.closedAt ? {} : { closedAt: new Date() };
  return before.closedAt ? { closedAt: null } : {};
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
}

export async function createIssueForUser(
  userId: string,
  projectId: string,
  input: CreateIssueInput,
  /** Which of the two public-API surfaces made this call — never `APP`,
   *  the web app's own `createIssue()` (`features/issues/actions.ts`)
   *  doesn't go through here and leaves `Issue.source` at its `APP`
   *  default instead. */
  source: Exclude<ApiContentSource, "APP">,
): Promise<MutationResult<ApiIssue>> {
  if (!(await can(userId, "issue.create", { projectId }))) return fail(404);

  const title = input.title?.trim();
  if (!title) return fail(422);

  // Checked before `project.update` below claims a key — a rejected
  // `parentId` shouldn't burn one of the project's issue numbers.
  if (input.parentId) {
    const invalid = await validateParentId(userId, null, input.parentId);
    if (invalid) return fail(invalid);
  }

  const status = input.status ?? "backlog";

  const { lastIssueKey, workspaceId } = await db.project.update({
    where: { id: projectId },
    data: { lastIssueKey: { increment: 1 } },
    select: { lastIssueKey: true, workspaceId: true },
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
      ...(isClosedStatus(status) ? { closedAt: new Date() } : {}),
      priority: input.priority ?? 0,
      assigneeId: input.assignee ?? null,
      labels: input.labels ?? [],
      type: input.type ?? "feature",
      reporterId: userId,
      source,
      parentId: input.parentId ?? null,
    },
  });

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
}

export async function updateIssueForUser(
  userId: string,
  issueId: string,
  patch: UpdateIssueInput,
): Promise<MutationResult<{ id: string }>> {
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: {
      projectId: true,
      reporterId: true,
      assigneeId: true,
      status: true,
      closedAt: true,
      // Only read for the mention diff below (`mentionedUserIds`) — the
      // rest of this function never looks at the current description.
      description: true,
      project: { select: { workspaceId: true } },
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
      ...closedPatch(issue, patch.status),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.type !== undefined && { type: patch.type }),
      ...(patch.assignee !== undefined && { assigneeId: patch.assignee }),
      ...(patch.labels !== undefined && { labels: patch.labels }),
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.parentId !== undefined && { parentId: patch.parentId }),
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
  issueId: string,
  input: AddIssueRelationInput,
): Promise<MutationResult<{ id: string }>> {
  const relatedId = input.relatedId;
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
  return { ok: true, data: { id: relationId } };
}

export interface CreateCommentInput {
  body: string;
  parentId?: string;
}

export async function createCommentForUser(
  userId: string,
  issueId: string,
  input: CreateCommentInput,
  /** See `createIssueForUser`'s parameter of the same name. */
  source: Exclude<ApiContentSource, "APP">,
): Promise<MutationResult<ApiComment>> {
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: { projectId: true, project: { select: { workspaceId: true } } },
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
    select: { authorId: true, issue: { select: { projectId: true } } },
  });
  if (!comment) return fail(404);

  const ctx = { projectId: comment.issue.projectId };
  const isOwner = comment.authorId === userId;
  const allowed =
    (await can(userId, "comment.delete.any", ctx)) ||
    (isOwner && (await can(userId, "comment.delete.own", ctx)));
  if (!allowed) return fail(404);

  await db.comment.delete({ where: { id: commentId } });

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
