# Plugin system

> **Status: early.** The plugin system is being built step by step. This folder
> records what has been decided and measured so far; it is not yet a guide for
> plugin authors. Progress is tracked in the ticket BARY-48.

## What it will be

Plugins add settings, pages, board and issue views, custom fields and more to
Barynt, modelled on Nextcloud apps: a manifest per plugin, a register-then-boot
start, and an install / enable / disable / uninstall lifecycle.

- The **platform admin installs** plugins from a **store**; each **workspace
  enables** the ones it wants. Workspace admins cannot install anything.
- The store is a **Git repository** of entries (a manifest plus the download link
  and SHA-512 of a release archive). Authors submit entries by pull request; the
  merge is the review. The official store is
  [Jafoson/barynt-plugin-store](https://github.com/Jafoson/barynt-plugin-store).
  Admins can add their own stores, including private ones, by Git URL in the
  system settings.
- Everything in a store counts as **verified**; the pinned hash is what makes it
  so. A plugin without a store entry (upload, plugin directory) is blocked unless
  the platform admin allows unsigned plugins.
- Plugins load **at runtime**, without a restart and without a new image: server
  code by dynamic `import()` ([ADR 0001](adr-0001-runtime-loading.md)), UI as an
  ES module in the browser ([ADR 0002](adr-0002-client-bundles.md)).
- Custom fields and translations for plugins are part of the first release.

## Trust tiers

| Tier | What runs | Isolation |
| --- | --- | --- |
| A, declarative | Nothing; the manifest describes forms, navigation, fields | not needed |
| B, in-process | Plugin server module and client bundle in the app | none, full trust |
| C, sandbox | An iframe and/or an external service | separate origin or process |

## Documents

| Document | Contents |
| --- | --- |
| [Manifest](manifest.md) | The `barynt-plugin.json` format: every field, the rules, how to validate it, what is still open. Examples in [examples/](examples). |
| [SDK](sdk.md) | `@barynt/plugin-sdk`: how a plugin's server module is written (`definePlugin`), the two phases `register` and `boot`, what each context offers, how the host reads a module, what is still open. |
| [Compatibility](compatibility.md) | Which installed plugins can load and in what order: the `barynt` range against the host, dependencies, cycles, and the reasons a plugin is left out. |
| [Loading](loading.md) | Where plugins live on disk, how the host finds them (discovery) and runs them (the loader: register, boot, errors per plugin) and which are running (the registry: start, snapshot, the services). |
| [Lifecycle](lifecycle.md) | A plugin's life: the platform installs, updates, switches off and uninstalls it, a workspace switches it on and off, and the plugin's hooks run on these events. Where the files come from today, the rule for a plugin from no store, what is checked before a change, what a change does to the other plugins, why switching on has to end with the plugin running. |
| [Store format](store-format.md) | What a store repository contains and how the instance reads a local clone of it: the layout, the rules that are repeated because a clone is never trusted, and the catalog built from the stores that are on. |
| [The plugins page](admin.md) | Where the platform admin sees what is installed and what became of it, approves code, installs, updates, switches off and uninstalls; the pure function behind it and what is left out. |
| [The plugins of a workspace](workspace.md) | Workspace settings, Plugins: which of the platform's plugins a workspace switches on, what keeps one from running (and disables its switch), what is not passed on to a workspace admin; and the plugins' settings area (`/<workspace>/plugin/settings`). |
| [The plugins of a project](project.md) | Project settings, Plugins: the same page one level down, for the plugins that apply per project: who may, what is shown, what the switch does, what is not there yet. |
| [Release](release.md) | A plugin's release archive: what it is, why a link, a hard link or a name that leaves the directory refuses it, the hash and manifest checks before anything is written, and how it is put in place in one rename. |
| [Plugin stores](stores.md) | Which stores plugins come from: the main store on by default, others the admin can connect, who may change the list, what it means for running code. |
| [Security](security.md) | What can go wrong when a plugin runs and what stops it: why tier B code has the power of the app, the integrity check on every load, and who may run code in-process (only approved plugins from a store the platform switched on). |
| [Data model](data-model.md) | The tables (`Plugin`, `PluginWorkspace`, `PluginProject`): what each column means, what happens on delete, what is deliberately left out. |
| [ADR 0001](adr-0001-runtime-loading.md) | Can plugin server code load at runtime in the built image? Yes, with rules for the loader. |
| [ADR 0002](adr-0002-client-bundles.md) | How plugin UI loads in the browser with one shared React: import map, shims, and where the map has to live. |
| [ADR 0003](adr-0003-store-transport.md) | How a store's repository gets onto the instance: the archive of the default branch over https, no git binary, what the download refuses (nothing but the public internet), what is unpacked (only the store's own files) and the DNS rebinding gap that is left for BARY-97. |
| [spike/](spike/README.md) | The server-side experiment behind ADR 0001, reproducible with one script. |
| [spike-client/](spike-client/README.md) | The browser experiment behind ADR 0002. |
