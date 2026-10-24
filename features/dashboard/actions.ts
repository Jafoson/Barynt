"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { computeWidgets, dashboardAccess } from "@/features/dashboard/queries";
import {
  DASHBOARD_SCOPES,
  type DashboardScope,
} from "@/features/dashboard/scope";
import type {
  DashboardTarget,
  WidgetDataMap,
} from "@/features/dashboard/types";
import {
  BUILDER_TYPES,
  type CustomWidgetEntry,
  layoutKey,
  normalizeWidget,
  notePagesSchema,
  type Widget,
  widgetsSchema,
} from "@/features/dashboard/widgets";
import { RANGES, type RangeKey } from "@/lib/buckets";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { currentUserCanEnterWorkspace, hasPermission } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { randomId } from "@/lib/utils/id";

// The dashboard's server functions (BARY-169). Writes go to the caller's
// own row, to the shared default (admins) or into a dashboard view — every
// target is checked against what the caller may see and change
// (`dashboardAccess`), never trusted from the client.

type Result = { ok: true } | { error: string };

const NOT_ALLOWED = "You cannot change this dashboard.";

const targetSchema = z.object({
  kind: z.enum(["project", "workspace", "view"]),
  id: z.string().min(1).max(100),
});

function parseWidgetList(input: unknown): Widget[] | null {
  const parsed = widgetsSchema.safeParse(input);
  return parsed.success
    ? parsed.data.map((widget) => normalizeWidget(widget as Widget))
    : null;
}

/**
 * Save the widgets. `level`:
 * - `"personal"` — the caller's own layout of a project/workspace dashboard;
 * - `"shared"` — the default for everyone (`project.update`/`workspace.update`);
 * - for a view, either level writes into the view (whoever may edit it).
 */
export async function saveDashboardWidgets(
  rawTarget: DashboardTarget,
  rawWidgets: unknown,
  level: "personal" | "shared",
): Promise<Result> {
  const session = await getSession();
  const target = targetSchema.safeParse(rawTarget);
  const widgets = parseWidgetList(rawWidgets);
  if (!session || !target.success || !widgets) return { error: NOT_ALLOWED };

  const access = await dashboardAccess(target.data);
  if (!access) return { error: NOT_ALLOWED };

  if (target.data.kind === "view") {
    if (!access.canEdit) return { error: NOT_ALLOWED };
    const row = await db.savedView.findUnique({
      where: { id: target.data.id },
      select: { display: true },
    });
    if (!row) return { error: NOT_ALLOWED };
    await db.savedView.update({
      where: { id: target.data.id },
      data: {
        display: {
          ...((row.display as Record<string, unknown>) ?? {}),
          widgets,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } else {
    if (level === "shared" && !access.canEditShared) {
      return { error: NOT_ALLOWED };
    }
    const scope = { kind: target.data.kind, id: target.data.id };
    const userId = level === "personal" ? session.userId : null;
    const key = layoutKey(scope, userId);
    const data = {
      workspaceId: access.workspaceId,
      projectId: target.data.kind === "project" ? target.data.id : null,
      userId,
      widgets: widgets as unknown as Prisma.InputJsonValue,
    };
    await db.dashboardLayout.upsert({
      where: { key },
      create: { key, ...data },
      update: { widgets: data.widgets },
    });
    // A new default for everyone is what the admin now sees too — their
    // own row would otherwise keep hiding it.
    if (level === "shared") {
      await db.dashboardLayout.deleteMany({
        where: { key: layoutKey(scope, session.userId) },
      });
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Back to the level above: drop the caller's own layout (`personal`), or
 * the shared default so the built-in one applies again (`shared`, admins).
 */
export async function resetDashboardWidgets(
  rawTarget: DashboardTarget,
  level: "personal" | "shared",
): Promise<Result> {
  const session = await getSession();
  const target = targetSchema.safeParse(rawTarget);
  if (!session || !target.success || target.data.kind === "view") {
    return { error: NOT_ALLOWED };
  }
  const access = await dashboardAccess(target.data);
  if (!access) return { error: NOT_ALLOWED };
  if (level === "shared" && !access.canEditShared)
    return { error: NOT_ALLOWED };

  const scope = { kind: target.data.kind, id: target.data.id };
  await db.dashboardLayout.deleteMany({
    where: {
      key: layoutKey(scope, level === "personal" ? session.userId : null),
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * A note typed straight into the widget (outside edit mode). Always private:
 * one row per person, dashboard and widget — the widget may sit in a shared
 * arrangement, what someone writes in it is theirs alone.
 *
 * No revalidation: the page already shows the text, and a fresh render
 * would pull the field out from under the typing person.
 */
export async function saveDashboardNote(
  rawTarget: DashboardTarget,
  widgetId: string,
  rawPages: unknown,
): Promise<Result> {
  const session = await getSession();
  const target = targetSchema.safeParse(rawTarget);
  const pages = notePagesSchema.safeParse(rawPages);
  if (
    !session ||
    !target.success ||
    !pages.success ||
    typeof widgetId !== "string" ||
    widgetId.length === 0 ||
    widgetId.length > 40
  ) {
    return { error: NOT_ALLOWED };
  }
  // Only on a dashboard the person may see.
  if (!(await dashboardAccess(target.data))) return { error: NOT_ALLOWED };

  const where = `${target.data.kind}:${target.data.id}`;
  const key = `${where}:${widgetId}:${session.userId}`;
  const data = pages.data as unknown as Prisma.InputJsonValue;
  await db.dashboardNote.upsert({
    where: { key },
    create: {
      key,
      userId: session.userId,
      target: where,
      widgetId,
      pages: data,
    },
    update: { pages: data },
  });
  return { ok: true };
}

const customWidgetSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  workspaceId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(60),
  widget: z.unknown(),
  shared: z.boolean(),
});

/**
 * Create or change a custom widget (BARY-170). Only its builder may change
 * it; sharing makes it show in everyone's gallery in the workspace.
 */
export async function saveCustomWidget(
  input: unknown,
): Promise<{ ok: true; entry: CustomWidgetEntry } | { error: string }> {
  const session = await getSession();
  const parsed = customWidgetSchema.safeParse(input);
  if (!session || !parsed.success) return { error: NOT_ALLOWED };
  const { id, workspaceId, name, shared } = parsed.data;
  if (!(await currentUserCanEnterWorkspace(workspaceId))) {
    return { error: NOT_ALLOWED };
  }
  const widget = parseWidgetList([parsed.data.widget])?.[0];
  if (!widget || !(BUILDER_TYPES as readonly string[]).includes(widget.type)) {
    return { error: NOT_ALLOWED };
  }
  // Stored without the id a placement gets — every copy gets its own.
  const stored = {
    type: widget.type,
    size: widget.size,
    config: widget.config,
  };

  if (id) {
    const row = await db.customWidget.findUnique({
      where: { id },
      select: { userId: true, workspaceId: true },
    });
    if (
      !row ||
      row.userId !== session.userId ||
      row.workspaceId !== workspaceId
    ) {
      return { error: NOT_ALLOWED };
    }
    await db.customWidget.update({
      where: { id },
      data: {
        name,
        shared,
        widget: stored as unknown as Prisma.InputJsonValue,
      },
    });
  }
  const savedId = id ?? randomId();
  if (!id) {
    await db.customWidget.create({
      data: {
        id: savedId,
        workspaceId,
        userId: session.userId,
        name,
        shared,
        widget: stored as unknown as Prisma.InputJsonValue,
      },
    });
  }
  return {
    ok: true,
    entry: {
      id: savedId,
      name,
      shared,
      mine: true,
      widget: { ...widget, id: savedId },
    },
  };
}

/** Delete one's own custom widget. Placed copies stay. */
export async function deleteCustomWidget(id: string): Promise<Result> {
  const session = await getSession();
  if (!session || typeof id !== "string") return { error: NOT_ALLOWED };
  const { count } = await db.customWidget.deleteMany({
    where: { id, userId: session.userId },
  });
  return count ? { ok: true } : { error: NOT_ALLOWED };
}

/** Data for widgets that were just added or reconfigured in edit mode. */
export async function loadWidgetData(
  rawTarget: DashboardTarget,
  rawWidgets: unknown,
  range: string,
  scope: string,
): Promise<WidgetDataMap | null> {
  const target = targetSchema.safeParse(rawTarget);
  const widgets = parseWidgetList(rawWidgets);
  if (!target.success || !widgets) return null;
  if (!(RANGES as readonly string[]).includes(range)) return null;
  if (!(DASHBOARD_SCOPES as readonly string[]).includes(scope)) return null;
  return computeWidgets(
    target.data,
    widgets,
    range as RangeKey,
    scope as DashboardScope,
  );
}

/** Remember range or scope for the next visit (project/workspace only). */
export async function setDashboardPrefs(
  rawTarget: DashboardTarget,
  patch: { range?: string; scope?: string },
): Promise<Result> {
  const session = await getSession();
  const target = targetSchema.safeParse(rawTarget);
  if (!session || !target.success || target.data.kind === "view") {
    return { ok: true };
  }
  if (patch.range && !(RANGES as readonly string[]).includes(patch.range)) {
    return { error: `Unknown range: ${patch.range}` };
  }
  if (
    patch.scope &&
    !(DASHBOARD_SCOPES as readonly string[]).includes(patch.scope)
  ) {
    return { error: `Unknown scope: ${patch.scope}` };
  }
  const { kind, id } = target.data;
  if (!(await dashboardAccess(target.data))) return { error: NOT_ALLOWED };
  // "all" needs the permission — a direct call mustn't store a scope the
  // person wouldn't get on read anyway.
  if (
    patch.scope === "all" &&
    !(await hasPermission(
      "dashboard.view.all",
      kind === "project" ? { projectId: id } : { workspaceId: id },
    ))
  ) {
    return { error: NOT_ALLOWED };
  }
  const data = {
    ...(patch.range && { range: patch.range }),
    ...(patch.scope && { scope: patch.scope }),
  };
  if (kind === "project") {
    await db.dashboardPreference.upsert({
      where: { userId_projectId: { userId: session.userId, projectId: id } },
      create: { userId: session.userId, projectId: id, ...data },
      update: data,
    });
  } else {
    await db.workspaceDashboardPreference.upsert({
      where: {
        userId_workspaceId: { userId: session.userId, workspaceId: id },
      },
      create: { userId: session.userId, workspaceId: id, ...data },
      update: data,
    });
  }
  return { ok: true };
}
