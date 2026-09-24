"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { describeStatus } from "@/lib/plugins/describe";
import { projectHookContext, runHook } from "@/lib/plugins/hooks";
import { getPluginRegistry } from "@/lib/plugins/host";
import { HOST_INFO } from "@/lib/plugins/hostInfo";
import { invalidatePluginRegistry } from "@/lib/plugins/registryState";
import type { PluginRowScope } from "@/lib/plugins/scope";
import { installedCandidates, readPluginDirectory } from "./disk";
import { isPluginId, isUniqueViolation } from "./guards";
import type { PluginActionResult } from "./types";

// A project switching a plugin on or off. What the platform installed is the
// platform's (`lifecycleActions.ts`); which of it a project uses is the project's,
// with `plugin.enable` **in that project** (`project_admin`, and whoever holds
// `project.admin.all` in the workspace), checked here for the project in the request.
// Only a plugin that applies per project has a switch here: one that applies per
// workspace is a workspace's (`workspaceActions.ts`), one for the whole platform is
// the platform's.
//
// The same rules as a workspace's, one level down. **Switching on has to end with the
// plugin running there**: the row is written, the registry is built again, and then the
// plugin has to be loaded; if it is not (the platform has not approved its code, its files
// are gone, a dependency failed) or its `onProjectEnable` refuses, the row is put back and
// the admin is told why. **Switching off cannot be refused by the plugin**: `onProjectDisable`
// runs after the change and a failure of it is a warning. Both are refused while the plugin's
// dependencies, or its dependents, are in the way in that project.

/** Why a project does not switch on or off a plugin that applies elsewhere. */
function notSwitchedHere(scope: PluginRowScope): string {
  return scope === "WORKSPACE"
    ? "This plugin applies per workspace. A workspace switches it on or off, not a project."
    : "This plugin applies to the whole platform. Only the platform switches it on or off.";
}

function validProjectId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 100;
}

/**
 * Switches the plugin `pluginId` on in the project, if it can run there.
 */
export async function enablePluginInProject(
  projectId: string,
  pluginId: string,
): Promise<PluginActionResult> {
  if (!validProjectId(projectId)) return { error: "Invalid request." };
  const actorId = await requirePermission("plugin.enable", { projectId });
  if (!isPluginId(pluginId)) return { error: "Invalid request." };

  const rows = await db.plugin.findMany({
    select: { id: true, version: true, scope: true, status: true },
  });
  const plugin = rows.find((row) => row.id === pluginId);
  if (!plugin) return { error: "Unknown plugin." };
  if (plugin.scope !== "PROJECT") {
    return { error: notSwitchedHere(plugin.scope) };
  }
  if (plugin.status !== "ENABLED") {
    return { error: "The platform has switched this plugin off." };
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      workspaceId: true,
      workspace: { select: { id: true, name: true } },
    },
  });
  if (!project) return { error: "Unknown project." };

  const current = await db.pluginProject.findUnique({
    where: { pluginId_projectId: { pluginId, projectId } },
    select: { enabled: true },
  });
  if (current?.enabled) return { ok: true };

  // What it needs, in this project. The platform's plugins it needs apply
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
  const perProject = Object.keys(candidate.dependencies).filter(
    (dependency) =>
      rows.find((row) => row.id === dependency)?.scope === "PROJECT",
  );
  if (perProject.length > 0) {
    const on = await db.pluginProject.findMany({
      where: { projectId, enabled: true, pluginId: { in: perProject } },
      select: { pluginId: true },
    });
    const missing = perProject.filter(
      (dependency) => !on.some((row) => row.pluginId === dependency),
    );
    if (missing.length > 0) {
      return {
        error: `Switch on ${missing.sort().join(", ")} in this project first, ${pluginId} needs ${missing.length === 1 ? "it" : "them"}.`,
      };
    }
  }

  // The change. A row that was switched off is switched on again, and keeps what
  // the project had set; otherwise there is none yet.
  let created = false;
  const reenabled = await db.pluginProject.updateMany({
    where: { pluginId, projectId, enabled: false },
    data: { enabled: true },
  });
  if (reenabled.count === 0) {
    try {
      await db.pluginProject.create({
        data: { pluginId, projectId, enabled: true },
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
      await db.pluginProject.deleteMany({ where: { pluginId, projectId } });
    } else {
      await db.pluginProject.updateMany({
        where: { pluginId, projectId },
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
      refusal = `It cannot run in this project. ${snapshot.problem ?? describeStatus(status)}`;
    } else {
      const outcome = await runHook(
        snapshot.active.find((p) => p.id === pluginId),
        "onProjectEnable",
        projectHookContext(
          { id: pluginId, version: plugin.version },
          HOST_INFO,
          { id: project.workspace.id, name: project.workspace.name },
          { id: project.id, name: project.name },
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
    action: "plugin.project.enabled",
    actorId,
    workspaceId: project.workspaceId,
    projectId,
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
 * Switches the plugin `pluginId` off in the project. The plugin cannot refuse.
 */
export async function disablePluginInProject(
  projectId: string,
  pluginId: string,
): Promise<PluginActionResult> {
  if (!validProjectId(projectId)) return { error: "Invalid request." };
  const actorId = await requirePermission("plugin.enable", { projectId });
  if (!isPluginId(pluginId)) return { error: "Invalid request." };

  const rows = await db.plugin.findMany({
    select: { id: true, version: true, scope: true, status: true },
  });
  const plugin = rows.find((row) => row.id === pluginId);
  if (!plugin) return { error: "Unknown plugin." };
  if (plugin.scope !== "PROJECT") {
    return { error: notSwitchedHere(plugin.scope) };
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      workspaceId: true,
      workspace: { select: { id: true, name: true } },
    },
  });
  if (!project) return { error: "Unknown project." };

  const enabledHere = await db.pluginProject.findMany({
    where: { projectId, enabled: true },
    select: { pluginId: true },
  });
  if (!enabledHere.some((row) => row.pluginId === pluginId)) {
    return { ok: true };
  }

  // Which switched-on plugins of this project need it. If the plugin directory
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
      error: `Not done. ${dependents.join(", ")} need${dependents.length === 1 ? "s" : ""} it in this project. Switch ${dependents.length === 1 ? "that one" : "those"} off first.`,
    };
  }

  // The plugin as it runs now, taken before the change: switching it off may be
  // the last thing that kept it loaded, and its hook is still to run.
  const running = (await getPluginRegistry().get()).active.find(
    (p) => p.id === pluginId,
  );

  const written = await db.pluginProject.updateMany({
    where: { pluginId, projectId, enabled: true },
    data: { enabled: false },
  });
  // Another admin got there first.
  if (written.count !== 1) return { ok: true };
  invalidatePluginRegistry();

  const outcome = await runHook(
    running,
    "onProjectDisable",
    projectHookContext(
      { id: pluginId, version: plugin.version },
      HOST_INFO,
      { id: project.workspace.id, name: project.workspace.name },
      { id: project.id, name: project.name },
    ),
  );

  await recordAudit({
    action: "plugin.project.disabled",
    actorId,
    workspaceId: project.workspaceId,
    projectId,
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
        warning: `${pluginId} is switched off, but its onProjectDisable failed: ${outcome.message}`,
      }
    : { ok: true };
}
