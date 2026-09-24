# Lifecycle

What a plugin goes through on the platform: installed, updated, switched off, uninstalled.
The actions are in [`features/plugins/lifecycleActions.ts`](../../features/plugins/lifecycleActions.ts);
what they read from disk is in [`features/plugins/disk.ts`](../../features/plugins/disk.ts).
This is the platform's half. Enabling a plugin per workspace, and the hooks a plugin can
run on these events, come with the second half of BARY-60 (see [Not built yet](#not-built-yet)).

Every action:

- asks for **`plugin.manage`** itself, in the platform context: a layout protects no action, and the
  first thing that happens is the permission check, so nothing is looked up for someone who may not;
- is **audited**, and tells the **registry** (`invalidatePluginRegistry()`) and the cache, so from
  the next request the plugin is or is not handed out ([Loading](loading.md#when-it-is-built-again));
- never throws for a reason the admin can act on: it returns `{ ok: true }` or `{ error }` with a sentence.
  Only a broken database or a missing permission throws.

| Action | What it does | Audit entry |
| --- | --- | --- |
| `installPlugin(id, version, { acknowledged })` | Adds the plugin that lies in the plugin directory, switched on for the platform | `plugin.installed` (marked) |
| `updatePlugin(id, version, { acknowledged })` | Moves an installed plugin to a newer version in the directory | `plugin.updated` (marked) |
| `uninstallPlugin(id)` | Removes the plugin and the workspaces' settings for it | `plugin.uninstalled` |
| `setPluginStatus(id, enabled)` | Switches the plugin on or off for the whole platform | `plugin.status.enabled`, `plugin.status.disabled` |

"Marked" is the audit log's highlight for changes that bring new files into what may run.

## Where the files come from

Nothing fetches a plugin yet: the store client is BARY-105, the transport BARY-111. So install and update
take what already lies in the plugin directory, `<dir>/<id>/<version>/` ([Loading](loading.md#where-plugins-live)).
Someone put it there, and the action registers it.

Such a plugin comes from **no store**, so its `source` is `DIRECTORY` and its `origin` is empty. **The client is never
asked where a plugin came from**: `source`, `origin`, `status` and the hash are not parameters, and a caller that passes them
anyway is ignored. Otherwise an admin, or anything that can call the action, could pass any directory off as a plugin from
the official store. When the store client exists, it will be another installer that sets `STORE` and the store's address
after it checked the entry, and these actions stay the way for a plugin from the directory.

### The rule for a plugin from no store

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

## Switching off

`setPluginStatus(id, false)` stops the plugin from loading and from being handed out, without uninstalling it: what workspaces
set for it stays. Switching on again is the reverse. Doing what is already the case changes and audits nothing. Neither direction
needs the plugin's files or the unsigned setting: switching off has to be possible whatever else is wrong.

## What is deliberately not here

- **`onInstall` and `onUpdate` hooks.** The code of a new or updated plugin is not approved when it is installed, so it must
  not run then. Hooks for switching on and off and for uninstalling come with the second half of BARY-60, and run only for a
  plugin that is loaded in the process.
- **"Delete the plugin's data" on uninstall.** There is no storage for a plugin to have data in yet (BARY-85). Until then
  there is nothing to keep or delete.
- **Deleting files.** See [Uninstall](#uninstall).
- **Several replicas.** The registry lives in the process, so a change is seen by the replica that handled the action; the
  others catch up only when they are told. That belongs to the Helm decision (BARY-125).

## Not built yet

- **Per workspace**: `enablePlugin` and `disablePlugin` (`plugin.enable`, the plugin's dependencies checked in that workspace),
  and the hooks `onEnable`, `onDisable` and `onUninstall` in the SDK (BARY-60, second part).
- **The admin page** that calls these actions and shows the warning, the hash and the reasons (BARY-63).
- **Install from a store** (BARY-105, BARY-111). It will call the same checks and set `source` and `origin` itself.
