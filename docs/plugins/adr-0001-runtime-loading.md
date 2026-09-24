# ADR 0001: Loading plugin server code at runtime

|  |  |
| --- | --- |
| Status | **Accepted** for server modules. Client code is covered by [ADR 0002](adr-0002-client-bundles.md). |
| Date | 2026-09-22 |
| Tickets | BARY-49 (spike), BARY-50 (this experiment), BARY-52 (this record) |
| Reproduce | [`spike/README.md`](spike/README.md), raw output in [`spike/run-output.txt`](spike/run-output.txt) |

## Question

Plugins are installed from a store by the platform admin and must run **without
a restart and without a new Docker image** (decision of 2026-09-21). Barynt is a
Next.js 16 app built with Turbopack and shipped as a `standalone` image that runs
`bun server.js`. Can a route handler in that built image load plugin code from a
directory at runtime?

## Answer

**Yes.** A dynamic `import()` with a variable specifier, marked
`/* turbopackIgnore: true */`, loads a plugin module from a mounted directory in
the built runner image (Bun 1.4.2). Plugins can be added while the server runs
and a plugin that throws while loading does not take the server down.

That makes the fallback we kept in reserve (running plugin server code in a
separate worker process) unnecessary *for feasibility*. It stays a candidate for
isolation (trust tier C), which this experiment does not address.

## What was tested

A throwaway route (`app/api/plugin-spike/route.ts`, kept as
[`spike/plugin-spike-route.ts.txt`](spike/plugin-spike-route.ts.txt)) imports
`<PLUGINS_DIR>/<id>/<file>` and returns what the module produced. It ran inside
the image built from the repository's own `Dockerfile` (`--target runner`),
against small fixture plugins, in three layouts:

- **A** plugins mounted at `/app/plugins`, next to the app;
- **B** plugins mounted at `/plugins`, away from the app;
- **C** like B, but the server started as `bun --no-install server.js`.

| Case | A `/app/plugins` | B `/plugins` | C `/plugins`, `--no-install` |
| --- | --- | --- | --- |
| Plain ESM `.js` | loads | loads | loads |
| TypeScript `.ts` straight from disk | loads (Bun transpiles) | loads | loads |
| Bare import of `zod` | **fails**, not in the standalone `node_modules` | loads, but **Bun downloaded it at runtime** | fails |
| Bare import of `react` | loads (it is in the standalone `node_modules`) | loads, downloaded at runtime | fails |
| Dependencies bundled into the plugin | loads | loads | loads |
| `import "@/lib/db"` (host alias) | **resolves to the host's source** (fails only on that file's own imports) | not found | not found |
| Throws while loading | error returned, server keeps running | same | same |
| Plugin added while the server runs | loads, no restart | same | same |

The same route also ran on `next dev`, which is **Node 20.20.2, not Bun**:

| Case | `next dev` (Node) |
| --- | --- |
| Plain ESM `.js` | loads |
| TypeScript `.ts` | **fails**: `Unknown file extension ".ts"` |
| Bare import of `zod` | fails (Node has no auto-install and finds no `node_modules`) |
| `import "@/lib/db"` | not found |
| Throws while loading | error returned, server keeps running |

Reloading a *changed* plugin (layout B, writable mount):

| How it is imported | Sees the edited file? |
| --- | --- |
| same specifier again | no, module cache |
| `file:///…/server.js?v=1` | **no**, Bun ignores the query on file URLs |
| `/…/server.js?v=3` (absolute path) | yes, but this is Bun-specific behaviour |
| copy in a **new directory** | yes |

Build side (three builds of the runner image):

| Build | Image size | Turbopack warnings |
| --- | --- | --- |
| `main`, without the spike route | 518 MB | none |
| spike route, no annotations | 528 MB | 2 × "Dynamic filesystem access causes tracing of the whole project" |
| spike route, `turbopackIgnore` on the `join()` and `existsSync()` calls | 519 MB | none |

The `import()` itself never produced a warning. The comment in the `Dockerfile`
that puts the image at "~460MB" is out of date; the current baseline is 518 MB.

## Decisions for the loader

1. **Import by absolute path** (`import(/* turbopackIgnore: true */ path)`), from
   a directory **outside `/app`**. Under `/app` a plugin could resolve `@/…` to the
   host's source files through `tsconfig` paths; that is accidental coupling, not a
   security boundary, but there is no reason to allow it.
2. **Annotate every dynamic filesystem or path call** in the loader with
   `/* turbopackIgnore: true */`. Without it Turbopack traces the whole project
   into the standalone output (+10 MB and a build warning).
3. **One directory per installed version, never overwritten**
   (for example `<plugins>/<id>/<version>/`). Activating an update means importing
   from the new path. Query-string cache busting is not portable, and a changed
   file at the old path is silently ignored. The old module stays in memory until
   the process restarts, so the loader must count reloads (see below).
4. **Plugins ship built JavaScript that bundles its own dependencies.** The image
   contains only the packages the build traced, and not the ones the plugin author
   expects (`zod` is missing, `react` is there by accident). Everything the host
   offers reaches a plugin through the `ctx` object, never through imports.
   TypeScript sources load under Bun but **not** under `next dev` (Node), so a
   plugin must ship JavaScript. The dev server and the production image run on
   different runtimes; anything that only works on Bun (TypeScript, the `?v=`
   query on an absolute path) must not be relied on.
5. **Start production with `bun --no-install`** (changed in the `Dockerfile` with
   this ADR). Without it, a bare import that finds no `node_modules` makes Bun
   **download the package from npm at runtime**: the experiment fetched
   `zod@4.6.5` although the host ships `4.6.0`. For plugins that is a supply-chain
   hole and makes behaviour depend on the network. The app itself starts and
   serves normally with the flag (login page 200, API 401, OAuth metadata 200).
6. **Catch errors at import time** and record them as the plugin's status; a
   broken plugin must not affect the host or other plugins.
7. **Loaded code is fully trusted.** It runs in the app's process with the app's
   privileges, so nothing here is isolation. That is trust tier B and the reason
   for the store's review and hash pinning (see [`README.md`](README.md)).

## Consequences

- The registry (BARY-54) can be built on `import()` from disk; the loader rules
  above go into its design.
- The plugin volume must be writable by the app user (uid 1000) because the store
  installs into it; that belongs to BARY-99.
- Manifests and the SDK should not promise hot reload of a plugin in place; an
  update is "install a new version, then switch".
- Server Components cannot come from a runtime plugin. Plugin UI has to be
  declarative, a client bundle or an iframe (BARY-51, BARY-98).

## Still open

- **Memory:** modules cannot be unloaded. Growth per reload has to be measured
  before we allow frequent updates.
- Client code is in [ADR 0002](adr-0002-client-bundles.md).
- Only Bun 1.4.2 on amd64 was tested, not arm64 (the image is multi-arch) and not
  other Bun versions.
- Writing into the plugin directory at runtime (permissions, `fsGroup`, read-only
  root filesystems) was not exercised; the fixtures were mounted read-only or
  read-write from the host.
