# The plugins of a project

**Project settings, Plugins** (`/<workspace>/project/<project>/settings/plugins`, needs `plugin.enable` **in that project**:
`project_admin` by default, and whoever holds `project.admin.all` in the workspace, [RBAC](../rbac.md)). It is the project's part of a
plugin's life, one level below the workspace's ([The plugins of a workspace](workspace.md)): the platform installs
([The plugins page](admin.md), [Lifecycle](lifecycle.md)), and a project **switches on and off** what the platform installed **and that
applies per project** (`scope: project`, [Manifest](manifest.md#scope)). The section is only in the project settings for someone who holds the
permission, and the page itself asks again: anyone else gets the "page not found" of the other settings pages. A layout protects no page
and no action.

## It is the workspace's page, with the words of a project

The page is the same component ([`LevelPlugins`](../../features/plugins/components/LevelPlugins/LevelPlugins.tsx)) with `level="project"`:
one row for each plugin with its name, what it does, its version, whether it has code, whether it comes from a store, and **where it stands
here** (*Running in this project*, *Off in this project*, *It has code, and the platform has to approve the code before it can run*, *The
platform has switched this plugin off*, *It cannot run at the moment*), and a switch that is disabled where switching on would fail. What
[the workspace's page says](workspace.md#what-it-shows) holds here, with "project" for "workspace". The plugins that apply to the **whole
platform** are listed apart with a note.

**What is a project's is only what applies per project.** A plugin that applies per workspace is a workspace's to switch on, and neither
page shows the other's; the actions refuse the wrong level with a sentence that says whose it is
([Lifecycle](lifecycle.md#per-project)).

## What the switch does

`enablePluginInProject(projectId, pluginId)` and `disablePluginInProject(...)`: the page passes the ids and nothing else. **Switching on
has to end with the plugin running here**, otherwise the row is put back and the reason is shown. Switching off asks first, and what the
project had set for the plugin stays.

## What it reads

`getProjectPlugins(projectId, locale)` ([`projectQueries.ts`](../../features/plugins/projectQueries.ts)) asks for `plugin.enable` **in that
project** (not `plugin.manage`), then reads the platform's overview (`loadOverview`, shared with the platform's page and the workspace's) and which
plugins are on in this project, and `buildProjectPlugins` (pure) makes the same **selection** as a workspace gets: the plugin directory's path,
the hashes, where a plugin came from, in how many projects it is on and what is approved are the platform's and are not passed on.

## Not here yet

- **The store in a project.** *Show the store in projects* (`SystemSettings.pluginStoreInProjects`) is a setting that exists; the Store tab for a
  project is the next step, so the page has no tabs yet.
- **A plugin's own settings** (`PluginProject.config`, BARY-66).
