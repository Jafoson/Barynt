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
| Update from the store (on the store page) | The store, the new and the installed version, **what the new version asks for in addition** (set apart) and everything it asks for, that the approval of the installed files does not carry over (for a plugin with code), that the old files stay so it can be undone, a box to tick |
| Go back to the version before the last update | Asks first: the files are checked against the ones that were replaced, the approval does not come back, the version installed now stays on disk. For a plugin from no store it is the warning for those plugins, a box, as for an update |
| Uninstall | Asks first; says the files stay in the directory |
| Install | The warning for plugins from no store, a box; says that code from no store does not run |

What the server says when it refuses (the setting is off, the hash changed, a plugin needs another) is shown in
the dialog, in the server's words. A change that was made with a warning (a hook failed) is shown above the list.

## The store

**Admin, Plugins, Store** (`/admin/plugins/store`), reached by the tabs on both pages. It is built after the store pages of the apps people
know: a hero with the search, category chips with counts, a switch between *Discover* and *Installed*, a shelf of the most recently released
plugins (the first big, with a picture of it joining Barynt), and a card for each plugin with its icon, name, author, description, where it
applies, whether it has code, and one thing to do: install, update, or a reason it cannot be installed (already installed, every version
withdrawn, not compatible with this Barynt). A card opens the plugin's details: description, store, version, licence, what it works with,
links, what it asks for (a promise, not a limit), every version with its date, changelog and, if withdrawn, why.

- **It shows what the stores that are on list**, read from their local clones ([Store format](store-format.md)). A store that has not been
  fetched, cannot be read, or has entries that cannot be used says so above the list; it never looks like a store with nothing in it.
- **Each store has a row under the search**: its name, when it was last fetched ("Updated 3h ago", or "Not fetched yet") and an *Update*
  button that fetches it now. A store that could not be updated says so, with the server's reason, and that what is shown is the state from
  before ("Acme could not be updated. Showing what was fetched 3h ago. The server answered 404."). Opening the page fetches a store that was
  never fetched (and waits for it, up to 15 seconds), and one whose state is older than six hours after the page is sent
  ([how it is kept up to date](store-format.md#keeping-the-clone-up-to-date)). For development, `bun run plugins:dev-store` writes a sample
  store into `<plugins>/.stores/` and connects it (`--remove` takes it away again); its address does not exist, so fetching it fails and says so.
- **Installing** opens the consent (what it is, what it asks for, that installing switches nothing on and that code waits for approval)
  and calls `installStorePlugin` ([Lifecycle](lifecycle.md#where-the-files-come-from)): the release is downloaded, checked against the hash and the manifest the store pins and lists, and installed; the plugin then shows as installed, and its code, if it has any, waits for approval on the plugins page. An error (the store withdrew it, the hash does not match, ...) is shown in the dialog in the server's words. A plugin that is installed and has a newer version in **the store it came from** has an *Update to X* button instead: it opens the consent for an update (`UpdateFromStoreModal`) and calls `updateStorePlugin`, which names no store ([Lifecycle](lifecycle.md#update-from-a-store)). What the new version asks for **in addition** is set apart: the catalog compares the store's manifest with the manifest of the installed files (`installed.addedCapabilities`; everything counts as new when the installed files cannot be read).
- **The plugins page points at an update in the store** with a link on the plugin's row ("Update to X in the store") to the store page with the plugin already searched (`?q=<id>`). It is only a pointer: the update is made where its consent is. Only an update that fits this Barynt is pointed at.
- **A plugin that was updated (or rolled back) has a *Go back to X* button** on the plugins page, where X is the version before (`Plugin.previousVersion`). It calls `rollbackPlugin` after a question (a plugin from a store) or the warning for plugins from no store. A workspace's pages know nothing of updates or of going back: they are the platform's.
- **Icons** are made from the name (its first letters on a colour that is the same for the same id): the catalog reads no files of the
  plugin, so it has no picture. **Ratings, download counts and prices** do not exist in a store entry and are not shown.
- **The shelf is "new and updated"**, not "recommended": a store entry has no such flag, so the most recently released compatible plugins go on top
  (only when there are at least four).

### Who gets the store

On **Admin, Plugin stores**, three switches under *Where the store is shown* (`SystemSettings`, [Data model](data-model.md)):

| Setting | Default | Means |
| --- | --- | --- |
| Show the store in workspaces | on | Workspace admins can add plugins from the stores that are on, without asking |
| Show the store in projects | on | The same for project admins |
| Only show plugins I released | off | Where the store is shown, only the plugins the admin released for it |

Open by default, so the admin has to decide nothing. Releasing is done in the store, on a plugin's details (*Released for workspaces
and projects*), per store and plugin, and it counts only while *only released* is on; the choice is kept when it is off. Each change is
audited (`plugin.store.visibility`, `plugin.store.curated`, `plugin.store.uncurated`). **What this does not change:** approving a plugin's
code stays with `plugin.manage`, for the exact files, whoever added the plugin ([Security](security.md#the-approval)). The store for a workspace is
[its own page](workspace.md#the-store-of-a-workspace); the store for projects is a later step.

## Deliberately not here

- **Updating everything at once.** Each update is its own consent: what a new version asks for is read by a person, plugin by plugin. Install and update on the first tab take what lies in the plugin directory.
- **"Keep or delete the data" on uninstall.** There is no storage yet (BARY-85).
- **The switch per workspace.** That is the workspace's own settings page ([The plugins of a workspace](workspace.md)), where a workspace admin
  switches on what the platform installed.
- **Changelog and details.** The manifest has no changelog field; the row shows what the manifest does say.

## Shared parts

`WarningBox` (`components/ui/atoms/WarningBox`) is the warning with a box to tick, and `AcknowledgeModal`
(`components/ui/layout/AcknowledgeModal`) is the dialog, a sheet on a phone, whose button stays off until the box is
ticked. The plugin stores page uses the same two for trusting a store and for allowing plugins from no store.
`SettingsList` got a `note`, text between the heading and the list.
