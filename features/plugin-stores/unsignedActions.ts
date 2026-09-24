"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { invalidatePluginRegistry } from "@/lib/plugins/registryState";
import type { PluginStoreResult } from "./actions";

// Whether plugins from no store are allowed. Only `plugin.manage` may change it,
// because it decides which code the platform takes in at all, and every change is
// audited. Switching it on needs the caller to say they understand the risk: the
// dialog asks, and the server refuses without the answer, so the warning cannot
// be skipped by calling the action directly. Switching it off needs nothing, it
// only narrows.
//
// The same answer is asked for again each time a plugin is installed from an
// address entered by hand. That installer does not exist yet (BARY-60, BARY-111);
// when it does, it has to refuse without it in the same way, and switching the
// setting on once is never enough.

const NOT_ACKNOWLEDGED =
  "Confirm that you understand the risk: plugins from no store have not been reviewed or tested, and you use them at your own risk.";

/**
 * Allows or forbids plugins from no store. Only the value `true` allows them,
 * and only with `acknowledged === true`.
 */
export async function setAllowUnsignedPlugins(
  allow: boolean,
  acknowledged = false,
): Promise<PluginStoreResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);

  if (typeof allow !== "boolean") return { error: "Invalid value." };
  if (allow && acknowledged !== true) return { error: NOT_ACKNOWLEDGED };

  const row = await db.systemSettings.findUnique({
    where: { id: 1 },
    select: { allowUnsignedPlugins: true },
  });
  if ((row?.allowUnsignedPlugins === true) === allow) return { ok: true };

  await db.systemSettings.upsert({
    where: { id: 1 },
    update: { allowUnsignedPlugins: allow },
    create: { id: 1, allowUnsignedPlugins: allow },
  });

  await recordAudit({
    action: allow ? "plugin.unsigned.allowed" : "plugin.unsigned.disallowed",
    actorId,
    target: {
      type: "systemSettings",
      id: "1",
      // The action says what happened; the label says what it is about.
      label: "Plugin settings",
    },
  });

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}
