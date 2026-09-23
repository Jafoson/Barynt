# Loading plugins

How the host gets from a directory on disk to running plugins. Built in three steps
(BARY-59): **discovery** (this page), the **loader** and the **registry**.

> **Status: early.** Only discovery is built. The loader (importing the modules, running
> `register` and `boot`, isolating errors) and the registry (what is active where) follow.

## Where plugins live

The directory named by **`BARYNT_PLUGINS_DIR`**, an absolute path. It should lie outside
the app's own directory ([ADR 0001](adr-0001-runtime-loading.md), decision 1); that is not
enforced, only the absolute path is. Without the variable plugins are off and the app runs
as before; a relative path is refused, because "relative to what" changes with where the
process was started.

```
<BARYNT_PLUGINS_DIR>/
  calendar-view/
    1.0.0/
      barynt-plugin.json
      server.js
      client.js
    1.1.0/
      …
```

One directory per installed version, never overwritten: activating an update means
importing from the new path (ADR 0001, decision 3). Which version is the active one is
the database's answer (`Plugin.version`, see [Data model](data-model.md)); discovery lists
**every** version it finds. The Docker image and the Helm chart have no volume for this
directory yet (BARY-117).

## Discovery

[`lib/plugins/discovery.ts`](../../lib/plugins/discovery.ts): `discoverPlugins(dir)` reads
`<id>/<version>/barynt-plugin.json` for everything under the directory and validates each
manifest ([Manifest](manifest.md)). It runs no plugin code and knows nothing about the
database: what is *installed* is a different question from what is *lying there*.

Everything in the directory is outside the host's control, so discovery **never throws**.
It reports what is wrong and still finds the rest; one broken plugin never hides another.

| What it finds | What happens |
| --- | --- |
| a directory `<id>` with a valid plugin id and inside it `<version>` directories with valid versions | read, listed, sorted by id and then by SemVer (so `1.9.0` before `1.10.0`) |
| an entry starting with `.` or `_` | ignored without a word: staging areas and switched-off plugins |
| a plain file, such as a README | ignored |
| a directory whose name is not a valid id or version (`Foo`, `core`, `v1.0`) | reported: it is probably a plugin in the wrong place |
| a **symlink** for a plugin or a version | reported and **not followed** |
| a missing manifest, broken JSON, an invalid manifest | the plugin is listed as not ok, with the issues named by field |
| a manifest larger than 256 KiB, a manifest that is a directory or a symlink | refused without being read |
| a manifest whose `id` or `version` differs from its directory | refused: the host trusts the directory names for paths, so a manifest must not claim another |
| an unreadable directory | reported with the error code only (`ENOENT`, `EACCES`), never the message, which can repeat the path |

The result is `{ plugins, issues }`: each plugin is `{ id, version, dir, ok: true, manifest }`
or `{ id, version, dir, ok: false, issues }`, and `issues` holds the problems with entries that
are no plugin at all.

Every filesystem call with a variable path carries `/* turbopackIgnore: true */`; without it
Turbopack traces the whole project into the standalone output (ADR 0001, decision 2).

## Not built yet

- **The loader**: importing `server.js` by absolute path, `parsePluginModule()`, running
  `register` then `boot` with the contexts from the [SDK](sdk.md), and recording an error
  per plugin instead of failing the app.
- **The registry**: a process-wide singleton bridged through `global` (like
  `lib/realtime/store.ts`), and `getActivePlugins(workspaceId)` for server components.
- **Reload** after enable and disable without a restart, as far as the module cache allows.
- **The volume** in Docker Compose and Helm (BARY-117).
