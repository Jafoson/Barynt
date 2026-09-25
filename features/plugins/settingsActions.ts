"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import type { PluginRowScope } from "@/lib/plugins/scope";
import {
  changedSettings,
  type SettingField,
  sameSettings,
  settingsOf,
  toFields,
  validateSettings,
} from "@/lib/plugins/settings";
import { readPluginDirectory } from "./disk";
import { isPluginId } from "./guards";
import type { SettingsSaveResult } from "./types";

// A plugin's settings, saved by the level the plugin applies to: the platform's plugin by
// `plugin.manage`, a workspace's by `plugin.enable` in that workspace, a project's by
// `plugin.enable` in that project (the same permission that switches the plugin on there).
// The values are **data**, checked against what the plugin's manifest declares
// (`lib/plugins/settings.ts`): a client that sends a key the plugin does not have, or a value
// that does not fit, is refused. Nothing here runs plugin code, and nothing that decides what
// may run changes, so the registry is not told.
//
// Settings can only be saved where the plugin is switched on (a workspace or a project) and by
// the level the plugin applies to: a workspace cannot set a project plugin, or the platform's.

const validId = (id: unknown): id is string =>
  typeof id === "string" && id.length > 0 && id.length <= 100;

const invalid: SettingsSaveResult = { error: "Invalid request." };

interface Loaded {
  version: string;
  config: unknown;
  fields: SettingField[];
}

/** What the plugin lets people set, from its installed manifest, or why there is nothing. */
async function loadFields(
  pluginId: string,
  scope: PluginRowScope,
): Promise<Loaded | { error: string }> {
  const plugin = await db.plugin.findUnique({
    where: { id: pluginId },
    select: { version: true, scope: true, config: true },
  });
  if (!plugin) return { error: "Unknown plugin." };
  if (plugin.scope !== scope) {
    return {
      error:
        scope === "PLATFORM"
          ? "This plugin does not apply to the whole platform, so the platform has no settings for it."
          : `This plugin does not apply per ${scope === "PROJECT" ? "project" : "workspace"}, so it has no settings there.`,
    };
  }
  const directory = await readPluginDirectory();
  if (!directory.ok) return { error: directory.error };
  const found = directory.plugins.find(
    (p) => p.ok && p.id === pluginId && p.version === plugin.version,
  );
  if (!found?.ok) {
    return {
      error:
        "The plugin's manifest cannot be read from the plugin directory, so its settings cannot be saved.",
    };
  }
  const fields = toFields(settingsOf(found.manifest), "en");
  if (fields.length === 0) return { error: "This plugin has no settings." };
  return { version: plugin.version, config: plugin.config, fields };
}

/** The refusal for values that do not fit: which setting, and what is wrong with it. */
function refuse(issues: { id: string; message: string }[]): SettingsSaveResult {
  return { error: "Some settings are not valid.", issues };
}

/**
 * Saves the settings of a plugin that applies to the whole platform. Needs `plugin.manage`.
 * `values` is the whole set the form holds; what is not there is not set.
 */
export async function savePlatformPluginSettings(
  pluginId: string,
  values: unknown,
): Promise<SettingsSaveResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);
  if (!isPluginId(pluginId)) return invalid;

  const loaded = await loadFields(pluginId, "PLATFORM");
  if ("error" in loaded) return loaded;
  const checked = validateSettings(loaded.fields, values);
  if (!checked.ok) return refuse(checked.issues);
  if (sameSettings(loaded.config, checked.values)) return { ok: true };

  const written = await db.plugin.updateMany({
    where: { id: pluginId, scope: "PLATFORM" },
    data: { config: checked.values },
  });
  if (written.count !== 1) return { error: "Unknown plugin." };

  await recordAudit({
    action: "plugin.settings.changed",
    actorId,
    target: {
      type: "plugin",
      id: pluginId,
      label: `${pluginId}@${loaded.version}`,
    },
    meta: {
      version: loaded.version,
      level: "platform",
      changed: changedSettings(loaded.config, checked.values),
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Saves the settings of a plugin that applies per workspace, for that workspace. Needs
 * `plugin.enable` in it, and the plugin switched on there.
 */
export async function saveWorkspacePluginSettings(
  workspaceId: string,
  pluginId: string,
  values: unknown,
): Promise<SettingsSaveResult> {
  if (!validId(workspaceId)) return invalid;
  const actorId = await requirePermission("plugin.enable", { workspaceId });
  if (!isPluginId(pluginId)) return invalid;

  const loaded = await loadFields(pluginId, "WORKSPACE");
  if ("error" in loaded) return loaded;
  const row = await db.pluginWorkspace.findUnique({
    where: { pluginId_workspaceId: { pluginId, workspaceId } },
    select: { enabled: true, config: true },
  });
  if (!row?.enabled) {
    return { error: "Switch the plugin on in this workspace first." };
  }
  const checked = validateSettings(loaded.fields, values);
  if (!checked.ok) return refuse(checked.issues);
  if (sameSettings(row.config, checked.values)) return { ok: true };

  // Tied to the plugin still being on, so settings do not land on a row that was switched off.
  const written = await db.pluginWorkspace.updateMany({
    where: { pluginId, workspaceId, enabled: true },
    data: { config: checked.values },
  });
  if (written.count !== 1) {
    return { error: "Switch the plugin on in this workspace first." };
  }

  await recordAudit({
    action: "plugin.settings.changed",
    actorId,
    workspaceId,
    target: {
      type: "plugin",
      id: pluginId,
      label: `${pluginId}@${loaded.version}`,
    },
    meta: {
      version: loaded.version,
      level: "workspace",
      changed: changedSettings(row.config, checked.values),
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Saves the settings of a plugin that applies per project, for that project. Needs
 * `plugin.enable` in it, and the plugin switched on there.
 */
export async function saveProjectPluginSettings(
  projectId: string,
  pluginId: string,
  values: unknown,
): Promise<SettingsSaveResult> {
  if (!validId(projectId)) return invalid;
  const actorId = await requirePermission("plugin.enable", { projectId });
  if (!isPluginId(pluginId)) return invalid;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project) return { error: "Unknown project." };
  const loaded = await loadFields(pluginId, "PROJECT");
  if ("error" in loaded) return loaded;
  const row = await db.pluginProject.findUnique({
    where: { pluginId_projectId: { pluginId, projectId } },
    select: { enabled: true, config: true },
  });
  if (!row?.enabled) {
    return { error: "Switch the plugin on in this project first." };
  }
  const checked = validateSettings(loaded.fields, values);
  if (!checked.ok) return refuse(checked.issues);
  if (sameSettings(row.config, checked.values)) return { ok: true };

  const written = await db.pluginProject.updateMany({
    where: { pluginId, projectId, enabled: true },
    data: { config: checked.values },
  });
  if (written.count !== 1) {
    return { error: "Switch the plugin on in this project first." };
  }

  await recordAudit({
    action: "plugin.settings.changed",
    actorId,
    workspaceId: project.workspaceId,
    projectId,
    target: {
      type: "plugin",
      id: pluginId,
      label: `${pluginId}@${loaded.version}`,
    },
    meta: {
      version: loaded.version,
      level: "project",
      changed: changedSettings(row.config, checked.values),
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
