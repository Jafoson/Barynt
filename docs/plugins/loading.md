# Loading plugins

How the host gets from a directory on disk to running plugins. Built in three steps
(BARY-59): **discovery** (this page), the **loader** and the **registry**.

> **Status: early.** Discovery and the loader are built. The registry (what is active where)
> follows, and nothing in the app calls the loader yet.

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

## The loader

[`lib/plugins/loader.ts`](../../lib/plugins/loader.ts): `loadPlugins(candidates, options)` turns
plugins found on disk into plugins that ran. It takes them **already in load order**, dependencies
first (what `resolvePlugins()` returns, see [Compatibility](compatibility.md)), and runs two phases
([SDK](sdk.md#two-phases)):

1. **Check, import and register**, for every plugin in order: check its files against the approved
   hash, find the `server` file, import it, check
   that it exports a plugin (`parsePluginModule()`), run `register(ctx)` and record what the
   plugin registered.
2. **Boot**, once every plugin has registered: run `boot(ctx)`. So no plugin's `boot` runs
   before another's `register`.

A plugin without server code (declarative, or client only) counts as loaded with no
registrations, so it can be depended on. It is still checked against its hash: its manifest and
client bundle are files the host serves.

### What it checks

| Check | Failure phase |
| --- | --- |
| the plugin's files on disk **are the ones that were approved** (the hash from install), and contain no symlink or other odd file; checked first, for every plugin, before anything of it is read or run ([Security](security.md#the-integrity-check)) | `integrity` |
| the `server` file exists, is a file, and is not a symlink that leads **out of the plugin directory** (second line of defence, the hash check refuses symlinks already) (the manifest validator keeps `..` out of the path, this is the other way to leave) | `entry` |
| importing throws or takes longer than 10 s (`importTimeoutMs`) | `import` |
| the module exports no plugin: no default export, a bare function, an unknown hook, neither `register` nor `boot` | `module` |
| `register` throws, returns a promise, or registers an id the manifest does not list under `contributes`, one under the wrong point, one twice, or a definition that is not an object | `register` |
| `boot` throws or takes longer than 30 s (`bootTimeoutMs`) | `boot` |
| a plugin it depends on did not load | `dependency` |

A violation in `register` is recorded **and** thrown, so a plugin that catches the error to carry
on is still refused afterwards. The contexts a plugin receives are frozen, and the boot context
holds exactly the five services the host passes, nothing else the factory may have returned.

### What a failure does

Every failure is caught and recorded **per plugin** with its phase and a short message (one line,
at most 300 characters, never a stack trace). Whatever the plugin had registered is thrown away.
The others carry on. A plugin whose dependency failed does not load either, however deep, and its
code is not even imported. That includes a dependency that failed in `boot`: a plugin that had
already registered is pulled back and its `boot` never runs.

The loader does not decide who may run. The registry asks [`decideExecution()`](security.md#decided-who-may-run-code-and-where)
for each installed plugin and hands the loader only those it lets through as `in-process`.

The result is `{ loaded, failed }`: `loaded` in load order with each plugin's registrations
(`{ point, id, definition }`), `failed` a map from plugin id to `{ phase, message }`. It never throws.

### What it cannot do

Plugin code runs **in the app's process with the app's privileges** (trust tier B, ADR 0001), so
none of this is isolation, and the hash check only makes sure the code is the code that was approved,
not that it is safe. Read [Security](security.md) for what that means. A timeout only stops *waiting*: code that never returns, such as
`while (true) {}` at the top of a module, still blocks the process, and JavaScript cannot stop it.
That is why plugins come from a reviewed store with a pinned hash, and why unsigned ones are
blocked by default.

## Not built yet

- **The registry**: a process-wide singleton bridged through `global` (like
  `lib/realtime/store.ts`), the real services behind `jobs`, `user` and `workspace`, and
  `getActivePlugins(workspaceId)` for server components. It is what calls the loader, and
  building it includes checking that a production build handles the dynamic import.
- **Reload** after enable and disable without a restart, as far as the module cache allows.
- **The volume** in Docker Compose and Helm (BARY-117).
