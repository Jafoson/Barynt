import type { SettingsForm } from "@/lib/plugins/settings";
import type { WorkspacePlugin, WorkspacePluginsView } from "./workspacePlugins";

// What the plugins' settings of a workspace (`/<workspace>/plugin/settings`) show, put together
// from the workspace's plugins page: the plugins that are **switched on here**, by name, each with
// the form of its settings or without one. Pure: plain values in and out. A plugin that is off
// here has no settings to set (the action refuses, and its values stay for when it is on again),
// and what applies to the whole platform is the platform's, so neither is listed.

export interface SettingsAreaPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  /** What it lets this workspace set, and what is set; `null` when the plugin declares nothing. */
  settings: SettingsForm | null;
}

export interface SettingsArea {
  /** Switched on here, in the order of their names. */
  plugins: SettingsAreaPlugin[];
}

const byName = (a: WorkspacePlugin, b: WorkspacePlugin): number =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** The settings area of a workspace, from what its plugins page reads. */
export function settingsAreaOf(view: WorkspacePluginsView): SettingsArea {
  return {
    plugins: view.plugins
      .filter((plugin) => plugin.on)
      .sort(byName)
      .map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        settings: plugin.settings,
      })),
  };
}

/** The plugins of the area that have settings: what the navigation lists. */
export function configurable(area: SettingsArea): SettingsAreaPlugin[] {
  return area.plugins.filter((plugin) => plugin.settings !== null);
}

/**
 * One plugin's settings page: the plugin, with its form, or `null` when there is none — no such
 * plugin, one that is off here, or one that declares no settings. The page is then "not found",
 * never an empty form.
 */
export function settingsPageOf(
  area: SettingsArea,
  pluginId: string,
): (SettingsAreaPlugin & { settings: SettingsForm }) | null {
  const plugin = area.plugins.find((candidate) => candidate.id === pluginId);
  if (!plugin || plugin.settings === null) return null;
  return { ...plugin, settings: plugin.settings };
}
