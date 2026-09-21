# ADR 0002: Loading plugin client code in the browser

|  |  |
| --- | --- |
| Status | **Accepted** for the loading mechanism. Styling isolation, strict CSP and other browsers are listed under [Still open](#still-open). |
| Date | 2026-09-22 |
| Tickets | BARY-49 (spike), BARY-51 (this experiment), BARY-52 (this record) |
| Reproduce | [`spike-client/README.md`](spike-client/README.md), results in [`spike-client/run-output.txt`](spike-client/run-output.txt) |
| Builds on | [ADR 0001](adr-0001-runtime-loading.md) (server code) |

## Question

A plugin can ship UI: a settings page, a board view, an issue panel. That code runs
in the browser and has to render inside the host's React tree, use hooks and read
host state. It cannot be part of the Next.js build, because plugins are installed
at runtime (ADR 0001). How does the host load a plugin's client bundle so that
plugin and host share **one React instance**?

## Answer

**As an ES module, with React and the SDK provided through an import map.**

1. The plugin author builds an ES module in which `react`, `react/jsx-runtime`,
   `react-dom` and `@barynt/plugin-sdk` are **externals** (not bundled in).
2. The host page puts its own `React`, `ReactDOM`, JSX runtime and SDK on
   `globalThis.__BARYNT__` **before** any plugin loads.
3. An **import map** points each of those bare specifiers at a tiny shim module
   served by the host. A shim only re-exports what is on `globalThis.__BARYNT__`,
   for example `export const { useState, useEffect, … } = globalThis.__BARYNT__.React`.
4. The host loads the bundle with a native `import(url)` (marked
   `/* webpackIgnore: true */ /* turbopackIgnore: true */` so the bundler leaves it
   alone) and renders the default export inside an error boundary.

Because the plugin's `import { useState } from "react"` resolves to the host's
React, hooks work and a React context created by the host can be read by the
plugin. Nothing in the plugin has to know it is running in a different bundle.

## What was tested

Headless Chromium, driven over the DevTools protocol, against the page in
[`spike-client/host/`](spike-client/host/): once on `next dev` (Next 16.3.4,
Turbopack, **Node 20.20.2**) and once on the production build in the runner image
(**Bun 1.4.2**). Both behaved identically.

| Plugin | Result |
| --- | --- |
| Built as described above | Renders. `useState` and `useEffect` work (state changed after mount), the host context is readable through the SDK, and the plugin's CSS uses the host's `--primary` token. |
| Same source, built in development mode (`jsxDEV` from `react/jsx-dev-runtime`) | Works, but only because the host also maps `react/jsx-dev-runtime`. Without that mapping it fails to import. |
| Bundles its **own** React | Fails at its first hook: `Cannot read properties of null (reading 'useState')`. Two React copies do not share a dispatcher. |
| Throws while rendering | Caught by the host's error boundary; the rest of the page is fine. |
| Imports a package nobody mapped | The import fails loudly: `Failed to resolve module specifier "lodash-es"`. |
| Bundle file does not exist | `Failed to fetch dynamically imported module` (HTTP 404). |

Where the import map lives is not a detail. It was tested both ways:

| Import map placed in | Direct page load | Client-side (soft) navigation into the page |
| --- | --- | --- |
| the plugin page's own body | works | **every plugin fails** to resolve `@barynt/plugin-sdk` |
| the root layout's `<head>` | works | works (dev and production) |

React does not execute a `<script>` element it renders on the client; it logs
"Scripts inside React components are never executed when rendering on the client".
A map that arrives with the page's server HTML works. One that arrives during a
client navigation is dropped, and so is everything that depends on it.

Also measured:

- Plugin UI is **not** server-rendered: the server HTML contains the slot but not
  the plugin's text; it appears after hydration and the dynamic import.
- The asset route answered `200` with `Cache-Control: public, max-age=31536000,
  immutable` and `X-Content-Type-Options: nosniff` for a versioned bundle, `400`
  for `..%2f` and dot-prefixed segments, and `404` for a `.ts` file.

## Decisions

1. **Mechanism as above:** externals, `globalThis.__BARYNT__`, import map with shim
   modules, native `import(url)`.
2. **The import map goes into the root layout's `<head>`, rendered on the server.**
   It has to be in every initial document, because a user can start on the login
   page and navigate into the workspace without a reload. It is a few hundred
   bytes. It is never inserted client-side.
3. **`globalThis.__BARYNT__` is set at module evaluation** of the host's client
   component, not in an effect: child effects (which start plugin imports) run
   before a parent's effect.
4. **Plugin build tooling must build for production**: `NODE_ENV=production`
   (otherwise the JSX transform emits `jsxDEV`), the four externals, ES module
   output, optional `.css` next to the bundle. The host still maps
   `react/jsx-dev-runtime` as a courtesy, mapped onto the production `jsx`/`jsxs`.
5. **The shim's export list for `react` must be generated from the installed React
   and tested.** A missing name makes every plugin that imports it fail with a
   `SyntaxError`. The spike hard-coded the current 42 public names.
6. **React's major version is part of the plugin contract.** A plugin built for one
   major will not load against another. The SDK exposes the version; the
   manifest's `barynt` range and the compatibility check (BARY-57) enforce it.
7. **Every plugin component renders inside an error boundary**, and import errors
   are caught and shown as the plugin's status. A plugin can fail; the page cannot.
8. **Assets are served by a route handler from the versioned plugin directory**
   (ADR 0001, rule 3): immutable caching, an allow-list of extensions (`.js`,
   `.mjs`, `.css`, `.map`), no dot segments or backslashes, and the resolved path
   must stay inside the plugin root. Under `/api/`, because the auth proxy skips
   that prefix and also skips any path containing a dot.
9. **Plugin CSS is global.** The two hello variants in the spike share a class name
   and got each other's style. Plugins must prefix their class names or use CSS
   Modules built by their own toolchain. Host design tokens such as `var(--primary)`
   work.
10. **Plugin UI is client-only**, so slots need a skeleton with a fixed size to
    avoid layout shift.
11. **Trust:** this code runs in the app's origin with full access to the DOM and
    to same-origin requests made with the user's cookies. That is trust tier B,
    like server modules. It is not sandboxing.

## Still open

- **Strict CSP.** Barynt sets none today. Under a nonce-based policy the inline
  import map needs the request's nonce.
- **Firefox and Safari.** Import maps and dynamic `import()` are standard, but only
  Chromium was tested.
- **Serving only enabled plugins.** The spike serves any file in the plugin
  directory. The real route has to check that the plugin is enabled for the
  requester's workspace, or accept that bundles are public.
- **Style isolation** beyond a naming rule; **`createRoot`/portals** inside a plugin;
  **`lazy` and Suspense** inside a plugin; **memory** when a plugin is updated and
  its old module stays loaded.
- **`next dev` shows an "Issues" badge** for errors that the error boundary
  contained. Harmless, but authors will notice.
