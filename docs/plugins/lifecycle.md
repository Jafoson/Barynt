# Lifecycle

What a plugin goes through: installed, updated, switched off and uninstalled by the platform, switched on
and off by a workspace, and the hooks it can run on these events.

- The platform's half is in [`features/plugins/lifecycleActions.ts`](../../features/plugins/lifecycleActions.ts),
  with `plugin.manage`. What it reads from disk is in [`features/plugins/disk.ts`](../../features/plugins/disk.ts).
- The workspace's half is in [`features/plugins/workspaceActions.ts`](../../features/plugins/workspaceActions.ts),
  with `plugin.enable` ([Per workspace](#per-workspace)).
- The hooks are in the SDK, run by [`lib/plugins/hooks.ts`](../../lib/plugins/hooks.ts) ([Hooks](#hooks)).

Every action:

- asks for its permission itself: `plugin.manage` in the platform context for the platform's, `plugin.enable` in the
  workspace of the request for a workspace's. A layout protects no action, and the first thing that happens is the
  permission check, so nothing is looked up for someone who may not;
- is **audited**, and tells the **registry** (`invalidatePluginRegistry()`) and the cache, so from
  the next request the plugin is or is not handed out ([Loading](loading.md#when-it-is-built-again));
- never throws for a reason the admin can act on: it returns `{ ok: true }` or `{ error }` with a sentence, and
  `{ ok: true, warning }` when the change was made but a hook of the plugin failed on the way. Only a broken database or a
  missing permission throws.

| Action | What it does | Audit entry |
| --- | --- | --- |
| `installPlugin(id, version, { acknowledged })` | Adds the plugin that lies in the plugin directory, switched on for the platform | `plugin.installed` (marked) |
| `updatePlugin(id, version, { acknowledged })` | Moves an installed plugin to a newer version in the directory | `plugin.updated` (marked) |
| `uninstallPlugin(id)` | Removes the plugin and the workspaces' settings for it | `plugin.uninstalled` |
| `setPluginStatus(id, enabled)` | Switches the plugin on or off for the whole platform | `plugin.status.enabled`, `plugin.status.disabled` |

"Marked" is the audit log's highlight for changes that bring new files into what may run.

## Where the files come from

There are two ways a plugin gets to be installed, and the `source` of the row says which.

- **From a store** (`installStorePlugin` in `features/plugins/storeActions.ts`, the work in `storeInstall.ts`, [Release](release.md)). The
  entry is read from the store's clone, the release is downloaded and checked against the hash the store pinned and the manifest it lists,
  put in the plugin directory in one rename, and recorded with `source` `STORE` and `origin` the store's address. It checks, before it
  downloads anything, that plugins have a directory, the store is on, the plugin is not installed already, the store lists this plugin
  and version, the version was not withdrawn and is the one the store describes, and that it fits this Barynt and what is installed
  (`previewInstall`); a request that cannot succeed asks nobody for anything. Nothing runs and nothing is switched on: code needs its own
  approval, and a per-workspace plugin applies nowhere until a workspace switches it on. It is audited as `plugin.installed` with the
  store, the hash of the files and the hash of the archive. If the row cannot be made, what the call put in place is taken away again
  and what was there before is not touched. **Updating** a plugin that came from a store is the next step (BARY-108); today it says so.
- **From the plugin directory** (`installPlugin`, `updatePlugin`), for what already lies in `<dir>/<id>/<version>/`
  ([Loading](loading.md#where-plugins-live)): someone put it there, and the action registers it.

A plugin from the directory comes from **no store**, so its `source` is `DIRECTORY` and its `origin` is empty. **The client is never
asked where a plugin came from**: `source`, `origin`, `status` and the hash are not parameters, and a caller that passes them
anyway is ignored. Otherwise an admin, or anything that can call the action, could pass any directory off as a plugin from
the official store. `STORE` and the store's address are set by the installer from the store's row and clone, after it checked the entry.

## The rule for a plugin from no store

Installing or updating a plugin that comes from no store is the case [the unsigned setting](security.md#plugins-from-no-store-unsigned)
is for, and the rule that goes with it applies to each action:

1. `SystemSettings.allowUnsignedPlugins` has to be on. It fails closed: no row, a value that is not `true`, or a database
   that cannot be read means off.
2. The server needs a real **yes** (`acknowledged === true`) **each time**. The setting is not consent for every plugin,
   and the dialog that shows the warning cannot be skipped by calling the action directly.

Both are checked before the directory is read. **Nothing of the plugin runs because of this.** A plugin from no store with
code stays blocked in the process whatever is set ([Security](security.md#plugins-from-no-store-unsigned)); one without code
is declarative and runs as the manifest describes.

## What is read from the directory

The directory is outside the host's control, so before anything is written the action checks what it found:

- the version directory exists and its manifest is **valid**; the reasons are given back;
- all files pass the [integrity rules](security.md#the-integrity-check): no symlinks, no odd file kinds, within the limits;
- the hash of the files is taken **twice**, before and after the manifest is read, and has to be the same, so the manifest
  that is used is one of the files the hash covers, not one that changed in between;
- the id and the version in the request are checked as an id and a version before they become part of a path.

The hash is what is stored as `Plugin.integrity`, and what the [integrity check](security.md#the-integrity-check) compares
against before every load.

## What a change does to the others

Before a plugin is installed or updated, the resolver ([Compatibility](compatibility.md)) is asked what would come of it,
with the plugin as it would be:

- **it could not load itself**: the `barynt` range does not match this version, a dependency is missing, in the wrong
  version, or per workspace while the plugin applies to the whole platform. Refused, with the reasons in words.
- **it would stop another plugin from loading**: an update to a version outside the range a dependent asks for. Refused,
  and the dependents are named.

Uninstall asks the same about removing: while another installed plugin needs it, it is refused and those plugins are named.

A plugin whose files are gone or whose manifest is invalid cannot be read, so it counts as no dependent. That is deliberate: it
could not load anyway, and it must not be what stops someone from uninstalling.

## Install

The plugin gets a row: `status` `ENABLED`, `scope` from its manifest (`platform` or, the default, `workspace`), `source`
`DIRECTORY`, no `origin`, `integrity` the hash that was read. A workspace plugin still applies nowhere until a workspace switches
it on. It has **no code approval**: its code is not approved because it was installed.

Two admins installing the same plugin at once: the second gets "installed already" (the primary key decides), and nothing is audited.

## Update

Only to a **newer** version, compared as versions (`1.10.0` is newer than `1.9.0`), of a plugin that was installed from the
directory. A plugin from a store is updated where it came from. The scope cannot change, because the plugin's row, its
workspaces' settings and its dependents were made for the one it had.

The old version's files stay where they are (one directory per version, so an update can be undone by hand). The plugin keeps
its `status`, its `config` and which workspaces switched it on. **A code approval does not carry over**: it was for the exact files of
the old version, so the update clears `codeApprovalHash` and `codeApprovedAt` and the audit entry says so (`approvalWithdrawn`).
The new version has to be approved on its own ([Security](security.md#the-approval)).

The write is tied to the version and the hash that were read, so an update that lost a race to another one changes nothing, says
so, and is not audited.

## Uninstall

Deletes the row, and with it the workspaces' settings (`PluginWorkspace` goes by the foreign key). The audit entry keeps what
it was (version, source, hash) and in how many workspaces it was switched on.

**The plugin's files stay in the directory.** They are the admin's; nothing that put them there exists yet to clean up
after itself, and a plugin that is uninstalled by mistake can be installed again from the same files. What the plugin already
started in this process keeps running until a restart, like after any change that stops a plugin
([Loading](loading.md#when-it-is-built-again)).

If the plugin is running, its `onUninstall` runs **after** the row is gone ([Hooks](#hooks)).

## Switching off

`setPluginStatus(id, false)` stops the plugin from loading and from being handed out, without uninstalling it: what workspaces
set for it stays. Switching on again is the reverse. Doing what is already the case changes and audits nothing. Neither direction
needs the plugin's files or the unsigned setting: switching off has to be possible whatever else is wrong.

## Per workspace

A workspace switches on what the platform installed: `enablePlugin(workspaceId, pluginId)` and
`disablePlugin(workspaceId, pluginId)`, with **`plugin.enable`** (`owner` and `admin`) for that workspace.

| Action | What it does | Audit entry (with the workspace) |
| --- | --- | --- |
| `enablePlugin(workspaceId, pluginId)` | Switches the plugin on in the workspace, if it can run there | `plugin.workspace.enabled` |
| `disablePlugin(workspaceId, pluginId)` | Switches it off there; the plugin cannot refuse | `plugin.workspace.disabled` |

Which plugins have this switch: only the ones with `scope = WORKSPACE`. A plugin that applies to the whole platform has none,
and neither action touches it; only `plugin.manage` switches it, with `setPluginStatus`. A plugin the platform switched off cannot
be switched on in a workspace, but a workspace can still switch it off.

### Switching on has to end with the plugin running

The row is written, the registry is built again, and then the plugin has to be **loaded**. If it is not, the row is put back and
the admin is told why, in words (`describeStatus`, [`lib/plugins/describe.ts`](../../lib/plugins/describe.ts)): the platform has
not approved its code, its files are gone, a dependency failed, the registry could not be built. So a workspace never shows a
plugin as on that is not running, and `onEnable` is not skipped because the plugin could not run at that moment. A row that
was off is switched on again and keeps the settings the workspace had; a row that this call created is deleted again.

Then `onEnable` runs. If it throws, or takes longer than the host waits, the switch is **refused** the same way: the row is put back,
nothing is audited, the admin sees the plugin's message. What the hook did before it failed is not undone; that is the plugin's to make safe.

### What it needs, in this workspace

A plugin that applies per workspace needs the plugins it depends on switched on **in the same workspace**, or its slots would call
a plugin that is not there. So enabling is refused until they are, and the ones missing are named; disabling is refused while a plugin
that needs it is on in the workspace, and the ones that do are named. Plugins of the platform it needs apply everywhere already; if
one of those cannot load, the registry says so and the switch is refused for that reason. If the plugin directory cannot be read,
enabling is refused (its manifest is what says what it needs), disabling stays possible.

### Two admins at once

Both switches are single writes tied to the state they expect (`enabled: false` to switch on, `enabled: true` to switch off), and the
row is created with the primary key as the referee. The second admin's call finds nothing to do and says `ok`, without an audit entry.
One narrow case is left: if the first admin's enable fails and is put back at that very moment, the second was told `ok` for a
plugin that ends up off. Its page shows the truth on the next load.

## Hooks

Three optional hooks in the SDK ([SDK](sdk.md#lifecycle-hooks)), run by `runHook` ([`lib/plugins/hooks.ts`](../../lib/plugins/hooks.ts)):

| Hook | When | Can refuse? | If it fails |
| --- | --- | --- | --- |
| `onEnable(ctx)` | after a workspace switched the plugin on, and the plugin runs there | **yes** | the switch is refused and put back |
| `onDisable(ctx)` | after a workspace switched it off | no | `{ ok: true, warning }`, audited as `hook: "failed"` |
| `onUninstall(ctx)` | after the plugin was removed | no | `{ ok: true, warning }`, audited as `hook: "failed"` |

- **Only for a plugin that is loaded in the process** (`ActivePlugin.hooks`). A plugin the platform did not approve, one that no
  workspace has switched on, one without code: nothing is woken up for a lifecycle event. So the hooks are for plugins whose code the
  platform approved; a plugin without one has nothing to run.
- **After the change, on the plugin as it ran before.** `onDisable` and `onUninstall` may be the last thing that kept the plugin
  loaded, so the running plugin is taken from the registry *before* the change and its hook runs on that, from the code that is still in
  memory. What is uninstalled or switched off must not depend on plugin code: a hook that fails or hangs is a warning, not a reason to keep it.
- **Never throws, and not forever.** A hook that throws, rejects or takes longer than 30 seconds (like `boot`) comes back as an
  outcome with one short line, no stack. JavaScript cannot stop a hook that never returns; the host only stops waiting.
- **What it gets**: `ctx.plugin`, `ctx.host`, and for `onEnable`/`onDisable` `ctx.workspace` (`id`, `name`). Frozen copies, plain values.
  No services yet; they arrive with storage and events (BARY-85, BARY-84).
- **Hooks run again.** A plugin is switched on and off and on again, so a hook has to be safe to repeat.
- **The audit entry says what happened**: `meta.hook` is `ran`, `none` or `failed` (with `hookError`).

## What is deliberately not here

- **`onInstall` and `onUpdate` hooks.** The code of a new or updated plugin is not approved when it is installed, so it must
  not run then. A plugin that wants to prepare something does it in `onEnable`, which runs once it is approved and running.
- **"Delete the plugin's data" on uninstall.** There is no storage for a plugin to have data in yet (BARY-85). Until then
  there is nothing to keep or delete.
- **Deleting files.** See [Uninstall](#uninstall).
- **Several replicas.** The registry lives in the process, so a change is seen by the replica that handled the action; the
  others catch up only when they are told. That belongs to the Helm decision (BARY-125).

## Not built yet

- **The switch per workspace on the workspace's own settings page** (BARY-64). The platform's page for these actions exists ([The plugins page](admin.md)).
- **The plugin's own settings per workspace** (`PluginWorkspace.config`, BARY-66): the actions keep what is there, nothing writes it yet.
