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
  layoutKey,
  normalizeWidget,
  notePagesSchema,
  type Widget,
  widgetsSchema,
} from "@/features/dashboard/widgets";
import { RANGES, type RangeKey } from "@/lib/buckets";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { hasPermission } from "@/lib/permissions";
import { getSession } from "@/lib/session";

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
 * A note typed straight into the widget (outside edit mode). It lands where
 * the arrangement comes from: the caller's own layout if there is one, else
 * the shared default (with `dashboard.manage`), else a new own layout made
 * from what the caller sees (`current`). A view's note goes into the view.
 *
 * No revalidation: the page already shows the text, and a fresh render
 * would pull the field out from under the typing person.
 */
export async function saveDashboardNote(
  rawTarget: DashboardTarget,
  current: unknown,
  widgetId: string,
  rawPages: unknown,
): Promise<Result> {
  const session = await getSession();
  const target = targetSchema.safeParse(rawTarget);
  const shown = parseWidgetList(current);
  const pages = notePagesSchema.safeParse(rawPages);
  if (!session || !target.success || !shown || !pages.success) {
    return { error: NOT_ALLOWED };
  }
  const access = await dashboardAccess(target.data);
  if (!access) return { error: NOT_ALLOWED };

  const withPages = (list: Widget[]) =>
    list.map((w) =>
      w.id === widgetId && w.type === "note"
        ? { ...w, config: { ...w.config, pages: pages.data, text: undefined } }
        : w,
    );

  if (target.data.kind === "view") {
    if (!access.canEdit) return { error: NOT_ALLOWED };
    const row = await db.savedView.findUnique({
      where: { id: target.data.id },
      select: { display: true },
    });
    const display = (row?.display ?? {}) as Record<string, unknown>;
    const stored = parseWidgetList(display.widgets) ?? shown;
    await db.savedView.update({
      where: { id: target.data.id },
      data: {
        display: {
          ...display,
          widgets: withPages(stored),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return { ok: true };
  }

  const scope = { kind: target.data.kind, id: target.data.id };
  const personalKey = layoutKey(scope, session.userId);
  const sharedKey = layoutKey(scope, null);
  const rows = await db.dashboardLayout.findMany({
    where: { key: { in: [personalKey, sharedKey] } },
    select: { key: true, widgets: true },
  });
  const personal = rows.find((r) => r.key === personalKey);
  const shared = rows.find((r) => r.key === sharedKey);
  const own = personal && parseWidgetList(personal.widgets);
  const team = shared && parseWidgetList(shared.widgets);

  // The note lives where the widget does — own row first, then the shared
  // one if this person may change it.
  const key = own?.some((w) => w.id === widgetId)
    ? personalKey
    : team?.some((w) => w.id === widgetId) && access.canEditShared
      ? sharedKey
      : personalKey;
  const base = key === personalKey ? (own ?? shown) : (team ?? shown);
  const widgets = withPages(base) as unknown as Prisma.InputJsonValue;
  await db.dashboardLayout.upsert({
    where: { key },
    create: {
      key,
      workspaceId: access.workspaceId,
      projectId: target.data.kind === "project" ? target.data.id : null,
      userId: key === personalKey ? session.userId : null,
      widgets,
    },
    update: { widgets },
  });
  return { ok: true };
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
