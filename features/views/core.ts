import "server-only";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { slugify } from "@/lib/slug";
import { uid } from "@/lib/utils/id";
import { fireWebhookEvent } from "@/lib/webhooks/deliver";
import {
  canChangeVisibility,
  canCreateView,
  canEditView,
  canSeeView,
} from "./access";
import { mapView, viewAccessFacts } from "./queries";
import {
  type CreateViewInput,
  createViewSchema,
  type SavedView,
  type UpdateViewInput,
  updateViewSchema,
} from "./schema";

/**
 * Creating, changing and deleting saved views for a given user — the rules
 * the app's server actions (`actions.ts`) and the public API
 * (`features/api-v1`, BARY-172) share. No session and no revalidation
 * here: the callers bring the user and refresh what they show.
 *
 * Like the label management, these don't throw but report why something
 * didn't happen. A view the caller may not see answers `notFound`, never
 * `forbidden`, so nobody learns that someone else's private view exists.
 */
export type ViewResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: "unauthenticated" | "invalid" | "notFound" | "forbidden";
    };

export const fail = (
  error: "unauthenticated" | "invalid" | "notFound" | "forbidden",
) => ({ ok: false, error }) as const;

/** What a webhook hears about a shared view — the stored fields, no
 *  per-viewer state. */
function viewPayload(row: {
  id: string;
  name: string;
  slug: string;
  workspaceId: string;
  projectId: string | null;
  ownerId: string | null;
  visibility: string;
  layout: string;
  filter: unknown;
  groupBy: string | null;
  sortBy: string;
  sortDir: string;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    ownerId: row.ownerId,
    visibility: row.visibility,
    layout: row.layout,
    filter: row.filter,
    groupBy: row.groupBy,
    sortBy: row.sortBy,
    sortDir: row.sortDir,
    updatedAt: row.updatedAt,
  };
}

export const include = (userId: string) => ({
  userStates: { where: { userId } },
});

/** A slug from the name that's still free in the workspace: `bugs`,
 *  `bugs-2`, … Same scheme as label slugs. */
export async function uniqueViewSlug(workspaceId: string, name: string) {
  const base = slugify(name) || "view";
  let slug = base;
  let n = 1;
  while (
    await db.savedView.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    })
  ) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

/** After the last tab of its scope. */
export async function nextPosition(
  workspaceId: string,
  projectId: string | null,
) {
  const last = await db.savedView.aggregate({
    where: { workspaceId, projectId },
    _max: { position: true },
  });
  return (last._max.position ?? 0) + 1;
}

export async function loadView(id: string, userId: string) {
  const row = await db.savedView.findUnique({
    where: { id },
    include: include(userId),
  });
  if (!row) return null;
  const facts = await viewAccessFacts(userId, {
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  return { row, facts };
}

export async function createViewFor(
  userId: string,
  input: CreateViewInput,
): Promise<ViewResult<SavedView>> {
  const parsed = createViewSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const data = parsed.data;

  // The workspace comes from the project, not from the call — same as for
  // project labels: a foreign `workspaceId` can't place a view elsewhere.
  let workspaceId = data.workspaceId;
  if (data.projectId) {
    const project = await db.project.findUnique({
      where: { id: data.projectId },
      select: { workspaceId: true },
    });
    if (!project) return fail("notFound");
    workspaceId = project.workspaceId;
  }

  const scope = { workspaceId, projectId: data.projectId };
  const facts = await viewAccessFacts(userId, scope);
  if (!facts.canSeeScope) return fail("notFound");
  if (!canCreateView(data.visibility, data.projectId, facts))
    return fail("forbidden");

  const row = await db.savedView.create({
    data: {
      id: uid("v"),
      workspaceId,
      projectId: data.projectId,
      ownerId: userId,
      visibility: data.visibility,
      name: data.name,
      slug: await uniqueViewSlug(workspaceId, data.name),
      icon: data.icon ?? null,
      color: data.color ?? null,
      position: await nextPosition(workspaceId, data.projectId),
      layout: data.layout,
      filter: (data.filter ?? {
        op: "and",
        rules: [],
      }) as Prisma.InputJsonValue,
      groupBy: data.groupBy ?? null,
      subGroupBy: data.subGroupBy ?? null,
      sortBy: data.sortBy ?? "manual",
      sortDir: data.sortDir ?? "asc",
      display: (data.display ?? {}) as Prisma.InputJsonValue,
    },
    include: include(userId),
  });

  if (row.visibility !== "PRIVATE") {
    fireWebhookEvent(workspaceId, "view.created", viewPayload(row));
  }
  return { ok: true, data: mapView(row, facts) };
}

export async function updateViewFor(
  userId: string,
  id: string,
  input: UpdateViewInput,
): Promise<ViewResult<SavedView>> {
  const parsed = updateViewSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const patch = parsed.data;

  const loaded = await loadView(id, userId);
  if (!loaded || !canSeeView(loaded.row, loaded.facts)) return fail("notFound");
  const { row, facts } = loaded;
  if (!canEditView(row, facts)) return fail("forbidden");
  if (
    patch.visibility !== undefined &&
    !canChangeVisibility(row, patch.visibility, facts)
  )
    return fail("forbidden");

  const updated = await db.savedView.update({
    where: { id },
    data: {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.icon !== undefined && { icon: patch.icon }),
      ...(patch.color !== undefined && { color: patch.color }),
      ...(patch.visibility !== undefined && { visibility: patch.visibility }),
      ...(patch.layout !== undefined && { layout: patch.layout }),
      ...(patch.filter !== undefined && {
        filter: patch.filter as Prisma.InputJsonValue,
      }),
      ...(patch.groupBy !== undefined && { groupBy: patch.groupBy }),
      ...(patch.subGroupBy !== undefined && { subGroupBy: patch.subGroupBy }),
      ...(patch.sortBy !== undefined && { sortBy: patch.sortBy }),
      ...(patch.sortDir !== undefined && { sortDir: patch.sortDir }),
      ...(patch.display !== undefined && {
        display: patch.display as Prisma.InputJsonValue,
      }),
    },
    include: include(userId),
  });

  // Shared before or after: a view that just went private is news too —
  // the payload's `visibility` says so.
  if (row.visibility !== "PRIVATE" || updated.visibility !== "PRIVATE") {
    fireWebhookEvent(row.workspaceId, "view.updated", viewPayload(updated));
  }
  return { ok: true, data: mapView(updated, facts) };
}

/**
 * Deletes a view. Deleting a shared one is logged — it disappears for
 * everyone, and the log is where "who removed our triage view?" gets
 * answered. A private view goes without a trace, like any personal setting.
 */
export async function deleteViewFor(
  userId: string,
  id: string,
): Promise<ViewResult<null>> {
  const loaded = await loadView(id, userId);
  if (!loaded || !canSeeView(loaded.row, loaded.facts)) return fail("notFound");
  const { row, facts } = loaded;
  if (!canEditView(row, facts)) return fail("forbidden");

  await db.savedView.delete({ where: { id } });
  if (row.visibility !== "PRIVATE") {
    fireWebhookEvent(row.workspaceId, "view.deleted", {
      id: row.id,
      name: row.name,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
    });
  }

  if (row.visibility !== "PRIVATE") {
    await recordAudit({
      action: "view.deleted",
      actorId: userId,
      target: { type: "view", id: row.id, label: row.name },
      workspaceId: row.workspaceId,
      projectId: row.projectId,
    });
  }

  return { ok: true, data: null };
}
