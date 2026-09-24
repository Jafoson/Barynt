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
- **A plugin's own settings** (`PluginWorkspace.config`, BARY-66).
- **Project level**: a project switches on the plugins that apply per project on [its own page](project.md); a workspace's page knows
  nothing of them. A project opting out of what the workspace switched on is not built.
