"use server";

import { revalidatePath } from "next/cache";
import type { PluginActionResult } from "@/features/plugins/types";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { STORE_PLUGIN_ID } from "@/lib/plugins/store/format";
import {
  DEFAULT_STORE_VISIBILITY,
  type StoreVisibility,
} from "@/lib/plugins/storeVisibility";

// Who gets the plugin store, and which plugins they see there. Only `plugin.manage`
// may, because it decides what a workspace admin can bring in without asking, and
// every change is audited. Nothing here approves code: whatever is added from the
// store still needs the platform's approval for its exact files before it runs.

const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

/**
 * Sets where the store is shown (workspaces, projects) and whether only the plugins
 * the admin released are shown there. All three at once, so the page and the
 * database never disagree about a half-made change.
 */
export async function setPluginStoreVisibility(
  input: StoreVisibility,
): Promise<PluginActionResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);
  if (
    !isBoolean(input?.inWorkspaces) ||
    !isBoolean(input?.inProjects) ||
    !isBoolean(input?.curatedOnly)
  ) {
    return { error: "Invalid value." };
  }
  const next: StoreVisibility = {
    inWorkspaces: input.inWorkspaces,
    inProjects: input.inProjects,
    curatedOnly: input.curatedOnly,
  };

  const row = await db.systemSettings.findUnique({
    where: { id: 1 },
    select: {
      pluginStoreInWorkspaces: true,
      pluginStoreInProjects: true,
      pluginStoreCuratedOnly: true,
    },
  });
  const before: StoreVisibility = row
    ? {
        inWorkspaces: row.pluginStoreInWorkspaces,
        inProjects: row.pluginStoreInProjects,
        curatedOnly: row.pluginStoreCuratedOnly,
      }
    : { ...DEFAULT_STORE_VISIBILITY };
  if (
    before.inWorkspaces === next.inWorkspaces &&
    before.inProjects === next.inProjects &&
    before.curatedOnly === next.curatedOnly
  ) {
    return { ok: true };
  }

  const data = {
    pluginStoreInWorkspaces: next.inWorkspaces,
    pluginStoreInProjects: next.inProjects,
    pluginStoreCuratedOnly: next.curatedOnly,
  };
  await db.systemSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });

  await recordAudit({
    action: "plugin.store.visibility",
    actorId,
    target: { type: "systemSettings", id: "1", label: "Plugin settings" },
    meta: { from: { ...before }, to: { ...next } },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Releases a plugin of a store for workspaces and projects, or takes the release back.
 * It counts only while the store shows workspaces and projects the released ones alone
 * (`pluginStoreCuratedOnly`); it is kept when that is off, so switching it on again
 * finds the choice as it was.
 */
export async function setPluginCurated(
  storeId: string,
  pluginId: string,
  released: boolean,
): Promise<PluginActionResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);
  if (
    typeof storeId !== "string" ||
    storeId.length === 0 ||
    storeId.length > 100 ||
    typeof pluginId !== "string" ||
    !STORE_PLUGIN_ID.test(pluginId) ||
    !isBoolean(released)
  ) {
    return { error: "Invalid request." };
  }

  const store = await db.pluginStore.findUnique({
    where: { id: storeId },
    select: { id: true, name: true },
  });
  if (!store) return { error: "Unknown store." };

  let changed: boolean;
  if (released) {
    const made = await db.pluginStoreCurated.createMany({
      data: [{ storeId, pluginId }],
      skipDuplicates: true,
    });
    changed = made.count === 1;
  } else {
    const gone = await db.pluginStoreCurated.deleteMany({
      where: { storeId, pluginId },
    });
    changed = gone.count > 0;
  }
  if (!changed) return { ok: true };

  await recordAudit({
    action: released ? "plugin.store.curated" : "plugin.store.uncurated",
    actorId,
    target: {
      type: "pluginStore",
      id: store.id,
      label: `${pluginId} (${store.name})`,
    },
    meta: { pluginId },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
