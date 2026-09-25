@AGENTS.md

# Barynt — Project Conventions

## Stack

- **Next.js 16** (App Router) with TypeScript
- **React 19** — Server Components are the default
- **Biome** for linting and formatting (no ESLint, no Prettier)
- **SCSS** (sass) for styles — no Tailwind
- **PostgreSQL** via **Prisma** (Prisma 7, `prisma.config.ts` instead of `schema.prisma` as the entry point)

## Next.js 16 — Breaking Changes (important!)

This version deviates from older Next.js versions. Always read `node_modules/next/dist/docs/` before writing code.

- `params` and `searchParams` in pages/layouts are now **Promises** → always await them:
  ```ts
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
  }
  ```
- Data mutations use **Server Functions** (`'use server'`), not API routes
- No `getServerSideProps` / `getStaticProps` — everything goes through `async` Server Components and Server Functions

## Component Architecture

### Separating business logic from UI

Every feature component is split into two parts:

```
components/
  issues/
    IssueList.tsx        ← Server Component: data fetching, logic
    IssueList.module.scss
    IssueListView.tsx    ← UI rendering (can be "use client" if needed)
    IssueCard.tsx        ← Reusable sub-component
    IssueCard.module.scss
```

- `*View.tsx` or `*UI.tsx` = pure rendering, no business logic
- Server Components fetch data and pass it down as props
- Client Components (`'use client'`) only for interactivity (onClick, onChange, browser APIs)

### Reuse

- Keep components modular — prefer reusing a component over duplicating it
- Put shared UI in `components/ui/`

## Styling

- **SCSS Modules** (`.module.scss`) for component styles
- **Global styles** in `app/globals.css` or `app/globals.scss`
- Implement appearance changes **always in CSS/SCSS**, not in JavaScript
- Actively use CSS features: `:before`, `:after`, CSS custom properties, `:is()`, `:has()`
- No inline styles for appearance (only for genuinely dynamic values like computed positions)

## React Rules

- **Prefer server rendering** — `async` Server Components are the default
- Minimize `useEffect` — only when no server-side approach is possible
- Only use `useMemo` / `useCallback` for a proven performance problem
- Keep state as close as possible to where it's used, don't lift it globally when avoidable
- Forms via `<form action={serverAction}>` instead of `onSubmit` + fetch

## Responsive / mobile (BARY-36)

The desktop layout is the base; the mixins in `styles/breakpoints.scss` reach
*down* (`@use "breakpoints" as bp;`). Test widths: 375 / 768 / 1280px.

| Mixin | Applies | JS twin (`lib/utils/useMediaQuery`) |
|---|---|---|
| `bp.phone` | ≤ 640px | `PHONE_QUERY` |
| `bp.tablet-down` | ≤ 1024px (phone + tablet) | `COMPACT_QUERY` |
| `bp.tablet-only`, `bp.desktop`, `bp.rail` | tablet / > 1024px / collapsed icon rail | — |
| `bp.coarse`, `bp.no-hover` | touch / no hover (input capability, not width) | — |

- **Layout in CSS, behavior in JS.** Width-only differences belong in SCSS;
  `useMediaQuery` is for behavior that has to differ (sheet vs. dialog, one
  column of a matrix). It is `false` on the server and during hydration.
- **Sheet on a phone, dialog from a tablet up.** Creation and edit windows are
  one component with a `sheet` prop (`Modal variant="sheet"` +
  `SheetHeader` + `useSwipeToClose`, no "Cancel", no `autoFocus` so the
  keyboard doesn't open); the opener passes `{ placement: "bottom" }` on a
  phone. Where several places open the same window, a hook owns the choice
  (`useOpenCreateProject`, `useOpenLabelModal`).
- **Tables as card rows.** `styles/card-rows.scss`: `card-rows` (phone or
  `$upTo: tablet`) turns rows into wrapping flex cards — each cell is found by
  its column id (`td[data-col="…"]`), the page only sets `order` and
  `flex: 1 1 100%`. Give the label `flex: 1 1 calc(100% - 6.5rem)` to keep
  the actions on its line; `flex: 1 1 0` fits *everything* on one line.
  `setting-rows` stacks a settings card's control under its text by the
  page's own width (container query, so a tablet's narrow panel counts too).
  `page-scroll-lists` makes the page scroll instead of each `fill` table
  (two lists in strips cut rows off).
- **Column-per-role matrices** show one column at a time on a phone/tablet
  (`PermissionMatrix`); wide controls (`SegmentedControl`) scroll sideways.
- **Settings** are a section list on a phone; a section is its own screen
  (`SettingsBody`, `?open` marks the start page as a page, not the list).
- **Shortcuts only with a keyboard.** `lib/shortcuts/useHasKeyboard`
  (a mouse/trackpad, or a physical keypress seen this session);
  `Shortcut` renders nothing without one. Don't hard-code shortcut hints.
- A flex column that scrolls needs `& > * { flex: none }`: a child with its
  own `overflow` has no minimum height there and is squeezed to its scrollbar.
- Touch targets: `--touch-min` (44px); safe areas: `--safe-*`; keyboard:
  `--kb-inset`.

## Rich Text (descriptions and comments)

`Issue.description` and `Comment.body` are **ProseMirror documents** (`Json`),
not strings. Reading and writing are separate:

| | Component | Environment |
|---|---|---|
| Display | `components/ui/atoms/RichText` | Server Component, **no** dependency |
| Edit | `components/ui/atoms/RichTextEditor` | `"use client"`, Tiptap, via `next/dynamic` |

- Display translates the JSON to React by hand — no `generateHTML`, no
  `dangerouslySetInnerHTML`. Whoever adds a node type there must ship the
  matching extension in the editor (and vice versa).
- The editor is never imported directly, only via `next/dynamic` with
  `ssr: false` — otherwise its bundle would also end up on the read path.
- Domain suggestion data (`@` members, `#` issues) comes in as props.
  `components/ui` knows nothing about workspaces or Prisma; the bridge is
  `features/issues/components/IssueRichText`.
- Next to every document column sits a derived text column
  (`descriptionText`, `bodyText`) for search — `contains` doesn't work on
  `Json`. It's freshly set from `toPlainText(doc)` in
  `features/issues/actions.ts` on **every** write.
- `lib/richtext/` has no dependencies and runs everywhere (tests, seed,
  scripts): `toDoc`/`isEmptyDoc` (input from the DB), `toPlainText`/`toPreview`
  (search, previews), `fromMarkdown` (seed and one-off migration).

## Icons (`@iconify/react`)

Icons are `<Icon icon="lucide:name" />` — but they don't load from
`api.iconify.design` at runtime. `lib/icons/bundle.generated.ts` holds the
icons the app uses (cut from the `@iconify-json/*` devDependencies) and
`lib/icons/IconBundle.tsx`, mounted in the root layout, registers them
before anything renders. Otherwise an ad blocker, a proxy or an outage
leaves every icon empty (BARY-45).

- **Add or remove an icon → `bun run icons:build`** and commit the generated
  file. `tests/unit/ui/iconBundle.test.ts` (and `bun run icons:check`) fail
  while it's out of date. A missing icon isn't broken — it falls back to the
  API — but it quietly reintroduces the runtime dependency.
- The scan (`scripts/build-icons.ts`) reads string literals `"prefix:name"`
  from `app/`, `components/`, `features/`, `lib/`. Write icon names as
  literals; a name assembled at runtime isn't seen and always hits the API.
- A new icon *set* (a prefix other than lucide/logos/material-symbols/mdi)
  needs its `@iconify-json/<prefix>` as a devDependency.

## Plugins (`lib/plugins`)

The plugin system is built step by step; `docs/plugins/` records what is decided
and measured (start at `docs/plugins/README.md`).

- `lib/plugins/manifest.ts` is the single source of truth for the plugin manifest
  (`barynt-plugin.json`): a zod schema with no database, `server-only` or React,
  so the host, tests and tooling all read the same one. `lib/plugins/validate.ts`
  turns it into `validateManifest()` / `parseManifest()`, which report one issue
  per problem and **never throw**: a manifest is untrusted input.
- **Where a plugin applies** (`scope`: `workspace`, `project`, `platform`; `Plugin.scope` `WORKSPACE`, `PROJECT`, `PLATFORM`) is decided through
  `lib/plugins/scope.ts` (`rowScopeOf`, `manifestScopeOf`, `dependencyScopeFits`), never by `=== "platform" ? … : "workspace"`: with three scopes
  "not platform" is not one thing. **Decide by what a plugin is, not by what it is not** (`scope === "WORKSPACE"`, not `scope !== "PLATFORM"`), so a plugin
  of another level is never taken for this one. A plugin may lean on plugins for the whole platform and on those of its own level; an update or a rollback
  cannot change the scope. A workspace's pages and actions know only `WORKSPACE` and `PLATFORM` plugins; `PROJECT` ones are a project's.
  `plugin.enable` is grantable in a workspace and in a project (the role says where, like `label.create`); `project_admin` has it.
- **A plugin's settings** are declared in `contributes.settings` (`text`, `textarea`, `number`, `boolean`, `select`; a strict schema in `manifest.ts`, no secrets, no regular
  expressions) and read and checked only through `lib/plugins/settings.ts` (`validateSettings` for what someone saves: unknown keys are refused, only what differs from the
  default is kept; `resolveSettings` for what is read: a stored value that no longer fits falls back to the default; `toFields` for the form). A value is data, never code.
  **A plugin reads its own settings** through `ctx.settings` (`current()`, `ofProject(projectId)`; SDK 0.4.0, `createSettingsService` in `lib/plugins/services.ts`): the host's resolved values
  (`resolveSettings`, never a stored value the definition refuses), read again on each call, `null` for every "nothing to read here" (outside a request, plugin off, the person may not
  see the workspace or project, a plugin of another level), and the definitions come from the manifest that was loaded (`options.services(info, manifest)`).
  **Saved by three actions, one per level** (`features/plugins/settingsActions.ts`: `savePlatformPluginSettings` `plugin.manage`, `saveWorkspacePluginSettings` and
  `saveProjectPluginSettings` `plugin.enable` there; `Plugin.config`, `PluginWorkspace.config`, `PluginProject.config`): the level is the plugin's scope, the definition is read
  from the installed files (never from the client), a workspace's or project's plugin has to be on there, the values are the whole form, and the audit entry
  (`plugin.settings.changed`) names the changed keys, **never the values**. The registry is not told: settings decide neither code nor dependencies.
  **The form** is one form for all three levels (`features/plugins/components/PluginSettings/`: `usePluginSettingsForm` = state and save, `SettingsFields` = rendering,
  `formState.ts` = the pure conversions and `saveForm`). It is a **page** for a workspace's and a project's plugins and a **window** for the platform's
  (`PluginSettingsPage` / `PluginSettingsModal`, the latter opened by `useOpenPluginSettings`: a dialog from a tablet up, a sheet on a phone).
  A yes/no is a checkbox there, not a `Switch` (it takes effect with Save); an empty box means the default, so a setting with one is never "required"
  (`mustFill`); Save is a `type="submit"` button of the form, so the browser checks its limits first. New form controls are the atoms `Field`, `Textarea` and
  `Select` (`components/ui/atoms`), and `Input` has the `email` and `url` variants.
  **The plugins' settings are their own area of the settings** (`/<workspace>/plugin/settings[/<pluginId>[/<projectSlug>]]`, `pluginSettingsPath` in `lib/nav.ts`): the
  fourth choice of the switcher (`SettingsScopeKey` `"plugin"`), offered to whoever holds `plugin.enable` in the workspace **or in a project of it** (`canOpenPluginSettings`,
  resolved by each of the four settings layouts). It shows what **this person** may set up: `getPluginSettingsArea` asks `plugin.enable` in the workspace for the workspace's
  own plugins and `projectIdsWith` (`lib/permissions.ts`, all projects at once, the same rules as the resolver) for a project's, and returns `null` (a 404) for someone who may
  set nothing up. What it shows is `settingsAreaOf` (pure); `pluginPageOf`/`projectPageOf` decide what an address shows, and a plugin that is off, has no settings, is not the
  person's to set up or does not exist is a 404, never an empty form. The rows of its navigation are `settingsNavItems` (`SettingsNavItem.activeHref` = `<href>/*` for a row whose
  pages have pages beneath it). A link that should look like a button is a `LinkButton` (`buttonClassName` is shared with `Button`), never a `Button` that navigates.
- Change the manifest schema → **`bun run plugin-schema:build`** and commit
  `public/schemas/barynt-plugin.schema.json`. `tests/unit/plugins` (and
  `bun run plugin-schema:check`) fail while it is out of date.
- `packages/plugin-sdk` (`@barynt/plugin-sdk`) is what plugin authors and the host
  both import: `definePlugin`, `RegistrationContext`, `BootContext`, the hook contexts, `SDK_VERSION`.
  It is **not** a Bun workspace: `tsconfig.json` maps the name to its `src/index.ts`,
  which keeps `bun.lock` and the Docker build untouched. It must import nothing
  from the host, because a plugin bundles it. Change its version in `SDK_VERSION`
  **and** `package.json` (a test compares them). A plugin's server module is read
  with `parsePluginModule()` (`lib/plugins/definition.ts`), which never throws.
- `lib/plugins/resolve.ts` decides which installed plugins can load and in what
  order (`barynt` range against `BARYNT_VERSION` from `lib/version.ts`, i.e.
  `package.json`; dependencies, their scope, cycles). A plugin that cannot load comes back with
  reasons as codes, which the admin UI turns into text. The registry asks it on
  start, install/update (`previewInstall`) and uninstall (`previewUninstall`).
- Plugin code is loaded at runtime, so the loader rules in
  `docs/plugins/adr-0001-runtime-loading.md` and `adr-0002-client-bundles.md`
  apply to anything that imports plugin code (absolute path outside `/app`,
  `/* turbopackIgnore: true */` on dynamic fs/path calls, one directory per
  version, built JavaScript only).
- `docs/` is excluded from `tsconfig.json`: fixtures and examples there may import
  packages that only exist at runtime.
- Two permissions govern plugins (`docs/rbac.md`): **`plugin.manage`** (PLATFORM,
  `platform_admin`: store, install, update, uninstall, allow unsigned plugins) and
  **`plugin.enable`** (WORKSPACE, `owner` and `admin`: enable, disable, configure).
  Installing is a platform matter, so neither key is grantable at the other level.
  Production and Helm provision new permissions on every deploy (`prisma/bootstrap.ts`);
  on an existing dev database run the `provisionSystemRbac` snippet from "New
  permission" below.
- Plugins are read from a directory with a **default**, so nothing has to be set: `/plugins` in the image (a volume in
  Compose), `~/.barynt/plugins` elsewhere; a default that does not exist is fine. `BARYNT_PLUGINS_DIR` only *moves* it
  (absolute path, ideally outside the app directory; a relative one is refused, not ignored):
  `<dir>/<id>/<version>/barynt-plugin.json`. `lib/plugins/discovery.ts` lists
  and checks them and **never throws**: the directory is outside the host's control
  (symlinks are not followed, names and manifests are validated). Every fs call with a
  variable path needs `/* turbopackIgnore: true */` (ADR 0001). `lib/plugins/loader.ts`
  imports the server modules and runs `register` for all plugins, then `boot`; a failing
  plugin is recorded with its phase and dropped, never thrown, and its dependents do not
  load. It is not isolation: plugin code runs in the process. Before anything of a plugin
  is read or run, `lib/plugins/integrity.ts` checks its directory against the hash approved at
  install (`Plugin.integrity`): no hash, no load; a symlink or odd file inside is refused.
  Read `docs/plugins/security.md` before touching any of this: tier B code has the power of the
  app, and capabilities are not a fence for it. **Who may run code in-process is decided by
  `lib/plugins/policy.ts` (`decideExecution(input, activeStores, { allowUnsigned })`): only a plugin with code from a
  store the platform switched on (the official one by default) that the platform approved for its
  exact hash; everything else with `server` or `client` is blocked, and any doubt, a missing or empty
  store list included, means blocked.** The loader is only ever given plugins that policy lets through.
  A plugin from no store (`source` is not `STORE`) is unsigned: not loaded at all unless
  `SystemSettings.allowUnsignedPlugins` is `true` (`lib/plugins/unsigned.ts`, fails closed, off by default), and even then
  only one without code runs; one with code stays blocked, unreviewed code does not run in the process. Switching the
  setting on needs the warning's tick, which `setAllowUnsignedPlugins` checks on the **server** (`plugin.manage`, audited),
  and installing or updating a plugin from no store has to ask for it again every time (`installPlugin`/`updatePlugin` check it
  on the server; an address entered by hand, BARY-111, is built to the same rule).
- **The platform's lifecycle** (`features/plugins/lifecycleActions.ts`: `installPlugin`, `updatePlugin`, `uninstallPlugin`,
  `setPluginStatus`; `docs/plugins/lifecycle.md`) installs what lies in the plugin directory, as `source` `DIRECTORY`: **the client
  never says where a plugin came from**, and `source`, `origin`, `status` and the hash are not parameters. `disk.ts` reads the
  directory (hash twice, valid manifest, `previewInstall`/`previewUninstall` before any change). Install approves no code, an update
  withdraws the approval of the old version, uninstall leaves the files, and none of them runs plugin code (no `onInstall`).
  A workspace switches a per-workspace plugin on and off with `enablePlugin`/`disablePlugin`
  (`features/plugins/workspaceActions.ts`, `plugin.enable`): **switching on has to end with the plugin running there**, otherwise
  the row is put back and the reason given; `onEnable` may refuse, `onDisable` and `onUninstall` cannot (a failure is a `warning`).
  Hooks (`lib/plugins/hooks.ts`) run only for a plugin loaded in the process, on the plugin as it ran *before* the change.
  A **project** switches on its own plugins (`scope: project`) with `enablePluginInProject`/`disablePluginInProject` (`features/plugins/projectActions.ts`,
  `plugin.enable` **in that project**, hooks `onProjectEnable` (may refuse) and `onProjectDisable`, SDK 0.3.0): the workspace's rules one level down.
- **A store's clone is data, never code, never trusted** (`lib/plugins/store/`, `docs/plugins/store-format.md`): `readStoreDirectory` only parses JSON
  with the schemas in `format.ts`, follows no symlink (`O_NOFOLLOW`), limits every file and the number of entries, and checks id, manifest and
  versions against each other; `buildCatalog` (pure) makes one entry per store and plugin, offers the highest version that is not revoked, and an
  update only from the store the plugin came from. The clone lives in `<plugins>/.stores/<name>` (`storeCloneDir`), where discovery does not look.
  **It gets there as the archive of the default branch over https, not with git** (`transport.ts`, `docs/plugins/adr-0003-store-transport.md`):
  everything downloaded goes through `safeDownload` (`fetch.ts`: https only, every address a name resolves to must be public per `address.ts`,
  every redirect checked, size and time limited, **a token goes only to the host it was given for**, never in an address or an error), our own
  `readTar` (`tar.ts`) reads it, and `unpackStoreArchive` (`archive.ts`) writes **only** `store.json` and each plugin's `barynt-plugin.json` and
  `source.json`. New code that fetches from an address someone else wrote uses `safeDownload`, never `fetch` directly. Known gap: DNS rebinding
  (needs the egress rules, BARY-97). **A clone is brought up to date by `syncStoreClone` (`sync.ts`)**: unpack into `.stores/.tmp-*`, read it as a store, and only
  then move it into place, so any failure leaves the old clone as it was; how it went is on the store's row (`syncedAt`, `syncAttemptedAt`, `syncError`) and the
  store page says so (`StoreSync`). `features/plugins/storeSync.ts` opens the sealed token and is what `syncPluginStores` (the button, `plugin.manage`) and opening the page
  (`refreshStoresForPage`: a never-fetched store is waited for, an old one is fetched after the page is sent) call; `BARYNT_STORE_AUTO_SYNC` and
  `BARYNT_STORE_MAX_AGE_HOURS` are read by `syncPolicy.ts`.
  **A plugin's release** (`docs/plugins/release.md`) is checked by `verifyRelease` (`stageRelease.ts`, writes nothing: download with `safeDownload` and **no
  credentials**, the SHA-512 the store pinned *before* anything is read, `readRelease`/`planRelease` in `release.ts` with `tar.ts` and `zip.ts`, the manifest equal
  to the store's) and put in place by `placeRelease` (`.staging/release-*`, hashed like an installed plugin, one rename, never over what is there). A release,
  unlike a store's archive, **refuses the whole archive** for a link, a bad name, a duplicate or anything over the limits of `hashPluginDirectory`; only the version
  the store describes (the manifest's) is offered.
- **The plugin store page** (`/admin/plugins/store`): `buildCatalog` output plus `features/plugins/storeView.ts` (search, categories, featured, avatars: pure) in
  `features/plugins/components/PluginStore/`. **Who gets the store** is `SystemSettings.pluginStoreInWorkspaces/InProjects/CuratedOnly` (open by default;
  `getStoreVisibility()` fails **closed**) plus `PluginStoreCurated` (a plugin of a store the admin released). Adding a plugin never changes who approves its
  code (`plugin.manage`). `installStorePlugin` (`storeActions.ts`, the work in `storeInstall.ts`) reads the entry from the store's clone itself, checks everything that needs no download before downloading, then `verifyRelease`/`placeRelease`, and sets `source` `STORE` and `origin` from the store's row: **the client passes no store address, hash or source**. Installing approves no code. **Updating** (`updateStorePlugin` → `updateFromStore`) finds the store from the row's `origin` (`normalizeStoreUrl`), never from the client, offers only a newer, listed, not withdrawn version the store describes and the same scope, runs the same `verifyRelease`/`placeRelease`, keeps the replaced files and their hash on the row (`Plugin.previousVersion/previousIntegrity`) and withdraws the code approval. **`rollbackPlugin`** goes back to those files only if they still hash to `previousIntegrity`, refuses a version the plugin's store withdrew (`storeWithdrawn.ts`, any doubt allows it), withdraws the approval, and swaps the two so it can be undone. `bun run plugins:dev-store` writes a sample store clone for development.
- **The plugins page** (`/admin/plugins`, `docs/plugins/admin.md`): `features/plugins/overview.ts` is a pure function that puts the
  page together from the rows, the plugin directory and the registry (states and approval as codes; the words are in
  `PluginsAdmin/runtimeText.ts`, so they are translated). `getPluginsOverview` asks for `plugin.manage` itself. Its dialogs use the shared
  `WarningBox` and `AcknowledgeModal` (also used by the plugin stores page); they are the question, the actions are the protection. It also says which version a rollback goes back to (`previousVersion`: needs both `previousVersion` and `previousIntegrity`) and, for a plugin from a store, which
  version its store offers (`storeUpdate`, from `loadStoreCatalog`, only what fits this Barynt): a pointer to the store page (`?q=<id>` starts the search), where the
  update is made (`UpdateFromStoreModal`, which sets apart `installed.addedCapabilities`, what the new manifest asks for that the installed files did not). A workspace's
  page is a selection of this and passes none of it on.
- **The plugins of a project** (`/<workspace>/project/<slug>/settings/plugins`, `docs/plugins/project.md`, `plugin.enable` in that project, asked by the query itself):
  the workspace's page with the words of a project. `features/plugins/components/LevelPlugins` is the one component (`level="workspace" | "project"`, the words
  `workspacePlugins.*` or `projectPlugins.*`), `WorkspacePlugins` and `ProjectPlugins` are thin wrappers that bind the ids; `buildWorkspacePlugins` and `buildProjectPlugins`
  (`workspacePlugins.ts`) make the same selection for the plugins that apply per workspace or per project. `getProjectPlugins` (`projectQueries.ts`) has a Store tab where `getStoreVisibility().inProjects` says so (fails closed; what is set for workspaces does not decide it).
  **The store for a project** (`.../settings/plugins/store`, the same `PluginStore` with a `project` prop and a `StoreModeContext` whose `level` is `workspace`/`project`/`platform`):
  `getProjectStore` and `getWorkspaceStore` share `selectForLevel` (`levelStore.ts`: the plugins of that scope, released ones where the platform asked, what is on here as installed, a
  store's state only as "unavailable"); `addStorePluginToProject` and `addStorePluginToWorkspace` share `addStorePluginForLevel` (`storeLevelAdd.ts`: visibility of that level, release,
  `installFromStore` with `only` and the id that asked, then the switch; code waits for the platform's approval, a warning not a failure).
- **The plugins of a workspace** (`/<workspace>/settings/plugins`, `docs/plugins/workspace.md`, `plugin.enable` in that workspace, asked by the query itself; a page for someone
  who may not is a 404): `getWorkspacePlugins` (`workspaceQueries.ts`) reads the platform's overview (`loadOverview`) and `buildWorkspacePlugins` (pure) **selects** from it: **nothing that is
  the platform's** (the plugin directory's path, why plugins are off, hashes, origin, counts) reaches a workspace admin. The switch is `enablePlugin`/`disablePlugin`; one that cannot run is
  disabled with the reason (`blockerOf`), the action refuses the same way. **The store for a workspace** (`/settings/plugins/store`, the same `PluginStore` with a `workspace` prop and a
  `StoreModeContext`): `getWorkspaceStore` is a selection too (workspace-scope plugins, released ones where the platform asked, what is on here as installed, a store's state only as
  "unavailable"), null where `getStoreVisibility()` (fails closed) says no. `addStorePluginToWorkspace` (`plugin.enable` in the workspace) checks visibility and release itself and runs
  `installFromStore` with `only: "WORKSPACE"` and the workspace, then `enablePlugin`; a plugin with code is added and waits for the platform's approval (a warning, not a failure).
- **The registry** (`lib/plugins/registry.ts`, wired in `host.ts`) decides once per process which plugins run and keeps a
  snapshot: `planPlugins()` (pure, `plan.ts`) picks, the loader loads, `instrumentation.ts` starts it with the server (not
  awaited) so `boot` runs once per process outside a request. Its state lives on `global`
  (`registryState.ts`), because Next bundles a module once per layer; **anything that changes which code may run calls
  `invalidatePluginRegistry()`** (the store, unsigned-setting, approval, lifecycle and per-workspace actions all do). A page asks
  `getActivePlugins(workspaceId)` (or `getActivePluginsInProject(projectId)`: what applies in the project's workspace plus its own project plugins;
  a workspace's page never gets a project plugin). Request-scoped state seeded by `cache()` does not cross layers: the services find the
  workspace through the reader `setCurrentWorkspaceId` publishes on `global`. **Code runs in the process only with an approval
  for one plugin and its exact hash** (`Plugin.codeApprovalHash`, `features/plugins/actions.ts`: `plugin.manage`, the server asks for
  the yes itself, refuses what the policy would not run, checks the files on disk); the registry reads it from the row, and while
  plugins load the services answer `null`, so a `boot` that runs inside a request never sees that request's user. Verify anything that touches this in a production build in an isolated copy, never
  in the dev folder (`docs/plugins/loading.md#the-registry`).
- Which stores are on is the `PluginStore` table (`docs/plugins/stores.md`): the official store is put in by
  `prisma/bootstrap.ts` (which never touches `enabled`), only `plugin.manage` changes the list, connecting or
  switching on a store needs an explicit "I trust it" that the **server** checks, and every change is audited.
  `lib/plugins/stores.ts#getActiveStoreUrls()` gives the policy its list and fails closed. `lib/plugins/storeUrl.ts`
  has no imports on purpose: the migrate image copies only the files the bootstrap needs (see the Dockerfile).
  A `"use server"` file may only export async functions, so limits live in `features/plugin-stores/constants.ts`.
  The admin page is `app/[locale]/(default)/admin/plugin-stores` (`features/plugin-stores/components/PluginStores`);
  it only calls the actions, so the trust check stays on the server, not in the dialog.
- Access to a private store is a token in `PluginStore.credential`, **sealed** by `lib/secrets.ts` (AES-256-GCM, key from
  `SECRETS_KEY` else `AUTH_SECRET`, bound to the store's address by `lib/plugins/storeCredentials.ts`). **Never pass the
  column to a page or an audit entry, never log it, never return it from an action**: the list query maps it to
  `hasCredential`, and `tests/unit/plugin-stores/credentials.test.ts` pins the exact fields. A value that does not open is
  `null`, "no token", never a fallback. Secrets that have to be read back later use `sealSecret`/`openSecret`; passwords
  are hashed, not sealed.

## Custom fields (`lib/custom-fields`)

`docs/custom-fields.md` records what is decided. A field is **defined** (`CustomFieldDefinition`: workspace-wide when `projectId` is `null`, else one project's, the reach
of a `Label`) and **answered** per issue (`CustomFieldValue`, `(issueId, fieldId)`, **no value is no row**).

- `lib/custom-fields/` is dependency-free (no database, no `server-only`, no React): `types.ts` (the type tuple, the limits, `VALUE_COLUMN`), `config.ts` (`parseFieldConfig`,
  `parseDefinition`, `normalizeOptions`, `deriveFieldKey`), `value.ts` (`toColumns`, `fromColumns`, `sameValue`). Input is untrusted: every check reports and none throws; a
  setting a type does not have is refused, not ignored; `fieldConfigOrDefault` is the one that never refuses (reading).
- The **types are a `const` tuple, not a database enum** (`text`, `number`, `select`, `date`, `user`, `url`), and a value is stored **in the column of its type** (`text`, `number`,
  `date`, `userId`), so filters are indexed comparisons; a check constraint keeps a row to exactly one value. A `select` stores the **option's id**, never its label. Nothing is coerced
  (`"42"` is not a number), and `null`, an empty text and spaces are "no value", not zero.
- `key` is unique in the workspace, project fields included. A definition deleted, or its issue, project or workspace, takes the values with it; `pluginId` is `ON DELETE SET NULL`
  (an uninstalled plugin's fields the admin keeps become ordinary ones).
- **Defining** goes through `features/custom-fields/actions.ts` (`createCustomField`, `changeCustomField`, `setCustomFieldArchived`, `deleteCustomField`): each asks for `customfield.manage`
  **where the field applies** (`{ workspaceId }` or `{ projectId }`; a project field's workspace is the project's, never the caller's), reports the reason instead of throwing, and is audited
  (`customfield.*`, target type `customField`). **The key and the type never change**; an option in use cannot be removed; a plugin's field (`pluginId`) is the plugin's. Reads are in
  `features/custom-fields/queries.ts` (`getCustomFieldsView`, `getFieldsOfProject`); a row of an unknown type is left out, not shown broken.
- **`customfield.manage`** (WORKSPACE and PROJECT, `owner`/`admin`/`manager` and `project_admin`) defines fields; **filling one in is `issue.update.*`**. It is a new permission: an
  existing dev database needs the `provisionSystemRbac` snippet below.

## Email (`lib/mail`)

SMTP, configured exclusively through the environment (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, plus optional
`MAIL_COMPANY_NAME`/`MAIL_COMPANY_ADDRESS` for the footer — see
`example.env`). Without `SMTP_HOST` the app sends no mail; every path stays
functional regardless (invitation link to copy, in-app notifications).
`tests/setup.ts` clears all `SMTP_*` variables before every test run —
otherwise an `SMTP_HOST` set locally for Mailpit & co. in `.env` (Bun loads
`.env` for `bun test` too) would make `isMailConfigured()` come back true in
the middle of a unit test.

| File | Job |
|---|---|
| `lib/mail/config.ts` | Reads the SMTP variables, `isMailConfigured()` |
| `lib/mail/transport.ts` | `nodemailer` transport, reused as long as the config stays the same |
| `lib/mail/send.ts` | `sendMail()` — swallows errors, no-op without configuration |
| `lib/mail/templates/layout.ts` | `renderLayout()` (frame, branding, footer), `renderDetailTable()`, `renderAlertBox()` |
| `lib/mail/templates/html.ts` | `escapeHtml()`, `humanizeKey()`, `formatDateDe()` |
| `lib/mail/templates/*.ts` | One pure function per occasion, `(Input) → { subject, html, text }`, no DB access |
| `lib/mail/index.ts` | Barrel + `sendInvitationEmail()`/`sendMemberRemovedEmail()` (load workspace/project/names themselves) |

Templates, as of today:

| File | Occasion | Send point |
|---|---|---|
| `invitation.ts` | Invitation (new account) | `sendInvitationEmail()`, from the invite actions |
| `memberRemoved.ts` | Removed from workspace/project | `sendMemberRemovedEmail()`, from `removeMember`/`removeProjectMember` |
| `notification.ts` | assigned/mentioned/comment/status/invite/role | `lib/notify` (per `*Email` column) |
| `welcome.ts` | Registration with password | **not wired up yet** |
| `emailVerification.ts` | Confirm email address | **not wired up yet** (no token system) |
| `passwordReset.ts` | Reset password | **not wired up yet** (no reset token) |
| `weeklyDigest.ts` | Weekly summary | **not wired up yet** (no job, no query) |
| `issueUpdate.ts` | Batched mail for title/priority/labels | **not wired up yet** (no `NotificationEvent` for it) |

Three active callers:

- **Invitations** (`inviteWorkspaceMember`/`inviteProjectMember` in the
  new-account branch) call `sendInvitationEmail()` directly — the same link
  the action also returns for copying. `lib/invitations.ts#createInvitation()`
  returns `{ token, expiresAt }` for that instead of just the token.
- **Removal** (`removeMember`/`removeProjectMember`) calls
  `sendMemberRemovedEmail()` directly, without `notify()`: an in-app row would
  be unreachable after a workspace removal anyway (`canEnterWorkspace` already
  locks the workspace out in the layout before the inbox loads), and for
  "removed from the project only" there's no dedicated `NotificationEvent`.
  No preference toggle — same as for invitations.
- **`lib/notify`** additionally sends a mail alongside the in-app row when
  `{type}Email` is on in `UserPreferences` (defaults: see `EMAIL_DEFAULT` in
  `lib/notify/index.ts` — comments and status changes are off by default,
  everything else on, matching `prisma/schema.prisma`). `manageUrl` ("Manage
  notifications" link in the footer) always points to
  `accountPath(workspaceId, "notifications")`.

Adding a new template: add a function to `lib/mail/templates/` that uses
`renderLayout()` (plus `renderDetailTable()`/`renderAlertBox()` as needed) and
returns `{ subject, html, text }` — always run values from the DB or user
input through `escapeHtml()` before they go into the HTML (the plain-text
version stays unescaped). `to` (recipient address, for the footer's "This
email was sent to …") belongs in every input interface.

## Prisma

- Schema: `prisma/schema.prisma`
- Config: `prisma.config.ts` (new in Prisma 7)
- Client output: `lib/generated/prisma`
- DB access only in Server Components, Server Functions, and Route Handlers
- Export the Prisma client as a singleton in `lib/db.ts`

```ts
// lib/db.ts
import { PrismaClient } from "@/app/generated/prisma"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
```

### Changing the schema — mandatory checklist

**Always do all three steps, never just one:**

```
1. Adjust prisma/schema.prisma
2. bun prisma migrate dev --name <description>   ← creates migration + regenerates client
3. Check the seed and all Server Actions/queries  ← add new required fields everywhere
```

**Why all three?**
- Step 1 alone → client and DB fall out of sync, runtime errors
- Step 2 alone (without 1) → no migration, DB is missing the field
- Forgetting step 3 → seed fails, `bun db:reset` breaks

**Adding a field (NOT NULL without a default):**
```sql
-- Add this to the generated migration.sql BEFORE migrate deploy runs:
ALTER TABLE "Model" ADD COLUMN "field" TEXT;
UPDATE "Model" SET "field" = <backfill>;          -- populate existing rows
ALTER TABLE "Model" ALTER COLUMN "field" SET NOT NULL;
```
Prisma doesn't generate valid SQL for existing data on NOT NULL columns
without a default. Extend the migration manually with the backfill step.

**Never leave a migration directory empty:**
A folder under `prisma/migrations/` without a `migration.sql` breaks
`migrate deploy` (error P3015). Either create the file or delete the empty
directory.

### New permission — don't forget provisioning

An entry in `PERMISSIONS` (`lib/rbac/permissions.ts`) is only the code
definition. The `Permission` and `RolePermission` tables only get the new row
through `provisionSystemRbac()` (`lib/rbac-provision.ts`) — called from
`prisma/seed.ts`, idempotent via `skipDuplicates`. On a DB that's already been
seeded (dev, existing environments), a new permission otherwise stays inert:
`requirePermission()` fails without the schema or migration giving any hint
why — no type error, no failed migration, just a "page not found" for an
account that should actually have access.

```
bun -e '
import { db } from "./lib/db";
import { provisionSystemRbac } from "./lib/rbac-provision";
await db.$transaction((tx) => provisionSystemRbac(tx));
'
```

On a fresh DB, `bun db:dev`/`bun db:seed` handles this anyway.

## Directory Structure

```
app/                              ← Routing only
│   layout.tsx
│   page.tsx
│   globals.scss
│   (auth)/                       ← Route group (no URL segment)
│   │   login/page.tsx
│   │   register/page.tsx
│   issues/
│   │   page.tsx                  ← /issues
│   │   loading.tsx               ← Suspense skeleton
│   │   error.tsx                 ← Error boundary
│   │   new/page.tsx
│   │   [id]/
│   │       page.tsx
│   │       _components/          ← Private folder: only for this route
│   generated/
│       prisma/                   ← Generated Prisma client (don't touch)
│
components/
│   ui/                           ← Generic, domain-agnostic UI building blocks
│   │   atoms/                    ← Smallest, indivisible building blocks
│   │   │   Button/
│   │   │   │   Button.tsx
│   │   │   │   button.module.scss
│   │   │   Badge/
│   │   │   │   Badge.tsx
│   │   │   │   badge.module.scss
│   │   │   Input/
│   │   │       Input.tsx
│   │   │       input.module.scss
│   │   layout/                   ← Structural UI components
│   │       Header/
│   │       │   Header.tsx
│   │       │   header.module.scss
│   │       Sidebar/
│   │       │   Sidebar.tsx
│   │       │   sidebar.module.scss
│   │       Footer/
│   │           Footer.tsx
│   │           footer.module.scss
│
features/                         ← Business domains
│   issues/
│   │   components/               ← Issue-specific components (same structure: folder + scss)
│   │   │   IssueCard/
│   │   │   │   IssueCard.tsx
│   │   │   │   issueCard.module.scss
│   │   │   IssueList/
│   │   │       IssueList.tsx
│   │   │       issueList.module.scss
│   │   actions.ts                ← Server Functions ("use server")
│   │   queries.ts                ← DB queries (server-side only)
│   │   types.ts
│   │   index.ts                  ← Barrel export (public API)
│   projects/
│       (same structure)
│
lib/
│   db.ts                         ← Prisma singleton
│   auth.ts
│
types/                            ← Global TypeScript types
│   index.ts
│
prisma/
│   schema.prisma
prisma.config.ts
```

### Naming convention for component folders

Every component gets its **own folder** with two files:

```
Button/
  Button.tsx          ← PascalCase for the component
  button.module.scss  ← camelCase for the styles
```

- No per-component `index.ts` barrel — import directly: `import { Button } from "@/components/ui/atoms/Button/Button"`
- `atoms/` = smallest units (Button, Badge, Input, Icon, Spinner...)
- `layout/` = structural wrapper components (Header, Sidebar, Footer, PageWrapper...)

## Tooling

- **Bun** as package manager and runner
- `bun run dev` — dev server
- `bun run lint` — Biome check
- `bun run format` — Biome format
- `bun prisma migrate dev` — apply the DB schema
- `bun prisma generate` — regenerate the Prisma client

## Testing

- **Vitest** as the test runner (no Jest)
- Config: `vitest.config.ts` at the root
- Setup file: `tests/setup.ts` (mocks `server-only` globally)
- All tests live under `tests/unit/`, split by domain

### Commands

- `bun test` — run all tests once
- `bun run test:watch` — tests in watch mode
- `bun run test:coverage` — tests with a coverage report

### Structure

```
tests/
  setup.ts                        ← Global mocks (server-only)
  unit/
    auth/
      login.test.ts               ← login() Server Action
      register.test.ts            ← register() Server Action
      logout.test.ts              ← logout() Server Action
      acceptInvitation.test.ts    ← accepting an invitation (pending → false)
    middleware/
      middleware.test.ts          ← auth middleware (JWT, routing)
    session/
      session.test.ts             ← createSession / getSession / clearSession
    invitations/
      invitations.test.ts         ← lib/invitations (token, deadline, validity)
    workspace/
      createWorkspace.test.ts     ← createWorkspace() Server Action
      inviteWorkspaceMember.test.ts ← invite a member (account or link)
      workspaceSettings.test.ts   ← updateWorkspace / deleteWorkspace
      teams.test.ts               ← create, change, delete teams
    projects/
      createProject.test.ts       ← createProject() Server Action
      projectMembers.test.ts      ← manage project roles
      projectMembership.test.ts   ← lib/project-membership (joining & leaving)
      projectSettings.test.ts     ← updateProject / deleteProject, visibility
    issues/
      createLabel.test.ts         ← createLabel() Server Action
      getLabels.test.ts           ← label query (replaces `react` with a stub!)
      composerData.test.ts        ← creatableProjectIds (where creation is allowed)
      rank.test.ts                ← sort key for drag & drop
    permissions/
      resolver.test.ts            ← lib/permissions (own process, see below)
      rbac.test.ts                ← registry from lib/rbac
      roleActions.test.ts         ← role management
    table/
      tableDnd.test.tsx           ← Table with `dnd` (components/ui/layout/Table)
    ui/
      issueCreateButtons.test.tsx ← permission-dependent triggers ("New issue")
      permissionMatrix.test.tsx   ← role matrix (features/roles)
    richtext/
      richText.test.tsx           ← PM-JSON renderer (components/ui/atoms/RichText)
      fromMarkdown.test.ts        ← Markdown → PM-JSON (migration + seed)
      text.test.ts                ← toPlainText / toPreview / isEmptyDoc
    plugins/
      manifest.test.ts            ← plugin manifest schema and validator (lib/plugins)
      manifestSchemaFile.test.ts  ← generated JSON Schema is current, docs examples are valid
      sdk.test.ts                 ← packages/plugin-sdk: definePlugin, version, contexts vs manifest points
      definition.test.ts          ← parsePluginModule: reads a plugin's server module, never throws
      settingsArea.test.ts / settingsAreaNav.test.ts / pluginSettingsNav.test.ts  ← the plugins' settings area and its navigation rows (pure), and its place in the settings switcher (`lib/nav.ts`)
      resolve.test.ts             ← lib/plugins/resolve: host range, dependencies, cycles, load order
    plugin-approval/
      actions.test.ts             ← approve / withdraw the approval of a plugin's code (real plugin dirs)
    plugin-lifecycle/
      lifecycle.test.ts           ← install, update, uninstall, switch off (features/plugins/lifecycleActions)
      workspace.test.ts           ← switch on/off per workspace, onEnable/onDisable (own process: mocks `@/lib/plugins/host`)
      project.test.ts             ← switch on/off per project, onProjectEnable/onProjectDisable (same shape, one level down)
    custom-fields/
      config.test.ts / value.test.ts  ← what a field's definition is made of and how a value is checked and stored (pure, no mocks)
    custom-fields-actions/
      definitionActions.test.ts   ← create, change, archive, delete a definition (own process: mocks the db, permissions, audit and `next/cache`)
    custom-fields-queries/
      fieldQueries.test.ts        ← what the screens read of the definitions (own process: mocks the db and the permissions differently)
    plugin-host-settings/
      settingsService.test.ts     ← what a plugin reads of its own settings, `ctx.settings` (own process: replaces the database, the permissions and the session)
    plugin-settings/
      settingsActions.test.ts     ← saving a plugin's settings per level (real plugin dirs, mocked db; own process: mocks `@/lib/permissions` and `next/cache`)
    plugin-settings-ui/
      formState.test.ts           ← the form's state, what the action is given, `saveForm` (pure)
      settingsFields.test.tsx / settingsModal.test.tsx / settingsOverview.test.tsx / settingsProjects.test.tsx / settingsHeader.test.tsx / settingsNav.test.tsx / linkButton.test.tsx  ← the controls, the window, the area's overview and project chooser, the switcher, the nav rows and the link button as markup (mocks `next-intl`, `@iconify/react`, the router's `Link`)
    plugin-settings-modal/
      settingsModalFlow.test.tsx  ← the window and the page at work: Save gating, problems under a setting (own process: replaces `react`'s hooks with a list)
    plugin-settings-area/
      settingsAreaQueries.test.ts ← what the plugins' settings area reads, as this person, and who is offered it (own process: replaces the database, the permissions and the overview)
    plugin-staging/
      stage.test.ts               ← features/plugins/disk (own process: it replaces the directory hash)
    store-catalog/
      format.test.ts / reader.test.ts / catalog.test.ts / paths.test.ts  ← what a store contains and how a clone is read (real hostile directories)
      sync.test.ts / syncPolicy.test.ts  ← the sync (real temp dirs, the old clone stays on any failure) and when opening the page fetches
      zip.test.ts / release.test.ts / stageRelease.test.ts / workdir.test.ts  ← a plugin's release: the zip reader, what a release may hold, verify and place (real temp dirs); zip archives are built by `tests/unit/store-support/zipBuilder.ts`
      address.test.ts / fetch.test.ts / transport.test.ts / tar.test.ts / archive.test.ts  ← how it gets there: the public-address guard, the safe download (`fetch` and DNS replaced), the host styles, the tar reader, the allowlist unpack (real temp dirs); archives are built by `tests/unit/store-support/tarBuilder.ts`
    store-settings/
      visibility.test.ts / installAction.test.ts  ← who gets the store, releasing a plugin, the install action's checks
    plugin-store-page/ · plugin-store-parts/ · plugin-store-support/  ← the store page (own processes: they stand in for parts of it)
    store-sync/
      storeSync.test.ts           ← features/plugins/storeSync and the sync action (own process: mocks the db, permissions, `after` and DNS)
    plugin-workspace/
      workspaceQueries.test.ts    ← what a workspace's plugins page reads (own process: mocks the db, permissions and the registry)
      workspacePlugins.test.tsx   ← the page: which switches can be flipped, which action runs with which ids
    store-install/
      storeInstall.test.ts        ← installing and updating from a store (own process: mocks the db and DNS; the clone, the release and the plugin directory are real)
    plugin-admin/
      queries.test.ts             ← what the plugins page reads (own process: it mocks the registry)
      pluginsAdmin.test.tsx       ← the page: what is offered where, which action a dialog runs with which arguments
    notifications/
      notify.test.ts              ← lib/notify (also mocks `@/lib/mail`, own process)
      queries.test.ts             ← inbox query
      actions.test.ts             ← markNotificationRead / markAllNotificationsRead
    mail/
      config.test.ts              ← lib/mail/config (SMTP from the environment)
      send.test.ts                ← lib/mail/send (transport, errors swallowed)
      templates.test.ts           ← lib/mail/templates (escaping, subject/text)
```

### Mocking conventions

- Always mock `@/lib/db` — no real DB access in unit tests
- Mock `@/lib/session` when testing something that consumes the session
- `server-only` is mocked globally in `tests/setup.ts`
- `next/headers` (`cookies`) and `jose` are mocked per file
- SCSS modules (`*.module.scss`) are intercepted by a Bun plugin in
  `tests/setup.ts` — component tests don't need a bundler for that
- `vi.clearAllMocks()` in `beforeEach` — no state carries over between tests

### Important: always use `bun run test`, not `bun test`

Bun 1.3 shares the module cache between test files within one process. Since
other test files mock `@/lib/session`, that mock would leak into
`session.test.ts` if all tests ran in a single `bun test` invocation. The same
applies to the rich-text tests: `issues/getLabels.test.ts` replaces `react`
with a stub that only has `cache`, and `react-dom/server` then refuses to
work. And `permissions/roleActions.test.ts` mocks `@/lib/permissions` away
entirely — in the same process, `permissions/resolver.test.ts` would then be
checking the mock instead of the resolver. That's why `bun run test` (the
`test` script in `package.json`) doesn't call `bun test` directly, but
`scripts/run-tests.ts` — it spawns one `bun test` process per segment below,
in order, stopping at the first failure so the gate still behaves like a
single `&&` chain would. Segments live there (a plain array) rather than as
one 2000-character shell string in `package.json`, specifically so this list
stays reviewable and editable without the off-by-one risk a giant `&&`-joined
string invites:

Conversely: **never mock a module whose own tests run in the same process.**
`auth/acceptInvitation.test.ts` checks a function that uses
`lib/invitations`, and still only mocks `@/lib/db` — a
`mock.module("@/lib/invitations")` would have made `invitations/invitations.test.ts`
test against the mock. The DB mock is the smaller assumption and lets the
real code run.

For the same reason, `notifications/` (with `notify.test.ts`) gets its own
process: it mocks `@/lib/mail` entirely, to check *whether* and *for whom*
`notify()` triggers a mail. `workspace/inviteWorkspaceMember.test.ts` and
`projects/projectMembers.test.ts` transitively import `sendInvitationEmail`
from `@/lib/mail` and rely on the real function (which returns immediately
without `SMTP_HOST`) — if they ran in the same process, they'd hit the mock
from `notify.test.ts`, which doesn't even export `sendInvitationEmail`.

Within `mail/`, the same rule applies again, one level deeper: `send.test.ts`
mocks `@/lib/mail/config` and `@/lib/mail/transport` to check `sendMail()` in
isolation — but `config.test.ts` tests `@/lib/mail/config` itself for real,
with environment variables set and cleared. If both ran in the same process,
`config.test.ts` would see the mock from `send.test.ts` instead of the real
function. `send.test.ts` therefore gets its own invocation; `config.test.ts`
and `templates.test.ts` (neither of which uses `mock.module`) share one.

The same conflict exists a third time around `@/lib/project-membership`:
`workspace/inviteLinks.test.ts`, `workspace/inviteWorkspaceMember.test.ts`,
`workspace/removeMember.test.ts`, and `workspace/teams.test.ts` all mock it
away entirely (they only care that it gets *called*, not what it does), while
`projects/projectMembership.test.ts` (its own tests), `workspace/createWorkspace.test.ts`,
`auth/userProvisioning.test.ts`, and `auth/acceptInvitation.test.ts` all rely
on the real implementation running against their own `@/lib/db` mock. The
four mockers get their own invocation; every other file that touches
`@/lib/project-membership` stays together. This one is Bun-version-sensitive
in a nasty way: on 1.3.14 the real module happened to win the race in every
observed run, so it went unnoticed until `oven-sh/setup-bun@v2` picked up
1.4.2 in CI (`bun-version: latest`) and 14 unrelated tests across three
directories failed at once with no code change. `tests.yml` now pins an
exact Bun version instead of `latest`, precisely so a future Bun release
can't silently flip one of these races again — bump it deliberately, and
re-run the full suite before doing so.

The same pattern shows up a fourth time around `@/lib/system-settings`:
`workspace/createWorkspace.test.ts` mocks it away entirely (it only needs
`getSystemSettings()` to return a fixed value), while
`admin/systemSettings.test.ts` tests that module for real against its own
`@/lib/db` mock. Both used to run in the shared segment 0 process, and
`createWorkspace.test.ts`'s mock module registration won the race — every
`getSystemSettings()` call in `systemSettings.test.ts` silently returned
`createWorkspace.test.ts`'s fixed `{ allowWorkspaceCreation: true,
defaultWorkspaceId: null }` instead of reading its own mocked DB row,
failing three assertions with no code change to explain it.
`admin/systemSettings.test.ts` now gets its own invocation in
`scripts/run-tests.ts`; the rest of `tests/unit/admin/` stays in segment 0.

`proxy/proxy.test.ts` gets its own invocation too, for a different reason
than the others above: it's the only test that touches the real
`next/server` (`require("next/server")`, plus
`next/experimental/testing/server`), not a mock. Importing that for real
installs Next's edge-runtime instrumentation — the patched global `fetch`
and the request-scoped `AsyncLocalStorage` it relies on — process-wide, since
Bun doesn't sandbox globals per test file. Anything elsewhere that reaches
real Next server internals afterwards (e.g. `revalidatePath`, whenever some
other file's `mock.module("next/cache", …)` loses the module-cache race
described above) then throws `Invariant: AsyncLocalStorage accessed in
runtime where it is not available` instead of running as a no-op. This
previously surfaced as ten unrelated failures in `workspace/removeMember.ts`
and `workspace/pendingInvitations.ts` whenever `proxy.test.ts` ran in the
same process — isolating it is the fix, not touching those actions.

### GitHub Actions job summary

`scripts/run-tests.ts` writes two files per segment into `test-results/`:
`part-NN.xml` (`--reporter=junit`) and `part-NN.log` (segment's raw stderr —
Bun writes everything, including the error detail, there; stdout only ever
carries the version banner). `scripts/test-summary.ts` reads both and
appends a collapsible, per-file, per-test breakdown (status, duration, and
for a failure the console block Bun printed for it) to
`$GITHUB_STEP_SUMMARY` — wired up as its own step in `tests.yml`, after
`bun run test`, with `if: always()` so it also runs when tests fail.

Don't reach for `dorny/test-reporter` here: Bun nests each `describe()` as
its own `<testsuite>` instead of flattening to `<testcase>`, which
`dorny/test-reporter`'s parser reads as "no tests found". `<failure>`
elements in Bun's JUnit output also carry no message or stack — that's why
the summary script matches XML testcases to log blocks by reconstructing
the label Bun prints on its `(fail) <describe path> > <name> [<time>]` line
(`classname`, reversed since Bun nests it innermost-first, plus `name`)
rather than by file position, and why `classname` gets XML-unescaped
*twice* — Bun double-escapes the `>` it joins nested describe names with.

```
# Correct:
bun run test

# Do NOT use directly (session and markdown tests fail):
bun test
```

### CI

GitHub Actions workflow: `.github/workflows/tests.yml`
Runs on every push and PR to `main`.
