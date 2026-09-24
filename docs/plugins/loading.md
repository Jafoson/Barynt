# Loading plugins

How the host gets from a directory on disk to running plugins. Built in three steps
(BARY-59): **discovery**, the **loader** and the **registry**.

> **Status: early.** Discovery, the loader and the registry are built, and the registry starts
> with the server, with nothing to configure. Nothing in the app asks it for a workspace's
> plugins yet (`getActivePlugins`). A plugin with code runs in the process only with an approval
> ([Security](security.md#the-approval)); the dialog for it comes with the admin page (BARY-63).

## Where plugins live

**Nothing has to be set.** There is a default, and it lies outside the app's own directory
([ADR 0001](adr-0001-runtime-loading.md), decision 1):

| Where the app runs | The plugin directory |
| --- | --- |
| the Docker image | `/plugins`, set by the image (`BARYNT_PLUGINS_DIR` in the `Dockerfile`), owned by the unprivileged user |
| Docker Compose | the same `/plugins`, with a named volume (`orbit-plugins`), so installed plugins survive the container being replaced |
| anywhere else (`bun run dev`, a build on a server) | `~/.barynt/plugins`, under the home directory and not the working directory, because that changes with how the app is started and a rebuild wipes the one inside `.next` |
| the Helm chart | `/plugins` from the image, **not** persistent and not shared between replicas yet (BARY-117) |

A directory that does not exist yet is not a problem, it just means there are no plugins.

**`BARYNT_PLUGINS_DIR` only moves it.** An absolute path, ideally outside the app's own
directory. A relative path is refused and does **not** fall back to the default: "relative to
what" changes with where the process was started, and a value that was meant to say something
must not be quietly replaced by one that says something else. A directory that was named
and does not exist is reported, unlike the default, because someone asked for it. If there
is no home directory to put the default under (and nothing is set) plugins are off, with the
reason.

```
<the plugin directory>/
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
**every** version it finds. Discovery says when the directory itself does not exist
(`rootMissing`), which is how the registry tells a default directory that is not there yet from
one that was named and is missing.

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

## The registry

[`lib/plugins/registry.ts`](../../lib/plugins/registry.ts), wired to the database, the disk and the
real services in [`lib/plugins/host.ts`](../../lib/plugins/host.ts). It decides **once per process**
which plugins are running and keeps the answer, a *snapshot*, until something that decides it changes.

### Starting

`instrumentation.ts` starts it when the server starts, before the first request and outside any. Only on
the Node.js server, and with nothing set: with no plugins installed it reads the two plugin tables and looks
for the directory, and does nothing else. It is **not awaited**, so plugins never delay the app coming up,
and a request that needs them waits for the build that is running.

That is what makes `boot` run **once per process, outside a request**, as the SDK promises. Started from a
request instead, a plugin's `boot` would see that request's session.

### What is decided

[`planPlugins()`](../../lib/plugins/plan.ts) is pure logic on plain values (no database, no disk), so every case
is tested. For each installed plugin, in this order:

| Step | Result if it fails |
| --- | --- |
| its manifest is on disk, in the installed version, and valid | `missing`, `invalid` (with the issues) |
| `resolvePlugins()`: it can load with this Barynt and with the plugins it needs | `incompatible` (with the reasons) |
| the platform has it switched on (`Plugin.status`) | `disabled` |
| it is *wanted*: a platform plugin, or a workspace plugin that at least one workspace switched on, and whatever a wanted plugin needs | `idle` |
| `decideExecution()` lets it run ([Security](security.md#decided-who-may-run-code-and-where)) | `blocked` (with the reason) |
| the loader accepts it | `failed` (with the phase and the message) |

What is left is `loaded`, as `declarative` or `in-process`. Code nobody asked for is not run, which is why a
workspace plugin that no workspace switched on stays `idle`. A plugin the platform switched off is not loaded
even when another needs it; the one that needs it then fails in the loader with `dependency`. Where a plugin
applies (`scope`), where it came from (`source`, `origin`) and its hash come **from the database**, not from the
manifest on disk, which has not been checked against the hash when it is read.

The approval to run code comes from the database (`Plugin.codeApprovalHash`, [Security](security.md#the-approval)): a plugin
with code that is not approved for its current hash is `blocked` and **not even imported**. A plugin without code runs, and a
plugin from no store runs only if the platform allowed it ([Security](security.md#plugins-from-no-store-unsigned)), and never its code.

### One state for the whole process

Next.js can bundle a shared module separately for each layer (Server Components, Route Handlers, Server Actions,
the instrumentation hook) although they run in one process. The registry's state therefore hangs on `global`
([`registryState.ts`](../../lib/plugins/registryState.ts)), like `lib/realtime/store.ts`. This was **checked in
a production build** (`next build`, the standalone server started as the image does, with Bun): a change made from
one Route Handler and from a Server Action reached a second Route Handler, a Server Component and the instrumentation
hook's build.

### When it is built again

`invalidatePluginRegistry()` says that what decides it has changed. It is called by everything that changes which
code may run: connecting, switching and removing a store, and the setting for plugins from no store. The next request
builds again, and **nothing old is served in between**: a plugin that is no longer allowed is no longer handed out from
that moment. A change that happens while a build runs discards that build.

- **`boot` runs once per process.** A plugin that booted is registered again (that only declares) and not booted a
  second time; a new version boots. A plugin whose `boot` failed is tried again.
- **A plugin that boots after the server started** (one approved while the app runs) boots inside whichever request built the
  registry. While plugins load the services answer `null`, so it never sees that request's user or workspace. Checked in a
  production build: booted inside an admin's request, the plugin saw `user=null`, and in a later request the same services
  answered.
- **Failing closed.** A build that fails as a whole, such as the database being down, is a snapshot with no plugins and
  the reason, tried again after 10 seconds. It is never the last good snapshot: a plugin allowed a moment ago may not be
  now. (Checked: the app starts, other routes answer, the reason is in the log.)
- **What it cannot do** is stop code that already runs. A timer or a listener a plugin started in `boot` keeps going until
  the process restarts, because JavaScript cannot unload a module. The host stops *handing the plugin out*, which is what
  changes at once. Switching a store off therefore ends a plugin's use in the app, but a restart is what ends its code.
- It applies to **this process**. With several replicas each has to be told; today the app is one process.

### For a page

`getActivePlugins(workspaceId)` in [`host.ts`](../../lib/plugins/host.ts), once per request: every running platform
plugin and each running workspace plugin that workspace switched on. It waits if the registry is still building and fails
closed, an empty list, if it cannot read. It does not ask whether the user may see the workspace; the workspace layout
does that for everything under it.

### Services

[`lib/plugins/services.ts`](../../lib/plugins/services.ts), one set per plugin, frozen:

| Service | What it does |
| --- | --- |
| `user.current()` | the signed-in user (`id`, `name`) of the request, `null` outside one. Nothing else about them |
| `workspace.current()` | the workspace of the request (`id`, `name`), only for a user who may enter it, `null` otherwise and outside a request |
| `jobs.enqueue()` | rejects: background jobs do not exist yet (BARY-90). A job that never runs must not look queued |
| `storage`, `events` | no members until BARY-85 and BARY-84 |

The workspace of a request is kept in a request-scoped store that the workspace routes seed, and the services run from
another layer, with their own copy of that module. So `setCurrentWorkspaceId()` also publishes the reader of the copy that
was seeded on `global`, and the service calls that. The production build found this: without it the service answered
`null` inside a request that had a workspace.

## Not built yet

- **The approval dialog** (BARY-63): the actions exist, the page that shows the hash, the origin and what the approval means does not.
- **Calling `invalidatePluginRegistry()` for the switches per workspace** (enable, disable in a workspace; BARY-60, second
  part). The store and unsigned-plugin settings, the approval and the platform's lifecycle (install, update, uninstall,
  switching off; [Lifecycle](lifecycle.md)) call it.
- **The Helm chart's volume** (BARY-117). The chart runs two replicas by default, and the registry lives in the process,
  so plugins installed in one pod would not be in the other: a shared volume (ReadWriteMany) or another way to hand
  the plugins out has to be decided first. Until then the chart has the image's `/plugins`, which is neither persistent
  nor shared.
- **Jobs** (BARY-90), **storage** (BARY-85), **events** (BARY-84): the services exist, without members or, for jobs, an
  honest refusal.
- **A retry at start.** If the database is not reachable when the server starts, the registry is empty until a request
  that needs plugins finds it past the 10 seconds; nothing retries in the background.
- **The Node.js runtime.** The production build was checked with Bun, as the image runs it. Development (`next dev`)
  runs on Node.js, where the same code is used; that was not run against plugins.
