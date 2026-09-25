# The plugins of a workspace

**Workspace settings, Plugins** (`/<workspace>/settings/plugins`, needs `plugin.enable` in that workspace: `owner` and `admin` by
default, [RBAC](../rbac.md)). It is the workspace's part of a plugin's life: the platform installs
([The plugins page](admin.md), [Lifecycle](lifecycle.md)), and a workspace **switches on and off** what the platform installed.
The tab is only in the settings navigation for someone who holds the permission, and the page itself asks again: anyone else gets the
"page not found" of the other settings pages. A layout protects no page and no action.

## What it shows

The plugins that **apply per workspace** (`scope: workspace`) and that the platform has switched on, one row each with its name, what it
does, its version, whether it has code, whether it comes from a store (or from none, with the warning that nobody reviewed it) and **where
it stands here**:

| Line | When |
| --- | --- |
| *Running in this workspace* | it is on here and the registry has it running |
| *Off in this workspace* | nothing is in the way, the switch is free (also when it runs for another workspace) |
| *It has code, and the platform has to approve the code before it can run* | the platform has not approved its code (or approved another version, with its own line). The switch is **disabled**: switching on would fail |
| *The platform has switched this plugin off* | shown for a plugin that is on here and cannot run because of it. A plugin the platform switched off and that is off here is not shown at all |
| *It cannot run at the moment. ...* | its files are missing, its manifest is invalid, it does not fit this Barynt, it failed to load, or the policy will not let it run |

The plugins that apply to the **whole platform** are listed apart with a note: they apply everywhere, only the platform switches them.

## What the switch does

`enablePlugin(workspaceId, pluginId)` and `disablePlugin(...)` from [`workspaceActions.ts`](../../features/plugins/workspaceActions.ts):
the page passes the ids and nothing else. **Switching on has to end with the plugin running here**, otherwise the row is put back and the
reason is shown; so a switch never says "on" for a plugin that is not running. Switching off asks first (a plugin's `onDisable` cannot
refuse), and what the workspace had set for the plugin stays. The disabled switch on a plugin that cannot run is the question; the
action is the protection and refuses the same way if it is called anyway.

## What it reads

`getWorkspacePlugins(workspaceId, locale)` ([`workspaceQueries.ts`](../../features/plugins/workspaceQueries.ts)) asks for `plugin.enable`
**in that workspace** (not `plugin.manage`, which a workspace admin does not have), then reads the platform's overview
(`loadOverview`, shared with the platform's page) and which plugins are on here, and `buildWorkspacePlugins` (pure) makes a **selection**
of it. What is the platform's is not passed on: the plugin directory's path, why plugins are off, the hash of a plugin's files, where it came
from, in how many workspaces it is on, what is approved.

## A plugin's settings

The settings of the plugins are **their own area of the settings**: the fourth choice next to *Personal*, *Project* and *Workspace* in the row at the top
(*Plugins*, `/<workspace>/plugin/settings`). It shows **what this person may set up**, and is offered to whoever holds `plugin.enable` in the workspace **or in a
project of it** (a project admin who is no workspace admin gets it too, with their projects' plugins only); anyone else gets "not found" and is not offered the choice.

| Address | What it is |
| --- | --- |
| `/<workspace>/plugin/settings` | The overview: the plugins that are **on in this workspace** and, in a section of their own, the plugins that are **set per project**, each with what it does, its version (for the second: the projects it is on in) and a link into its settings, or "No settings." |
| `/<workspace>/plugin/settings/<pluginId>` | A workspace plugin: its [form](lifecycle.md#the-form) as a page, with **Save** in the header like the other settings pages. A plugin set per project: the projects to choose from |
| `/<workspace>/plugin/settings/<pluginId>/<projectSlug>` | A plugin set per project, in one project: the form as a page, with the way back to the projects |

- **Whose plugins are listed** depends on who asks. The workspace's own plugins are listed for whoever holds `plugin.enable` in the workspace (`owner` and `admin`
  by default). A plugin set per project is listed with the projects **it is on in and this person may set up** (`plugin.enable` in that project: `project_admin`, and whoever
  holds `project.admin.all`): `projectIdsWith` (`lib/permissions.ts`) answers it for all projects at once, by the same rules as the resolver of a single project.
- **The navigation on the left** lists the overview and, below it, each plugin that is on and **declares settings**: the workspace's with the puzzle piece, then the
  ones set per project with the projects' icon (a row that stays open on the pages beneath it). A plugin without settings is on the overview (which says so), not in the
  navigation: a row that opens nothing would be a dead end. On a phone the overview is the list of sections and a plugin's page is its own screen.
- **The Settings button** on the workspace's and on a project's [Plugins page](#what-it-shows) is a link to that page (`LinkButton`, a real link: it can be opened in a
  new tab): `/<workspace>/plugin/settings/<id>` for a workspace plugin, `.../<id>/<projectSlug>` in a project.
- **A page that is not there is a 404:** a plugin that is off, one that declares no settings, a project the person may not set up and one that does not exist look the
  same, never an empty form.
- **Saving** is `saveWorkspacePluginSettings(workspaceId, pluginId, values)` or `saveProjectPluginSettings(projectId, pluginId, values)`
  ([Lifecycle](lifecycle.md#a-plugins-settings)); the page passes the ids and nothing else. A toast says it is saved, the page reads again, and the form starts over from
  what it sent.
- **What is read** is put together by `settingsAreaOf` ([`settingsArea.ts`](../../features/plugins/settingsArea.ts), pure) from the same selection as the plugins pages
  (so nothing that is the platform's reaches a workspace or project admin) and asked through `getPluginSettingsArea`, which turns "may set nothing up" into `null` for the
  page to make a 404. `canOpenPluginSettings` decides whether the choice is offered in the four settings layouts.
- **What is not here:** the plugins for the whole platform (the platform's, on [the plugins page](admin.md), where their settings open in a window).
- The tab of the tab bar is called *Plugins* for the overview, *Plugins (Notes)* for a plugin's page and *Plugins (Roadmap · Web App)* for a project's (the tab bar knows
  the plugin's id, not its name).
- On a phone, four choices do not fit the row with their words: the open one keeps its word and the others are their icon.

## The store of a workspace

**Workspace settings, Plugins, Store** (`/<workspace>/settings/plugins/store`) is the same store page as the platform's ([The store](admin.md#the-store)), for the
workspace. It is there when the platform gave workspaces the store (*Show the store in workspaces*, on by default; a setting that cannot be read
means off) and someone with `plugin.enable` opens it; otherwise the tab is missing and the address is a 404. What differs:

- **Only plugins that apply per workspace** are listed, and where the platform asked for *only released plugins* only the ones it released.
  A plugin for the whole platform is the platform's to install.
- **A card says what this workspace can do**: *Add* for a plugin the platform does not have yet, *Switch on* for one it has and this workspace has
  not (no download), *Installed* for one that is on here. There is no update button and no release switch: those are the platform's.
- **Add** (`addStorePluginToWorkspace`, `plugin.enable` in that workspace) is the platform's install ([Release](release.md),
  [Lifecycle](lifecycle.md)) for a workspace admin, followed by the switch in that workspace: the same checks before anything is downloaded, the same
  hash and manifest, the same record (`source` STORE), audited as `plugin.installed` with the workspace that asked. The consent says that it is added
  for the whole platform and switched on here. **What it does not change:** a plugin with code is added and **waits for the platform to approve its
  code**; the page then says it was added and is not switched on yet, and offers *Switch on* once the platform has approved it.
- **What a workspace admin is told of the stores** is their names, when they were fetched and that one could not be read or updated; not why, which
  can hold a path or an address (`getWorkspaceStore` blanks it on the server).

## Not here

- **Updating and removing.** Those are the platform's ([The plugins page](admin.md)).
- **Project level**: a project switches on the plugins that apply per project on [its own page](project.md); a workspace's page knows
  nothing of them. A project opting out of what the workspace switched on is not built.
