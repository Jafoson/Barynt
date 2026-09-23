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
| [Data model](data-model.md) | The two tables (`Plugin`, `PluginWorkspace`): what each column means, what happens on delete, what is deliberately left out. |
| [ADR 0001](adr-0001-runtime-loading.md) | Can plugin server code load at runtime in the built image? Yes, with rules for the loader. |
| [ADR 0002](adr-0002-client-bundles.md) | How plugin UI loads in the browser with one shared React: import map, shims, and where the map has to live. |
| [spike/](spike/README.md) | The server-side experiment behind ADR 0001, reproducible with one script. |
| [spike-client/](spike-client/README.md) | The browser experiment behind ADR 0002. |
