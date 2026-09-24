# Plugin SDK

`@barynt/plugin-sdk` is what a plugin's code imports to talk to Barynt: the shape
of a plugin, the two contexts it receives, and the version of the contract. The
host imports the same types, so both sides agree on one definition.

> **Status: early, version 0.2.0.** This is the frame: the two phases, the three
> lifecycle hooks, the names of the registration methods and services, and how the
> host reads a plugin module. What most definitions hold is still open (see [Not decided yet](#not-decided-yet)).
> The package is `private` and not published yet.

## Where it lives

[`packages/plugin-sdk/`](../../packages/plugin-sdk) in this repository, with its own
`package.json` but **not** as a workspace member: the host reaches it through a
path alias in `tsconfig.json` (`@barynt/plugin-sdk` to `packages/plugin-sdk/src/index.ts`).
That keeps `bun.lock`, the Docker build and `next build` as they were. Publishing
it to npm needs a build step (compiled JavaScript and `.d.ts`). That is not built
and has no ticket of its own yet; the reference plugins (BARY-102) are the first
that need it.

It imports nothing from the host, not even the manifest schema, so a plugin can
bundle it and nothing else comes along.

## A plugin's server module

The file named by `server` in the manifest exports a plugin as its default:

```ts
import { definePlugin } from "@barynt/plugin-sdk";

export default definePlugin({
  register(ctx) {
    ctx.registerJob("sync", { /* what a job holds is decided with BARY-90 */ });
  },
  async boot(ctx) {
    await ctx.jobs.enqueue("sync");
  },
});
```

`definePlugin` returns its argument unchanged. It exists so the editor checks the
shape, and because it does nothing at runtime, bundling it into the plugin's own
build (which [ADR 0001](adr-0001-runtime-loading.md) requires) changes nothing.

## Two phases

Modelled on Nextcloud's `register()` before `boot()`:

| | `register(ctx)` | `boot(ctx)` |
| --- | --- | --- |
| When | First, for **every** plugin | After all plugins have registered |
| Job | Declare: hand the host the code for each id the manifest lists under `contributes` | Start the plugin's work |
| May ask for data or other plugins | **No.** Not every plugin has registered yet, which is why plugin order does not matter | Yes, through the services |
| Async | **No.** The host refuses a `register` that returns a promise | Yes |

Both phases are optional, and so are the [lifecycle hooks](#lifecycle-hooks); a plugin needs at least one of the five.

### Registration context

`ctx.plugin` (`id`, `version`) and `ctx.host` (`barynt`, `sdk`) say who is running
where. One `register*` method per extension point a **server module** can fulfil.
Each takes the id from the manifest; an id the manifest does not list, or one
registered twice, is an error the host reports for that plugin.

| Method | Manifest point | Definition |
| --- | --- | --- |
| `registerSetting` | `settings` | open, BARY-66 |
| `registerPermission` | `permissions` | open |
| `registerEventListener` | `events` | open, BARY-84 |
| `registerJob` | `jobs` | open, BARY-90 |
| `registerWebhook` | `webhooks` | open |
| `registerNotification` | `notifications` | open, BARY-92 |
| `registerCustomField` | `customFields` | open, BARY-79 |

The points with a screen (`pages`, `navigation`, `views`, `issuePanels`,
`issueActions`, `dashboardWidgets`, `commands`) are **not** here on purpose. A server
module cannot hand over a React component; those points belong to the client
entry, which is defined with the slot framework (BARY-65). The list of what a server
module can fulfil is exported as `SERVER_CONTRIBUTION_POINTS`, and a test keeps it
inside the manifest's `CONTRIBUTION_POINTS`.

### Boot context

`ctx.plugin` and `ctx.host` again, plus the host's services:

| Service | What it does today |
| --- | --- |
| `ctx.jobs` | `enqueue(id, payload?)`: **rejects for now**, background jobs do not exist yet (BARY-90) |
| `ctx.user` | `current()`: the signed-in user (`id`, `name`) of the current request, or `null` |
| `ctx.workspace` | `current()`: the workspace (`id`, `name`) of the current request if the signed-in user may enter it, or `null` |
| `ctx.storage` | provisional, arrives with BARY-85 |
| `ctx.events` | provisional, arrives with BARY-84 |

`boot` runs once per process, when the server starts (`instrumentation.ts`), before the first
request and outside any. So `ctx.user` and `ctx.workspace` are **services that answer when asked**,
from inside a request, and not values fixed at boot: in `boot` itself both answer `null`, also for a plugin that boots later because
it was approved while the app runs. When the
plugins change while the app runs, a plugin that booted is registered again and **not booted a
second time** ([Loading](loading.md#the-registry)).

## Lifecycle hooks

Three more optional functions on the definition, called when the plugin's life changes ([Lifecycle](lifecycle.md#hooks)):

```ts
export default definePlugin({
  async onEnable(ctx) {
    // ctx.workspace is the workspace that switched the plugin on. Throw to refuse.
  },
  onDisable(ctx) { /* the workspace switched it off; it cannot be refused */ },
  onUninstall(ctx) { /* the platform removed the plugin; it cannot be refused */ },
});
```

| Hook | Context | Can refuse? |
| --- | --- | --- |
| `onEnable(ctx)` | `plugin`, `host`, `workspace` (`id`, `name`) | **yes**: throw, or take longer than 30 seconds, and the plugin is not switched on |
| `onDisable(ctx)` | `plugin`, `host`, `workspace` | no, a failure is a warning to the admin |
| `onUninstall(ctx)` | `plugin`, `host` | no, a failure is a warning to the admin |

- **Only for a plugin that runs in the process.** A hook is plugin code, and code the platform did not approve does not run. A plugin
  the platform has not approved, or that no workspace has switched on, is not woken up for a lifecycle event.
- **`onEnable` and `onDisable` are per workspace and only for plugins with `scope: workspace`.** A platform plugin has `boot`, and
  `onUninstall`.
- **They can run again.** A plugin is switched on, off and on again, in as many workspaces as there are, so a hook has to be safe to repeat.
- **The context is plain values**, frozen copies. Services (storage, events) arrive with their tickets and will be added to it.
- **There is no `onInstall` and no `onUpdate`.** The code of a plugin that was just installed or updated is not approved to run yet,
  so nothing of it can be called then. Prepare in `onEnable`, which runs once the plugin runs.

## How the host reads a plugin module

`parsePluginModule()` in [`lib/plugins/definition.ts`](../../lib/plugins/definition.ts)
takes what `import(serverFile)` returned and finds the plugin in it. The module is
plugin code the host does not control, so like the manifest validator it reports
every problem and never throws, even for a module made of throwing getters.

```
no default export: write `export default definePlugin({ register, boot })`
the default export is a function: wrap it as `definePlugin({ register })`
bot: is not a known hook (use register, boot, onEnable, onDisable or onUninstall)
boot: must be a function
the plugin defines no hook (register, boot, onEnable, onDisable or onUninstall)
```

Unknown hooks are an error for the same reason unknown manifest fields are: a typo
such as `bot` would otherwise silently do nothing. Other named exports of the module
are ignored; only the default counts.

## Not decided yet

Left open because the ticket that builds the feature decides it:

- **What most definitions hold.** Each is `Readonly<Record<string, unknown>>` until
  its ticket (see the table above). Making one stricter before 1.0 is allowed.
- **The client entry**: `defineClientPlugin`, the registration of screens, the
  context hooks (`useHostContext`), toast, navigation and the UI kit (BARY-65).
  The SDK will export `version` and the hooks at runtime through
  `globalThis.__BARYNT__.sdk`, re-exported by a shim module ([ADR 0002](adr-0002-client-bundles.md)).
- **Services in the hook contexts** (storage, events), when those exist (BARY-85, BARY-84).
- **`storage` and `events`** on the boot context (BARY-85, BARY-84).
- **Publishing** the package to npm.

The ticket text for BARY-90 says `ctx.jobs.register`. Here a job is declared with
`registerJob` in the registration phase instead, so that everything a plugin
declares sits in one place and `ctx.jobs` only has to queue work.

## Stability

`SDK_VERSION` follows SemVer and the host reports it as `ctx.host.sdk`. Before 1.0
anything may change. From 1.0 on only additive changes: a name is removed only
after it has been deprecated for at least one release. A test keeps `SDK_VERSION`
equal to the version in `packages/plugin-sdk/package.json`.
