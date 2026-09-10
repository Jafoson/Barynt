"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";

type SystemSettingsResult = { ok: true } | { error: string };

/**
 * Turns workspace creation on or off, platform-wide.
 *
 * No "Save" button, same convention as `Switch` itself (see its doc
 * comment): the position takes effect the instant it's set, mirroring
 * `setWorkspaceSuspended` in `features/admin/actions.ts`.
 */
export async function setAllowWorkspaceCreation(
  allow: boolean,
): Promise<SystemSettingsResult> {
  const actorId = await requirePermission("system.settings.manage", PLATFORM);

  await db.systemSettings.upsert({
    where: { id: 1 },
    update: { allowWorkspaceCreation: allow },
    create: { id: 1, allowWorkspaceCreation: allow },
  });

  await recordAudit({
    action: "system.settings.updated",
    actorId,
    target: {
      type: "systemSettings",
      id: "1",
      label: allow
        ? "Workspace creation enabled"
        : "Workspace creation disabled",
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Sets the workspace that accounts without a membership fall back to once
 * creation is off (`lib/system-settings.ts`, `app/[locale]/page.tsx`).
 * `null` clears it. Rejects a suspended workspace — enrolling new accounts
 * into a tenant nobody there can currently reach would just move the
 * lockout instead of fixing it.
 */
export async function setDefaultWorkspace(
  workspaceId: string | null,
): Promise<SystemSettingsResult> {
  const actorId = await requirePermission("system.settings.manage", PLATFORM);

  let label = "None";
  if (workspaceId) {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, suspended: true },
    });
    if (!workspace) return { error: "Unknown workspace." };
    if (workspace.suspended) {
      return { error: "This workspace is suspended." };
    }
    label = workspace.name;
  }

  await db.systemSettings.upsert({
    where: { id: 1 },
    update: { defaultWorkspaceId: workspaceId },
    create: { id: 1, defaultWorkspaceId: workspaceId },
  });

  await recordAudit({
    action: "system.settings.updated",
    actorId,
    target: {
      type: "systemSettings",
      id: "1",
      label: `Default workspace: ${label}`,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
