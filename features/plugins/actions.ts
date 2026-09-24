"use server";

import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { discoverPlugins, pluginsDirSetting } from "@/lib/plugins/discovery";
import { isIntegrityHash } from "@/lib/plugins/hashFormat";
import { verifyPluginIntegrity } from "@/lib/plugins/integrity";
import { pluginIdSchema, pluginVersionSchema } from "@/lib/plugins/manifest";
import { decideExecution } from "@/lib/plugins/policy";
import { invalidatePluginRegistry } from "@/lib/plugins/registryState";
import { getActiveStoreUrls } from "@/lib/plugins/stores";
import { getAllowUnsignedPlugins } from "@/lib/plugins/unsigned";

// Whether the code of a plugin may run in the app's process. Installing a plugin
// and letting its code run are two steps: code that runs there has the power of
// the whole app (docs/plugins/security.md), so the platform says yes to it
// explicitly, for one plugin and for the exact files it has, and never for a store
// as a whole. Only `plugin.manage` may, the server asks for the yes itself so the
// dialog cannot be skipped by calling the action directly, and every change is
// audited.
//
// What is approved is a hash, `Plugin.integrity`, the hash of the plugin directory
// recorded at install. An update brings another hash, and the old approval no
// longer fits (the policy says `approval-outdated`), so a new version is never
// approved by the one before it. The action approves the hash the admin was shown
// and refuses if the plugin has changed since.
//
// What it refuses to approve is whatever the policy would not run anyway: a plugin
// without code, one from a store that is not on, one from no store (its code does
// not run in the process at all, whatever is approved). An approval that could
// never take effect would only look like a promise.

export type PluginApprovalResult = { ok: true } | { error: string };

const NOT_ACKNOWLEDGED =
  "Confirm that you understand what this does: after this the plugin's code runs with the full power of the app, it can read the data of every workspace and act as any user, and nothing stops it.";

const CHANGED =
  "The plugin has changed since you looked at it. Look at it again before approving.";

const UNKNOWN = "Unknown plugin.";

/**
 * Approves the code of a plugin to run in the app's process, for the hash `hash`.
 *
 * `hash` is the one the admin was shown; if the plugin's recorded hash is another
 * one by now, nothing is approved.
 */
export async function approvePluginCode(
  pluginId: string,
  input: { hash: string; acknowledged: boolean },
): Promise<PluginApprovalResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);

  if (input?.acknowledged !== true) return { error: NOT_ACKNOWLEDGED };
  if (typeof pluginId !== "string" || !isIntegrityHash(input.hash)) {
    return { error: "Invalid request." };
  }

  const plugin = await db.plugin.findUnique({
    where: { id: pluginId },
    select: {
      id: true,
      version: true,
      source: true,
      origin: true,
      integrity: true,
      codeApprovalHash: true,
    },
  });
  if (!plugin) return { error: UNKNOWN };
  if (plugin.integrity !== input.hash) return { error: CHANGED };
  if (plugin.codeApprovalHash === plugin.integrity) return { ok: true };

  // The id and the version become a path, so they have to be what a plugin's are,
  // whatever the row says.
  if (
    !pluginIdSchema.safeParse(plugin.id).success ||
    !pluginVersionSchema.safeParse(plugin.version).success
  ) {
    return { error: "The plugin's id or version is not valid." };
  }
  const setting = pluginsDirSetting();
  if (setting.dir === null) {
    return { error: "Plugins have no directory to read from." };
  }

  // What lies on disk has to be what the hash says, before anything is read from it.
  const refusal = await verifyPluginIntegrity(
    join(setting.dir, plugin.id, plugin.version),
    plugin.integrity,
  );
  if (refusal) return { error: `Not approved: ${refusal}.` };

  const found = (await discoverPlugins(setting.dir)).plugins.find(
    (p) => p.id === plugin.id && p.version === plugin.version,
  );
  if (!found?.ok) {
    return { error: "The plugin's manifest could not be read." };
  }

  // What the policy would say if the approval were there.
  const decision = decideExecution(
    {
      manifest: found.manifest,
      source: plugin.source,
      origin: plugin.origin,
      integrity: plugin.integrity,
      codeApprovalHash: plugin.integrity,
    },
    await getActiveStoreUrls(),
    { allowUnsigned: await getAllowUnsignedPlugins() },
  );
  if (decision.mode === "declarative") {
    return {
      error: "This plugin has no code, so there is nothing to approve.",
    };
  }
  if (decision.mode === "blocked") {
    switch (decision.reason) {
      case "store-not-active":
        return {
          error:
            "The store this plugin came from is not switched on, so its code cannot run.",
        };
      case "unsigned-not-allowed":
      case "unsigned-code":
        return {
          error:
            "A plugin from no store cannot run code in the app's process, whatever is approved.",
        };
      default:
        return { error: "The plugin could not be checked." };
    }
  }

  // The hash is part of the condition: if an update replaced the plugin in the
  // meantime, nothing is written.
  const written = await db.plugin.updateMany({
    where: { id: plugin.id, integrity: input.hash },
    data: { codeApprovalHash: input.hash, codeApprovedAt: new Date() },
  });
  if (written.count !== 1) return { error: CHANGED };

  await recordAudit({
    action: "plugin.code.approved",
    actorId,
    target: {
      type: "plugin",
      id: plugin.id,
      label: `${plugin.id}@${plugin.version}`,
    },
    meta: { version: plugin.version, hash: input.hash },
  });

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Withdraws the approval. From the next request the plugin's code is no longer
 * handed out; what it already started keeps running until the process restarts
 * (docs/plugins/loading.md).
 */
export async function revokePluginCodeApproval(
  pluginId: string,
): Promise<PluginApprovalResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);
  if (typeof pluginId !== "string") return { error: "Invalid request." };

  const plugin = await db.plugin.findUnique({
    where: { id: pluginId },
    select: { id: true, version: true, codeApprovalHash: true },
  });
  if (!plugin) return { error: UNKNOWN };
  if (plugin.codeApprovalHash === null) return { ok: true };

  await db.plugin.update({
    where: { id: plugin.id },
    data: { codeApprovalHash: null, codeApprovedAt: null },
  });

  await recordAudit({
    action: "plugin.code.revoked",
    actorId,
    target: {
      type: "plugin",
      id: plugin.id,
      label: `${plugin.id}@${plugin.version}`,
    },
    meta: { version: plugin.version, hash: plugin.codeApprovalHash },
  });

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}
