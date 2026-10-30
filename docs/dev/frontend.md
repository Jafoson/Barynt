# Frontend

The UI is React 19 on the Next.js App Router, styled with SCSS Modules. This
page covers the rules that keep it consistent. The shortest form of the same rules
is in [`CLAUDE.md`](../../CLAUDE.md).

## Server first

- **Server Components are the default.** A page is an `async` function that
  fetches data and renders. Only add `"use client"` for interactivity: click
  handlers, browser APIs, local state.
- Forms use `<form action={serverAction}>`, not `onSubmit` plus `fetch`. Changes go
  through Server Functions (see [Architecture](architecture.md#how-a-change-travels)).
- Keep `useEffect` for what has no server-side answer. `useMemo`/`useCallback` only
  for a _measured_ performance problem. Keep state close to where it is used.
- Next.js 16 passes `params` and `searchParams` as **Promises**: always `await` them.

## Components

Every component has its **own folder** with the component and its styles:

```
Button/
  Button.tsx            PascalCase: the component
  button.module.scss    camelCase: its styles
```

- No per-component `index.ts`. Import directly:
  `import { Button } from "@/components/ui/atoms/Button/Button"`.
- **`components/ui/`** is generic and knows nothing about workspaces, issues or
  Prisma. `atoms/` are the smallest units (Button, Badge, Input, Switch, Tooltip, …),
  `layout/` the structural ones (AppShell, Sidebar, TabBar, Modal, Table, Tabs, …),
  `charts/` the dashboard charts. Check there before writing something new.
- **Domain components** live with their domain: `features/<domain>/components/`.
- Split **logic and rendering**: a Server Component fetches and decides, a `*View`
  or `*UI` component only renders what it is given. Client Components receive data
  as props.
- Prefer reuse over duplication; if two features need the same thing, it belongs
  in `components/ui/`.

## Styling

- **SCSS Modules** for component styles, global styles in `styles/`
  (`globals.scss`). No Tailwind, no CSS-in-JS.
- **Appearance belongs in CSS**, not JavaScript. Use `:before`, `:after`,
  custom properties, `:is()`, `:has()`. Inline `style` only for genuinely dynamic
  values such as computed positions.
- Colours and dimensions are custom properties (`styles/colors.scss`,
  `styles/dimensions.css`, `styles/typography.css`); the app has a light and a dark
  theme, so never hard-code a colour.
- `@use "breakpoints" as bp;` works anywhere (the `styles/` folder is a Sass load path).

## Responsive and touch

The desktop layout is the base. The mixins in `styles/breakpoints.scss` reach
_down_ from it. Test at 375, 768 and 1280 px.

| Mixin                                     | Applies to                                       | JS twin (`lib/utils/useMediaQuery`) |
| ----------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| `bp.phone`                                | up to 640 px                                     | `PHONE_QUERY`                       |
| `bp.tablet-down`                          | up to 1024 px                                    | `COMPACT_QUERY`                     |
| `bp.tablet-only`, `bp.desktop`, `bp.rail` | tablet / above 1024 px / the collapsed icon rail | none                                |
| `bp.coarse`, `bp.no-hover`                | touch and no hover (input capability, not width) | none                                |
- **Layout in CSS, behaviour in JS.** Width-only differences are SCSS.
  `useMediaQuery` is for behaviour that has to differ (a sheet instead of a dialog,
  one matrix column at a time). It returns `false` on the server and during hydration.
- **Sheet on a phone, dialog from a tablet up.** Create and edit windows are one
  component with a `sheet` prop (`Modal variant="sheet"` + `SheetHeader` +
  `useSwipeToClose`, no Cancel button, no `autoFocus` so the keyboard does not open).
  The opener passes `{ placement: "bottom" }` on a phone. Where several places open
  the same window, a hook owns the choice (`useOpenCreateProject`, `useOpenLabelModal`).
- **Tables as card rows.** `styles/card-rows.scss` turns table rows into wrapping
  flex cards on a phone (or a tablet with `$upTo: tablet`); cells are found by
  column id (`td[data-col="…"]`).
- A scrolling flex column needs `& > * { flex: none }`, otherwise a child with its
  own `overflow` is squeezed to its scrollbar.
- Touch targets use `--touch-min` (44 px), safe areas `--safe-*`, the on-screen
  keyboard `--kb-inset`.
- **Shortcuts only with a keyboard.** `lib/shortcuts/useHasKeyboard` decides; the
  `Shortcut` component renders nothing without one. Never hard-code a shortcut hint.

## Navigation

[`lib/nav.ts`](../../lib/nav.ts) is the **single source of truth** for routes: every
URL, icon and label, grouped by area. The sidebar and the tab bar both read it, so a
route changes in one place. Helpers such as `accountPath(workspaceId, "security")`
build links; do not assemble paths by hand.

The app has a browser-like **tab bar** (`components/ui/layout/TabBar`) that opens
issues and pages in tabs, and a modal system (`lib/context/ModalContext`) with three
placements: `center` (dialog), `right` (side panel), `bottom` (phone sheet). A page
can also give the floating action button on phones its own job (`lib/fab-action.ts`).

## Rich text

Issue descriptions and comments are **ProseMirror documents** (`Json`), not strings.
Reading and writing are separate on purpose:

|         | Component                             | Environment                                           |
| ------- | ------------------------------------- | ----------------------------------------------------- |
| Display | `components/ui/atoms/RichText`        | Server Component, no dependency                       |
| Edit    | `components/ui/layout/RichTextEditor` | `"use client"`, Tiptap, loaded through `next/dynamic` |
- Display translates the JSON to React **by hand**: no `generateHTML`, no
  `dangerouslySetInnerHTML`. Whoever adds a node type to the renderer must add the
  matching Tiptap extension to the editor, and the other way round.
- The editor is **never imported directly**, only through `next/dynamic` with
  `ssr: false`, otherwise its bundle would land on the read path too.
- Suggestion data (`@` members, `#` issues) is passed in as props. The bridge to the
  domain is `features/issues/components/IssueRichText`.
- Every document column has a derived text column (`descriptionText`, `bodyText`)
  for search, rewritten from `toPlainText(doc)` on **every** write.
- `lib/richtext/` has no dependencies and runs everywhere (tests, seed, scripts):
  `toDoc`/`isEmptyDoc`, `toPlainText`/`toPreview`, `fromMarkdown`, `toMarkdown`.
  The API accepts Markdown and converts it with `features/api-v1/richtext.ts`.

## Icons

Icons are `<Icon icon="lucide:name" />` from `@iconify/react`, but they do **not**
load from the Iconify API at runtime: `lib/icons/bundle.generated.ts` contains the
icons the app uses and `IconBundle` (mounted in the root layout) registers them
before anything renders. Otherwise an ad blocker, a proxy or an outage would leave
every icon empty.

- **Add or remove an icon, then run `bun run icons:build`** and commit the generated
  file. `tests/unit/ui/iconBundle.test.ts` (and `bun run icons:check`) fail while it is stale.
  A missing icon is not broken, it falls back to the API, but that quietly
  reintroduces the runtime dependency.
- The scan reads string literals `"prefix:name"` from `app/`, `components/`,
  `features/` and `lib/`. **Write icon names as literals**; a name built at runtime is not seen.
- A new icon _set_ (a prefix other than lucide, logos, material-symbols or mdi) needs its
  `@iconify-json/<prefix>` as a dev dependency.

## Personal settings (`UserPreferences`)

Per-person settings that change how the app _acts_ (not just looks) live in
`UserPreferences`: where a project name leads, how an issue opens, default grouping
and order, date format and time zone, own shortcuts, whether to confirm deletions.

- Allowed values are in `features/account/preferences.ts`, one list per setting.
  `updateBehavior` validates against them, `toBehavior` narrows a row on read. A new
  option goes into that list, the settings UI and `messages/*`.
- Client components read them with `usePreferences()` (`lib/preferences`), which is
  filled in the root layout. Outside a provider it answers with `DEFAULT_BEHAVIOR`.
- The full table of settings and where each is read is in [`CLAUDE.md`](../../CLAUDE.md#personal-behavior-settings-userpreferences).

## Keyboard shortcuts

Shortcuts go through `useShortcut` (`lib/shortcuts`). They are **keyed by their
default spec**, so call sites keep passing the default (`useShortcut("c", …)`) and a
person's own binding (`shortcutOverrides`) is applied underneath. A binding outside
`useShortcut` (the editor's own keymap) is not remappable: show it with `<Shortcut raw />`.
The `?` reference in the app lists what is registered.

## Translations

- Two languages, `de` and `en`, in `messages/de.json` and `messages/en.json`. The
  locale is always in the URL (`/de/…`, `/en/…`), default `de` (`i18n/routing.ts`).
- **Every key exists in both files.** A test (`tests/unit/i18n/messages.test.ts`)
  fails on a key that is in one file only, and on a key _name_ containing a dot
  (next-intl reads the dot as nesting). Write `projectDeleted`, not `project.deleted`.
- Use `useTranslations()` in client components and `getTranslations()` on the server.
  ICU placeholders (`{url}`) are fine in messages. Do not put API paths or JSON into
  message files: documentation text with such content lives next to its data.
- Dates and times are formatted in the person's own time zone (`i18n/request.ts`).
- Email templates and the API reference are not in the message files (see
  [Backend services](backend-services.md#mail) and [API and MCP internals](api-and-mcp.md)).

## Accessibility notes

Interactive elements need names and keyboard access; `lib/a11y.ts` holds shared
helpers. Touch targets and focus behaviour follow the rules above. When you build a
new atom, check it with the keyboard before you ship it.
