"use server";

import { revalidatePath } from "next/cache";
import { gt } from "semver";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { pluginsDirSetting } from "@/lib/plugins/discovery";
import { runHook, uninstallHookContext } from "@/lib/plugins/hooks";
import { getPluginRegistry } from "@/lib/plugins/host";
import { HOST_INFO } from "@/lib/plugins/hostInfo";
import { pluginVersionSchema } from "@/lib/plugins/manifest";
import { invalidatePluginRegistry } from "@/lib/plugins/registryState";
import { previewInstall, previewUninstall } from "@/lib/plugins/resolve";
import { getAllowUnsignedPlugins } from "@/lib/plugins/unsigned";
import { BARYNT_VERSION } from "@/lib/version";
import {
  installedCandidates,
  readPluginDirectory,
  refuseChange,
  stagePlugin,
  toCandidate,
} from "./disk";
import { isNotFound, isPluginId, isUniqueViolation } from "./guards";
import { withdrawnByItsStore } from "./storeWithdrawn";
import type { PluginActionResult } from "./types";

// The platform's part of a plugin's life: install, update, uninstall, and the switch
// that turns a plugin off for the whole instance. Only `plugin.manage` may, each
// action asks for that itself (a layout protects no action), every change is audited,
// and every change tells the registry, so from the next request it decides again.
//
// Where the files come from. Nothing fetches a plugin yet (the store client is
// BARY-105, the transport BARY-111), so what these actions install is what already
// lies in the plugin directory, `<dir>/<id>/<version>/`. Such a plugin comes from no
// store, and the client is never asked where a plugin came from: the source is set
// here, or by the installer that put the files there and checked them. Otherwise an
// admin could pass anything off as a plugin from the official store.
//
// So installing or updating one is the case the platform allowed for at "Allow
// unsigned plugins", and it has the rule that goes with it: the setting has to be
// on, and the server asks for the risk to be acknowledged **each time**, not once
// for the setting. Nothing of the plugin runs because of this: its code needs its own
// approval for its exact hash (`features/plugins/actions.ts`).
//
// What is not here, on purpose. No `onInstall` or `onUpdate` hook: the code of a new
// or updated plugin is not approved when it is installed, so it must not run then.
// No "delete the data" on uninstall until there is storage for a plugin to have data
// in (BARY-85). Uninstalling does not delete the plugin's files: they are the admin's,
// and nothing that put them there exists yet to clean up after itself.

const UNSIGNED_OFF =
  "Plugins from no store are not allowed. Switch that on first, under Admin, Plugin stores.";

const UNSIGNED_NOT_ACKNOWLEDGED =
  "Confirm that you understand the risk: this plugin comes from no store, nobody has reviewed or tested it, and you use it at your own risk.";

/**
 * The rule for a plugin that comes from no store: the platform has allowed such
 * plugins, and the risk is acknowledged for this one, now. `null` if both hold.
 */
async function unsignedRefusal(acknowledged: unknown): Promise<string | null> {
  if (!(await getAllowUnsignedPlugins())) return UNSIGNED_OFF;
  if (acknowledged !== true) return UNSIGNED_NOT_ACKNOWLEDGED;
  return null;
}

const validVersion = (version: unknown): boolean =>
  pluginVersionSchema.safeParse(version).success;

/**
 * Installs the plugin `id` in `version` that lies in the plugin directory. It
 * becomes an installed plugin, switched on for the platform; a workspace plugin still
 * applies nowhere until a workspace switches it on, and nothing of its code runs
 * until it is approved.
 */
export async function installPlugin(
  pluginId: string,
  version: string,
  input?: { acknowledged?: boolean },
): Promise<PluginActionResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);
  if (!isPluginId(pluginId) || !validVersion(version)) {
    return { error: "Invalid request." };
  }

  const existing = await db.plugin.findUnique({
    where: { id: pluginId },
    select: { version: true },
  });
  if (existing) {
    return {
      error: `${pluginId} is installed already (${existing.version}). Update it instead.`,
    };
  }

  const refusal = await unsignedRefusal(input?.acknowledged);
  if (refusal) return { error: refusal };

  const directory = await readPluginDirectory();
  if (!directory.ok) return { error: directory.error };
  const staged = await stagePlugin(directory.plugins, pluginId, version);
  if (!staged.ok) return { error: staged.error };

  const rows = await db.plugin.findMany({
    select: { id: true, version: true, scope: true },
  });
  const scope = staged.manifest.scope === "platform" ? "PLATFORM" : "WORKSPACE";
  const notDone = refuseChange(
    previewInstall(
      installedCandidates(rows, directory.plugins),
      toCandidate(staged.manifest, scope),
      BARYNT_VERSION,
    ),
  );
  if (notDone) return { error: notDone };

  try {
    await db.plugin.create({
      data: {
        id: pluginId,
        version,
        status: "ENABLED",
        source: "DIRECTORY",
        scope,
        origin: null,
        integrity: staged.integrity,
      },
    });
  } catch (error) {
    // Two admins installing the same plugin at the same moment.
    if (isUniqueViolation(error)) {
      return { error: `${pluginId} is installed already. Update it instead.` };
    }
    throw error;
  }

  await recordAudit({
    action: "plugin.installed",
    actorId,
    target: { type: "plugin", id: pluginId, label: `${pluginId}@${version}` },
    meta: { version, source: "DIRECTORY", scope, hash: staged.integrity },
  });

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Updates an installed plugin to a newer version that lies in the plugin directory.
 * The old version's files stay where they are, one directory per version. The plugin
 * keeps where it applies and which workspaces switched it on. A code approval does
 * **not** carry over: it was for the exact files of the old version, so the update
 * withdraws it, and the new version has to be approved on its own.
 */
export async function updatePlugin(
  pluginId: string,
  version: string,
  input?: { acknowledged?: boolean },
): Promise<PluginActionResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);
  if (!isPluginId(pluginId) || !validVersion(version)) {
    return { error: "Invalid request." };
  }

  const row = await db.plugin.findUnique({
    where: { id: pluginId },
    select: {
      id: true,
      version: true,
      source: true,
      scope: true,
      integrity: true,
      codeApprovalHash: true,
    },
  });
  if (!row) return { error: "Unknown plugin." };
  if (row.source !== "DIRECTORY") {
    return {
      error:
        "This plugin did not come from the plugin directory, so it is updated where it came from.",
    };
  }
  if (!gt(version, row.version)) {
    return {
      error: `An update goes to a newer version than the installed ${row.version}.`,
    };
  }

  const refusal = await unsignedRefusal(input?.acknowledged);
  if (refusal) return { error: refusal };

  const directory = await readPluginDirectory();
  if (!directory.ok) return { error: directory.error };
  const staged = await stagePlugin(directory.plugins, pluginId, version);
  if (!staged.ok) return { error: staged.error };

  if ((staged.manifest.scope === "platform") !== (row.scope === "PLATFORM")) {
    return {
      error:
        "An update cannot change where the plugin applies, to the whole platform or per workspace.",
    };
  }

  const rows = await db.plugin.findMany({
    select: { id: true, version: true, scope: true },
  });
  const notDone = refuseChange(
    previewInstall(
      installedCandidates(rows, directory.plugins),
      toCandidate(staged.manifest, row.scope),
      BARYNT_VERSION,
    ),
  );
  if (notDone) return { error: notDone };

  // Tied to what was read: if another update got there first, nothing is written.
  const written = await db.plugin.updateMany({
    where: { id: pluginId, version: row.version, integrity: row.integrity },
    data: {
      version,
      integrity: staged.integrity,
      // What was installed before stays on disk, and this is how to get back to it.
      previousVersion: row.version,
      previousIntegrity: row.integrity,
      codeApprovalHash: null,
      codeApprovedAt: null,
    },
  });
  if (written.count !== 1) {
    return { error: "The plugin changed while it was being updated." };
  }

  await recordAudit({
    action: "plugin.updated",
    actorId,
    target: { type: "plugin", id: pluginId, label: `${pluginId}@${version}` },
    meta: {
      from: row.version,
      to: version,
      hash: staged.integrity,
      approvalWithdrawn: row.codeApprovalHash !== null,
    },
  });

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Goes back to the version that was installed before the last update (or the last rollback,
 * which makes it a way forward again). Its files were never removed; what says they are still
 * the ones that were replaced is the hash of their directory, kept on the row. The code
 * approval does **not** come back: it was for other files, so what runs again has to be approved
 * again. A plugin that comes from no store needs the same setting and yes as an update does.
 */
export async function rollbackPlugin(
  pluginId: string,
  input?: { acknowledged?: boolean },
): Promise<PluginActionResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);
  if (!isPluginId(pluginId)) return { error: "Invalid request." };

  const row = await db.plugin.findUnique({
    where: { id: pluginId },
    select: {
      id: true,
      version: true,
      source: true,
      origin: true,
      scope: true,
      integrity: true,
      codeApprovalHash: true,
      previousVersion: true,
      previousIntegrity: true,
    },
  });
  if (!row) return { error: "Unknown plugin." };
  // Both are set together; without either there is nothing that can be verified to go back to.
  if (!row.previousVersion || !row.previousIntegrity) {
    return { error: "There is no earlier version to go back to." };
  }

  if (row.source !== "STORE") {
    const refusal = await unsignedRefusal(input?.acknowledged);
    if (refusal) return { error: refusal };
  }

  const directory = await readPluginDirectory();
  if (!directory.ok) return { error: directory.error };
  // The directory was read, so it is set.
  const { dir } = pluginsDirSetting();
  if (row.source === "STORE" && dir !== null) {
    const withdrawn = await withdrawnByItsStore({
      dir,
      origin: row.origin,
      pluginId,
      version: row.previousVersion,
    });
    if (withdrawn) return { error: withdrawn };
  }
  const staged = await stagePlugin(
    directory.plugins,
    pluginId,
    row.previousVersion,
  );
  if (!staged.ok) return { error: staged.error };
  if (staged.integrity !== row.previousIntegrity) {
    return {
      error: `The files of ${row.previousVersion} are not the ones that were replaced, so it is not brought back.`,
    };
  }
  if ((staged.manifest.scope === "platform") !== (row.scope === "PLATFORM")) {
    return {
      error:
        "An earlier version cannot change where the plugin applies, to the whole platform or per workspace.",
    };
  }

  const rows = await db.plugin.findMany({
    select: { id: true, version: true, scope: true },
  });
  const notDone = refuseChange(
    previewInstall(
      installedCandidates(rows, directory.plugins),
      toCandidate(staged.manifest, row.scope),
      BARYNT_VERSION,
    ),
  );
  if (notDone) return { error: notDone };

  // Tied to what was read, like an update. The two swap places, so it can be undone.
  const written = await db.plugin.updateMany({
    where: { id: pluginId, version: row.version, integrity: row.integrity },
    data: {
      version: row.previousVersion,
      integrity: row.previousIntegrity,
      previousVersion: row.version,
      previousIntegrity: row.integrity,
      codeApprovalHash: null,
      codeApprovedAt: null,
    },
  });
  if (written.count !== 1) {
    return { error: "The plugin changed while it was being rolled back." };
  }

  await recordAudit({
    action: "plugin.rolledBack",
    actorId,
    target: {
      type: "plugin",
      id: pluginId,
      label: `${pluginId}@${row.previousVersion}`,
    },
    meta: {
      from: row.version,
      to: row.previousVersion,
      hash: row.previousIntegrity,
      approvalWithdrawn: row.codeApprovalHash !== null,
    },
  });

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Removes an installed plugin, and with it the workspaces' settings for it. Refused
 * while another installed plugin needs it. The plugin's files stay in the directory.
 * If the plugin is running, its `onUninstall` runs after the removal and cannot undo it.
 */
export async function uninstallPlugin(
  pluginId: string,
): Promise<PluginActionResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);
  if (!isPluginId(pluginId)) return { error: "Invalid request." };

  const row = await db.plugin.findUnique({
    where: { id: pluginId },
    select: { id: true, version: true, source: true, integrity: true },
  });
  if (!row) return { error: "Unknown plugin." };

  // What needs it is known from the manifests on disk. If the directory cannot be
  // read, nothing is known to need it, and a plugin whose files are gone can still
  // be uninstalled: it could not load anyway.
  const directory = await readPluginDirectory();
  const rows = await db.plugin.findMany({
    select: { id: true, version: true, scope: true },
  });
  const dependents = previewUninstall(
    installedCandidates(rows, directory.ok ? directory.plugins : []),
    pluginId,
    BARYNT_VERSION,
  );
  if (dependents.length > 0) {
    return {
      error: `Not done. ${dependents.join(", ")} need${dependents.length === 1 ? "s" : ""} it. Uninstall ${dependents.length === 1 ? "that one" : "those"} first.`,
    };
  }

  const workspaces = await db.pluginWorkspace.count({
    where: { pluginId, enabled: true },
  });
  // The plugin as it runs now, taken before it is removed: its hook is still to run.
  const running = (await getPluginRegistry().get()).active.find(
    (p) => p.id === pluginId,
  );
  try {
    await db.plugin.delete({ where: { id: pluginId } });
  } catch (error) {
    // Gone already, another admin was faster.
    if (isNotFound(error)) {
      return { error: "Unknown plugin." };
    }
    throw error;
  }

  // From here the plugin is gone, and nothing hands it out. Its hook runs after, on
  // the code that is still in memory: what is uninstalled must not depend on plugin
  // code, so a hook that fails or hangs is a warning, not a reason to keep it.
  invalidatePluginRegistry();
  const outcome = await runHook(
    running,
    "onUninstall",
    uninstallHookContext({ id: pluginId, version: row.version }, HOST_INFO),
  );

  await recordAudit({
    action: "plugin.uninstalled",
    actorId,
    target: {
      type: "plugin",
      id: pluginId,
      label: `${pluginId}@${row.version}`,
    },
    meta: {
      version: row.version,
      source: row.source,
      hash: row.integrity,
      workspacesThatHadItOn: workspaces,
      hook: !outcome.ran ? "none" : outcome.ok ? "ran" : "failed",
      ...(outcome.ran && !outcome.ok ? { hookError: outcome.message } : {}),
    },
  });

  revalidatePath("/", "layout");
  return outcome.ran && !outcome.ok
    ? {
        ok: true,
        warning: `${pluginId} is uninstalled, but its onUninstall failed: ${outcome.message}`,
      }
    : { ok: true };
}

/**
 * Switches a plugin on or off for the whole platform. Off, it is not loaded and not
 * handed out, without being uninstalled; what workspaces set for it stays.
 */
export async function setPluginStatus(
  pluginId: string,
  enabled: boolean,
): Promise<PluginActionResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);
  if (!isPluginId(pluginId) || typeof enabled !== "boolean") {
    return { error: "Invalid request." };
  }

  const row = await db.plugin.findUnique({
    where: { id: pluginId },
    select: { id: true, version: true, status: true },
  });
  if (!row) return { error: "Unknown plugin." };
  if ((row.status === "ENABLED") === enabled) return { ok: true };

  await db.plugin.update({
    where: { id: pluginId },
    data: { status: enabled ? "ENABLED" : "DISABLED" },
  });

  await recordAudit({
    action: enabled ? "plugin.status.enabled" : "plugin.status.disabled",
    actorId,
    target: {
      type: "plugin",
      id: pluginId,
      label: `${pluginId}@${row.version}`,
    },
    meta: { version: row.version },
  });

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}
