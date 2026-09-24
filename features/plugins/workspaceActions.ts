"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { describeStatus } from "@/lib/plugins/describe";
import { runHook, workspaceHookContext } from "@/lib/plugins/hooks";
import { getPluginRegistry } from "@/lib/plugins/host";
import { HOST_INFO } from "@/lib/plugins/hostInfo";
import { invalidatePluginRegistry } from "@/lib/plugins/registryState";
import { installedCandidates, readPluginDirectory } from "./disk";
import { isPluginId, isUniqueViolation } from "./guards";
import type { PluginActionResult } from "./types";

// A workspace switching a plugin on or off. What the platform installed is the
// platform's (`lifecycleActions.ts`); which of it a workspace uses is the
// workspace's, with `plugin.enable` (`owner` and `admin`), checked here for the
// workspace in the request. A plugin that applies to the whole platform has no
// switch per workspace: only `plugin.manage` switches it.
//
// **Switching on has to end with the plugin running there.** The row is written,
// the registry is built again, and then the plugin has to be loaded. If it is not
// (the platform has not approved its code, its files are gone, a dependency failed)
// or its `onEnable` refuses, the row is put back and the admin is told why. So a
// workspace never shows a plugin as on that is not running, and `onEnable` is not
// skipped because the plugin could not run at that moment.
//
// **Switching off cannot be refused by the plugin.** `onDisable` runs after the
// change and a failure of it is a warning; a broken plugin must not be the reason
// a workspace cannot get rid of it.
//
// Both are refused while the plugin's dependencies, or its dependents, are in the
// way in that workspace: a plugin that applies per workspace needs the ones it
// depends on switched on in the same workspace.

/** Why a workspace does not switch on or off a plugin that applies elsewhere. */
function notSwitchedHere(scope: "PLATFORM" | "PROJECT" | "WORKSPACE"): string {
  return scope === "PROJECT"
    ? "This plugin applies per project. A project switches it on or off, not a workspace."
    : "This plugin applies to the whole platform. Only the platform switches it on or off.";
}

function validWorkspaceId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 100;
}

/**
 * Switches the plugin `pluginId` on in the workspace, if it can run there.
 */
export async function enablePlugin(
  workspaceId: string,
  pluginId: string,
): Promise<PluginActionResult> {
  if (!validWorkspaceId(workspaceId)) return { error: "Invalid request." };
  const actorId = await requirePermission("plugin.enable", { workspaceId });
  if (!isPluginId(pluginId)) return { error: "Invalid request." };

  const rows = await db.plugin.findMany({
    select: { id: true, version: true, scope: true, status: true },
  });
  const plugin = rows.find((row) => row.id === pluginId);
  if (!plugin) return { error: "Unknown plugin." };
  if (plugin.scope !== "WORKSPACE")
    return { error: notSwitchedHere(plugin.scope) };
  if (plugin.status !== "ENABLED") {
    return { error: "The platform has switched this plugin off." };
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) return { error: "Unknown workspace." };

  const current = await db.pluginWorkspace.findUnique({
    where: { pluginId_workspaceId: { pluginId, workspaceId } },
    select: { enabled: true },
  });
  if (current?.enabled) return { ok: true };

  // What it needs, in this workspace. The platform's plugins it needs apply
  // everywhere already; the registry says below if one of them cannot load.
  const directory = await readPluginDirectory();
  if (!directory.ok) return { error: directory.error };
  const candidate = installedCandidates(rows, directory.plugins).find(
    (c) => c.id === pluginId,
  );
  if (!candidate) {
    return {
      error:
        "The plugin's manifest cannot be read from the plugin directory, so it cannot be switched on.",
    };
  }
  const perWorkspace = Object.keys(candidate.dependencies).filter(
    (dependency) =>
      rows.find((row) => row.id === dependency)?.scope === "WORKSPACE",
  );
  if (perWorkspace.length > 0) {
    const on = await db.pluginWorkspace.findMany({
      where: { workspaceId, enabled: true, pluginId: { in: perWorkspace } },
      select: { pluginId: true },
    });
    const missing = perWorkspace.filter(
      (dependency) => !on.some((row) => row.pluginId === dependency),
    );
    if (missing.length > 0) {
      return {
        error: `Switch on ${missing.sort().join(", ")} in this workspace first, ${pluginId} needs ${missing.length === 1 ? "it" : "them"}.`,
      };
    }
  }

  // The change. A row that was switched off is switched on again, and keeps what
  // the workspace had set; otherwise there is none yet.
  let created = false;
  const reenabled = await db.pluginWorkspace.updateMany({
    where: { pluginId, workspaceId, enabled: false },
    data: { enabled: true },
  });
  if (reenabled.count === 0) {
    try {
      await db.pluginWorkspace.create({
        data: { pluginId, workspaceId, enabled: true },
      });
      created = true;
    } catch (error) {
      // Another admin switched it on at the same moment.
      if (isUniqueViolation(error)) return { ok: true };
      throw error;
    }
  }
  const undo = async () => {
    if (created) {
      await db.pluginWorkspace.deleteMany({ where: { pluginId, workspaceId } });
    } else {
      await db.pluginWorkspace.updateMany({
        where: { pluginId, workspaceId },
        data: { enabled: false },
      });
    }
    invalidatePluginRegistry();
  };

  invalidatePluginRegistry();
  let refusal: string | null = null;
  let ran = false;
  try {
    const snapshot = await getPluginRegistry().get();
    const status = snapshot.plugins.find((p) => p.id === pluginId)?.status;
    if (status?.state !== "loaded") {
      // A registry that could not be built has no plugins, and says why.
      refusal = `It cannot run in this workspace. ${snapshot.problem ?? describeStatus(status)}`;
    } else {
      const outcome = await runHook(
        snapshot.active.find((p) => p.id === pluginId),
        "onEnable",
        workspaceHookContext(
          { id: pluginId, version: plugin.version },
          HOST_INFO,
          { id: workspace.id, name: workspace.name },
        ),
      );
      ran = outcome.ran;
      if (outcome.ran && !outcome.ok) {
        refusal = `The plugin refused to be switched on: ${outcome.message}`;
      }
    }
  } catch (error) {
    await undo();
    throw error;
  }
  if (refusal) {
    await undo();
    return { error: refusal };
  }

  await recordAudit({
    action: "plugin.workspace.enabled",
    actorId,
    workspaceId,
    target: {
      type: "plugin",
      id: pluginId,
      label: `${pluginId}@${plugin.version}`,
    },
    meta: { version: plugin.version, hook: ran ? "ran" : "none" },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Switches the plugin `pluginId` off in the workspace. The plugin cannot refuse.
 */
export async function disablePlugin(
  workspaceId: string,
  pluginId: string,
): Promise<PluginActionResult> {
  if (!validWorkspaceId(workspaceId)) return { error: "Invalid request." };
  const actorId = await requirePermission("plugin.enable", { workspaceId });
  if (!isPluginId(pluginId)) return { error: "Invalid request." };

  const rows = await db.plugin.findMany({
    select: { id: true, version: true, scope: true, status: true },
  });
  const plugin = rows.find((row) => row.id === pluginId);
  if (!plugin) return { error: "Unknown plugin." };
  if (plugin.scope !== "WORKSPACE")
    return { error: notSwitchedHere(plugin.scope) };

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) return { error: "Unknown workspace." };

  const enabledHere = await db.pluginWorkspace.findMany({
    where: { workspaceId, enabled: true },
    select: { pluginId: true },
  });
  if (!enabledHere.some((row) => row.pluginId === pluginId)) {
    return { ok: true };
  }

  // Which switched-on plugins of this workspace need it. If the plugin directory
  // cannot be read nothing is known to, and switching off stays possible.
  const directory = await readPluginDirectory();
  const dependents = installedCandidates(
    rows,
    directory.ok ? directory.plugins : [],
  )
    .filter(
      (c) =>
        Object.hasOwn(c.dependencies, pluginId) &&
        enabledHere.some((row) => row.pluginId === c.id),
    )
    .map((c) => c.id)
    .sort();
  if (dependents.length > 0) {
    return {
      error: `Not done. ${dependents.join(", ")} need${dependents.length === 1 ? "s" : ""} it in this workspace. Switch ${dependents.length === 1 ? "that one" : "those"} off first.`,
    };
  }

  // The plugin as it runs now, taken before the change: switching it off may be
  // the last thing that kept it loaded, and its hook is still to run.
  const running = (await getPluginRegistry().get()).active.find(
    (p) => p.id === pluginId,
  );

  const written = await db.pluginWorkspace.updateMany({
    where: { pluginId, workspaceId, enabled: true },
    data: { enabled: false },
  });
  // Another admin got there first.
  if (written.count !== 1) return { ok: true };
  invalidatePluginRegistry();

  const outcome = await runHook(
    running,
    "onDisable",
    workspaceHookContext({ id: pluginId, version: plugin.version }, HOST_INFO, {
      id: workspace.id,
      name: workspace.name,
    }),
  );

  await recordAudit({
    action: "plugin.workspace.disabled",
    actorId,
    workspaceId,
    target: {
      type: "plugin",
      id: pluginId,
      label: `${pluginId}@${plugin.version}`,
    },
    meta: {
      version: plugin.version,
      hook: !outcome.ran ? "none" : outcome.ok ? "ran" : "failed",
      ...(outcome.ran && !outcome.ok ? { hookError: outcome.message } : {}),
    },
  });

  revalidatePath("/", "layout");
  return outcome.ran && !outcome.ok
    ? {
        ok: true,
        warning: `${pluginId} is switched off, but its onDisable failed: ${outcome.message}`,
      }
    : { ok: true };
}
