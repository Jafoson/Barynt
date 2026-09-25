import type { SettingsForm } from "@/lib/plugins/settings";
import type { WorkspacePlugin, WorkspacePluginsView } from "./workspacePlugins";

// What the plugins' settings of a workspace (`/<workspace>/plugin/settings`) show, put together
// from the plugins pages of the workspace and of its projects: the plugins that are **switched on**
// there, by name, each with the form of its settings or without one. Pure: plain values in and out.
//
// A plugin that is off has no settings to set (the action refuses, and its values stay for when it
// is on again), and what applies to the whole platform is the platform's, so neither is listed. A
// person sees what **they** may set up: the workspace's plugins with `plugin.enable` in the
// workspace, a project's with `plugin.enable` in that project (the caller decides which projects
// those are).

/** A project of the workspace, as the area lists it. */
export interface AreaProject {
  id: string;
  slug: string;
  name: string;
  color: string;
  avatarUrl: string | null;
}

export interface SettingsAreaPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  /** What it lets this workspace set, and what is set; `null` when the plugin declares nothing. */
  settings: SettingsForm | null;
}

export interface SettingsAreaProject extends AreaProject {
  /** What it lets this project set, and what is set there; `null` when the plugin declares nothing. */
  settings: SettingsForm | null;
}

/** A plugin that applies per project, with the projects it is on in that this person may set up. */
export interface SettingsAreaProjectPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  /** In the order of their names. Never empty: a plugin that is on in none is not listed. */
  projects: SettingsAreaProject[];
}

export interface SettingsArea {
  /** Whether this person may set the workspace's own plugins up (`plugin.enable` in the workspace). */
  ownWorkspace: boolean;
  /** The workspace's plugins that are on here, in the order of their names. */
  plugins: SettingsAreaPlugin[];
  /** The plugins that apply per project and are on in a project this person may set up. */
  projectPlugins: SettingsAreaProjectPlugin[];
}

/** What the area is put together from. */
export interface AreaInput {
  /** The workspace's plugins page; `null` for someone who may not set the workspace's plugins up. */
  workspace: WorkspacePluginsView | null;
  /** For each project this person may set plugins up in: the project and its plugins page. */
  projects: { project: AreaProject; view: WorkspacePluginsView }[];
}

/** By name, and by id (or slug) where the names are the same, so the order never depends on the input's. */
const compare = (
  a: { name: string },
  aKey: string,
  b: { name: string },
  bKey: string,
): number => a.name.localeCompare(b.name) || aKey.localeCompare(bKey);

const isOn = (plugin: WorkspacePlugin): boolean => plugin.on;

/** The settings area of a workspace, from what its plugins pages read. */
export function settingsAreaOf({
  workspace,
  projects,
}: AreaInput): SettingsArea {
  const plugins: SettingsAreaPlugin[] = (workspace?.plugins ?? [])
    .filter(isOn)
    .map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      settings: plugin.settings,
    }))
    .sort((a, b) => compare(a, a.id, b, b.id));

  const grouped = new Map<string, SettingsAreaProjectPlugin>();
  for (const { project, view } of projects) {
    for (const plugin of view.plugins.filter(isOn)) {
      const entry = grouped.get(plugin.id) ?? {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        projects: [],
      };
      entry.projects.push({ ...project, settings: plugin.settings });
      grouped.set(plugin.id, entry);
    }
  }
  const projectPlugins = [...grouped.values()]
    .map((entry) => ({
      ...entry,
      projects: [...entry.projects].sort((a, b) =>
        compare(a, a.slug, b, b.slug),
      ),
    }))
    .sort((a, b) => compare(a, a.id, b, b.id));

  return { ownWorkspace: workspace !== null, plugins, projectPlugins };
}

/** One entry of the navigation: a plugin that has settings, and whose they are. */
export interface AreaNavPlugin {
  id: string;
  name: string;
  /** The workspace's own, or one that is set per project. */
  kind: "workspace" | "project";
}

/**
 * The plugins the navigation lists: the ones that have something to set, the workspace's first,
 * then the ones set per project. A plugin that declares nothing is on the overview (which says so),
 * not in the navigation: a row that opens nothing would be a dead end.
 */
export function navPlugins(area: SettingsArea): AreaNavPlugin[] {
  return [
    ...area.plugins
      .filter((plugin) => plugin.settings !== null)
      .map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        kind: "workspace" as const,
      })),
    ...area.projectPlugins
      .filter((plugin) =>
        plugin.projects.some((project) => project.settings !== null),
      )
      .map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        kind: "project" as const,
      })),
  ];
}

/**
 * One workspace plugin's settings page: the plugin, with its form, or `null` when there is none —
 * no such plugin, one that is off here, one that declares no settings, or one that is set per
 * project. The page is then "not found", never an empty form.
 */
export function settingsPageOf(
  area: SettingsArea,
  pluginId: string,
): (SettingsAreaPlugin & { settings: SettingsForm }) | null {
  const plugin = area.plugins.find((candidate) => candidate.id === pluginId);
  if (!plugin || plugin.settings === null) return null;
  return { ...plugin, settings: plugin.settings };
}

/**
 * The page of a plugin that is set per project: the plugin and the projects it can be set up in
 * (the ones it is on in and this person may set up). `null` when there is none: no such plugin, or
 * one that declares no settings.
 */
export function projectChooserOf(
  area: SettingsArea,
  pluginId: string,
): SettingsAreaProjectPlugin | null {
  const plugin = area.projectPlugins.find(
    (candidate) => candidate.id === pluginId,
  );
  if (!plugin) return null;
  const projects = plugin.projects.filter(
    (project) => project.settings !== null,
  );
  return projects.length > 0 ? { ...plugin, projects } : null;
}

/**
 * One project's settings of a plugin: the plugin, the project and the form, or `null` — no such
 * plugin, one that is off in that project, a project this person may not set up, or a plugin that
 * declares nothing.
 */
export function projectPageOf(
  area: SettingsArea,
  pluginId: string,
  projectSlug: string,
): {
  plugin: SettingsAreaProjectPlugin;
  project: SettingsAreaProject;
  settings: SettingsForm;
} | null {
  const plugin = projectChooserOf(area, pluginId);
  const project = plugin?.projects.find(
    (candidate) => candidate.slug === projectSlug,
  );
  if (!plugin || !project || project.settings === null) return null;
  return { plugin, project, settings: project.settings };
}

/** What a plugin's address in the area shows: its own form, or the projects to choose from. */
export type PluginPage =
  | {
      kind: "settings";
      plugin: SettingsAreaPlugin & { settings: SettingsForm };
    }
  | { kind: "projects"; plugin: SettingsAreaProjectPlugin };

/**
 * The page at `/plugin/settings/<pluginId>`: a plugin of the workspace's own is its form, a plugin
 * that is set per project is the projects to choose from, and anything else — no such plugin, one
 * that is off, one that declares nothing, one this person may not set up — is `null`: "not found".
 */
export function pluginPageOf(
  area: SettingsArea,
  pluginId: string,
): PluginPage | null {
  const own = settingsPageOf(area, pluginId);
  if (own) return { kind: "settings", plugin: own };
  const chooser = projectChooserOf(area, pluginId);
  if (chooser) return { kind: "projects", plugin: chooser };
  return null;
}
