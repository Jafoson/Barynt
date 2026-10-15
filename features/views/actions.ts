"use server";

import { revalidatePath } from "next/cache";
import { isGroupKey } from "@/features/issues/group";
import { resolveUrlFilter } from "@/features/issues/queries";
import { isSortKey } from "@/features/issues/sort";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { currentUserId } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import { uid } from "@/lib/utils/id";
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
  type ViewUserStateInput,
  viewUserStateSchema,
} from "./schema";
import { displayFromParams, layoutFromParam, pickViewState } from "./url";

/**
 * Saved views (BARY-163). Like the label management, these don't throw but
 * report why something didn't happen — they're called from the tab bar and
 * its dialogs (V4), which show the reason instead of hitting an error
 * boundary. A view the caller may not see answers `notFound`, never
 * `forbidden`, so nobody learns that someone else's private view exists.
 */
export type ViewResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: "unauthenticated" | "invalid" | "notFound" | "forbidden";
    };

const fail = (
  error: "unauthenticated" | "invalid" | "notFound" | "forbidden",
) => ({ ok: false, error }) as const;

const include = (userId: string) => ({ userStates: { where: { userId } } });

/** A slug from the name that's still free in the workspace: `bugs`,
 *  `bugs-2`, … Same scheme as label slugs. */
async function uniqueViewSlug(workspaceId: string, name: string) {
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
async function nextPosition(workspaceId: string, projectId: string | null) {
  const last = await db.savedView.aggregate({
    where: { workspaceId, projectId },
    _max: { position: true },
  });
  return (last._max.position ?? 0) + 1;
}

async function loadView(id: string, userId: string) {
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

export async function createView(
  input: CreateViewInput,
): Promise<ViewResult<SavedView>> {
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
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

  revalidatePath("/", "layout");
  return { ok: true, data: mapView(row, facts) };
}

export async function updateView(
  id: string,
  input: UpdateViewInput,
): Promise<ViewResult<SavedView>> {
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
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

  revalidatePath("/", "layout");
  return { ok: true, data: mapView(updated, facts) };
}

/**
 * A private copy for the caller, at the end of its scope's tabs. `name`
 * comes from the UI, which knows the language ("… (copy)").
 *
 * For "save as new view" with unsaved changes the UI calls `createView`
 * with the current state instead — this copies what's stored.
 */
export async function duplicateView(
  id: string,
  name: string,
): Promise<ViewResult<SavedView>> {
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
  const loaded = await loadView(id, userId);
  if (!loaded || !canSeeView(loaded.row, loaded.facts)) return fail("notFound");
  const { row } = loaded;

  const copyName = name.trim().slice(0, 80);
  if (!copyName) return fail("invalid");

  const copy = await db.savedView.create({
    data: {
      id: uid("v"),
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      ownerId: userId,
      visibility: "PRIVATE",
      name: copyName,
      slug: await uniqueViewSlug(row.workspaceId, copyName),
      icon: row.icon,
      color: row.color,
      position: await nextPosition(row.workspaceId, row.projectId),
      layout: row.layout,
      filter: row.filter as Prisma.InputJsonValue,
      groupBy: row.groupBy,
      subGroupBy: row.subGroupBy,
      sortBy: row.sortBy,
      sortDir: row.sortDir,
      display: row.display as Prisma.InputJsonValue,
    },
    include: include(userId),
  });

  revalidatePath("/", "layout");
  return { ok: true, data: mapView(copy, loaded.facts) };
}

/**
 * Deletes a view. Deleting a shared one is logged — it disappears for
 * everyone, and the log is where "who removed our triage view?" gets
 * answered. A private view goes without a trace, like any personal setting.
 */
export async function deleteView(id: string): Promise<ViewResult<null>> {
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
  const loaded = await loadView(id, userId);
  if (!loaded || !canSeeView(loaded.row, loaded.facts)) return fail("notFound");
  const { row, facts } = loaded;
  if (!canEditView(row, facts)) return fail("forbidden");

  await db.savedView.delete({ where: { id } });

  if (row.visibility !== "PRIVATE") {
    await recordAudit({
      action: "view.deleted",
      actorId: userId,
      target: { type: "view", id: row.id, label: row.name },
      workspaceId: row.workspaceId,
      projectId: row.projectId,
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

/**
 * The tab order of one scope (a project, or the workspace's cross-project
 * views). `ids` is the new order; views the caller may not edit keep their
 * place, so dragging can't reorder a shared view for the whole team
 * without `view.share`/`view.manage`.
 */
export async function reorderViews(
  workspaceId: string,
  projectId: string | null,
  ids: string[],
): Promise<ViewResult<null>> {
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
  if (ids.length > 500 || new Set(ids).size !== ids.length)
    return fail("invalid");

  const facts = await viewAccessFacts(userId, { workspaceId, projectId });
  if (!facts.canSeeScope) return fail("notFound");

  const rows = await db.savedView.findMany({
    where: { id: { in: ids }, workspaceId, projectId },
    select: { id: true, visibility: true, ownerId: true },
  });
  const editable = new Set(
    rows.filter((r) => canEditView(r, facts)).map((r) => r.id),
  );

  await db.$transaction(
    ids.flatMap((viewId, index) =>
      editable.has(viewId)
        ? [
            db.savedView.update({
              where: { id: viewId },
              data: { position: index + 1 },
            }),
          ]
        : [],
    ),
  );

  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

/** The caller's own state at a view: pinned, favorite, collapsed groups.
 *  Allowed on every view they see — it changes nothing for anyone else. */
export async function setViewUserState(
  id: string,
  input: ViewUserStateInput,
): Promise<ViewResult<null>> {
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
  const parsed = viewUserStateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");

  const loaded = await loadView(id, userId);
  if (!loaded || !canSeeView(loaded.row, loaded.facts)) return fail("notFound");

  await db.savedViewUserState.upsert({
    where: { userId_viewId: { userId, viewId: id } },
    create: { userId, viewId: id, ...parsed.data },
    update: parsed.data,
  });

  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

// ─── From the address (BARY-164) ────────────────────────────────────────────

/**
 * The stored fields an address stands for: its filters resolved to ids (the
 * same lookup the board itself does), grouping, order, layout and display
 * settings (BARY-165). The search
 * text isn't part of a view and is ignored (`pickViewState`).
 */
async function stateFromParams(
  projectId: string,
  params: Record<string, string>,
) {
  const state = pickViewState(params);
  return {
    filter: await resolveUrlFilter(state, { projectId }),
    groupBy: state.group && isGroupKey(state.group) ? state.group : null,
    sortBy: state.sort && isSortKey(state.sort) ? state.sort : "manual",
    layout: layoutFromParam(state.layout),
    display: displayFromParams(state),
  } as const;
}

/** "Save": the view takes over what the address shows right now. */
export async function saveViewState(
  id: string,
  params: Record<string, string>,
): Promise<ViewResult<SavedView>> {
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
  const row = await db.savedView.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!row?.projectId) return fail("notFound");
  return updateView(id, await stateFromParams(row.projectId, params));
}

/**
 * "New view" from the topbar: name, color, icon, layout and visibility from
 * the dialog, filters/grouping/order from the address — or none of those,
 * when the person unticked "take over the current filters" (`params` then
 * carries nothing but the layout).
 */
export async function createViewFromParams(
  input: Omit<
    CreateViewInput,
    "filter" | "groupBy" | "subGroupBy" | "sortBy" | "sortDir" | "display"
  > & { projectId: string },
  params: Record<string, string>,
): Promise<ViewResult<SavedView>> {
  const userId = await currentUserId();
  if (!userId) return fail("unauthenticated");
  const state = await stateFromParams(input.projectId, params);
  return createView({
    ...input,
    filter: state.filter,
    groupBy: state.groupBy,
    sortBy: state.sortBy,
    display: state.display,
  });
}
