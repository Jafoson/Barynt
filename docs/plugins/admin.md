# The plugins page

Where the platform admin sees and manages plugins: **Admin, Plugins** (`/admin/plugins`), for
`plugin.manage`. It calls the actions from [Lifecycle](lifecycle.md) and the approval from
[Security](security.md#the-approval); it adds no rules of its own. Every dialog is the question and the
server is the protection: each one passes on the hash, the version and the yes it was shown, and the server
asks for the same again.

The pieces:

- [`features/plugins/overview.ts`](../../features/plugins/overview.ts): a pure function that puts the page
  together from what is installed (the database), what lies in the plugin directory (the disk) and what the
  registry says. No database, no disk, no React, so it is tested to the last case.
- [`features/plugins/queries.ts`](../../features/plugins/queries.ts): reads those three, asks for
  `plugin.manage` itself (a layout protects no query), and calls the function above.
- [`features/plugins/components/PluginsAdmin/`](../../features/plugins/components/PluginsAdmin): the page.
  Words for every state and reason are in `runtimeText.ts`; the codes come from the server so they can be translated.

## What it shows

**Installed.** One row per plugin: name and description in the admin's language (a manifest can carry one text
per language), the version, where it applies (whole platform or per workspace), whether it has code, whether it
comes from a store, and in how many workspaces it is on. A plugin that comes from **no store** carries a mark that
is meant to be seen. Then, in words, **what became of it**:

| State | Means |
| --- | --- |
| running | It is loaded; with code, the code runs in the app |
| no workspace has it on | A per-workspace plugin nobody switched on; not loaded |
| switched off | The platform's switch |
| blocked | The policy does not let it run, with the reason (not approved, store off, from no store, …) |
| failed | It was tried and failed, in which phase, with what message |
| not compatible | Its `barynt` range or a dependency does not fit; every problem is listed |
| files missing, manifest invalid | What is on disk is not usable; the issues are listed |

Under it, **the code approval**, for plugins with code: approved for exactly these files, not approved, approved
for other files (an update since), or that it cannot be approved and why. It is said once: when the state already
says "not approved", the approval line stays out.

**In the plugin directory.** Plugins that lie there and are not installed, the highest valid version of each,
with **Install**. While plugins from no store are not allowed the button is off and a note under the heading says
where to allow them.

**Cannot be used.** Versions in the directory without a valid manifest, and problems with the directory itself.

The list is read fresh on every request; nothing is cached.

## What can be done

| Action | Dialog |
| --- | --- |
| Switch on / off for the whole platform | Off asks first (it stops for every workspace); on does not |
| Approve code | The plugin, version, where it comes from, the hash, what it asks for (a promise, not a limit), what approving means, a box to tick |
| Withdraw the approval | Asks first |
| Update (a newer version lies in the plugin directory) | The warning for plugins from no store, a box; says if an approval is withdrawn by it |
| Uninstall | Asks first; says the files stay in the directory |
| Install | The warning for plugins from no store, a box; says that code from no store does not run |

What the server says when it refuses (the setting is off, the hash changed, a plugin needs another) is shown in
the dialog, in the server's words. A change that was made with a warning (a hook failed) is shown above the list.

## Deliberately not here

- **The store tab** ([BARY-106](../../docs/plugins/stores.md)): the page has no tab header yet. Install and update take what
  lies in the plugin directory; a store to fetch from is a later step.
- **"Keep or delete the data" on uninstall.** There is no storage yet (BARY-85).
- **The switch per workspace.** That belongs to the workspace's own settings (BARY-64), where a workspace admin
  switches on what the platform installed.
- **Changelog and details.** The manifest has no changelog field; the row shows what the manifest does say.

## Shared parts

`WarningBox` (`components/ui/atoms/WarningBox`) is the warning with a box to tick, and `AcknowledgeModal`
(`components/ui/layout/AcknowledgeModal`) is the dialog, a sheet on a phone, whose button stays off until the box is
ticked. The plugin stores page uses the same two for trusting a store and for allowing plugins from no store.
`SettingsList` got a `note`, text between the heading and the list.
