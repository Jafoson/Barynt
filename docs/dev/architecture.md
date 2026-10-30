# Architecture

Barynt is one Next.js application plus PostgreSQL. Redis and S3-compatible
storage are optional add-ons. There is no separate backend service: the web
pages, the data access, the REST API and the MCP server all live in one
codebase and one process.

## The stack

| Part                | Choice                             | Notes                                                                                                                                                                           |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | Next.js 16 (App Router), React 19  | Server Components by default. This Next.js differs from older versions, read `node_modules/next/dist/docs/` before writing framework code (see [`AGENTS.md`](../../AGENTS.md)). |
| Language            | TypeScript                         | Strict. `bun x tsc --noEmit` runs in CI.                                                                                                                                        |
| Database            | PostgreSQL through Prisma 7        | The client is generated into `lib/generated/prisma` and talks to Postgres through the `pg` driver adapter.                                                                      |
| Auth                | Auth.js (next-auth v5)             | Passkeys, OAuth/OIDC, magic links. JWT sessions.                                                                                                                                |
| Styling             | SCSS Modules                       | No Tailwind.                                                                                                                                                                    |
| Rich text           | Tiptap / ProseMirror               | Documents are stored as JSON.                                                                                                                                                   |
| Rate limiting       | Redis (ioredis)                    | Only for the API and MCP keys.                                                                                                                                                  |
| Files               | S3-compatible, through `aws4fetch` | Optional.                                                                                                                                                                       |
| i18n                | next-intl                          | English and German, locale prefix always in the URL.                                                                                                                            |
| Runtime and tooling | Bun, Biome                         | Bun installs and runs scripts and tests; the production image runs the Next standalone server.                                                                                  |

## Folder layout

```
app/            Routing only: pages, layouts, route handlers. As little logic as possible.
  [locale]/(auth)/       Public and sign-in pages: login, invite, join, share, onboarding, OAuth consent
  [locale]/(default)/    The signed-in app: [workspace]/..., and admin/ (platform administration)
  api/                   Route handlers: /api/v1 (REST), /api/mcp, /api/oauth, /api/auth, health, updates
components/ui/  Generic building blocks that know nothing about the domain (atoms/, layout/, charts/)
features/       One folder per business domain: issues, projects, workspaces, roles, account, admin, ...
  <domain>/actions.ts      Server Functions ("use server"): everything that changes data
  <domain>/queries.ts      Reads (server only)
  <domain>/components/     Components of that domain, one folder per component
lib/            Cross-cutting building blocks without a domain: permissions, audit, notify, mail, storage, rbac, richtext, ...
i18n/, messages/   Routing and the translation files (de.json, en.json)
prisma/         schema.prisma, migrations, seed.ts, bootstrap.ts
styles/         Global SCSS: colors, typography, breakpoints, shared mixins
scripts/        Build and maintenance scripts: test runner, icons, release, docs
deploy/helm/    The Helm chart
docker/         The image's entrypoint and the isolated migration dependencies
tests/unit/     All tests, grouped by domain
releases/       Release notes (generated and hand-written), shipped with the app
docs/           guide/ (users) and dev/ (you are here)
```

**Dependency direction.** `app/` uses `features/` and `components/`; `features/`
use `lib/` and `components/ui`; `lib/` uses nothing above it; `components/ui`
knows no domain and no Prisma. Domain data reaches a generic component as
props (the rich-text editor gets its `@` suggestions from
`features/issues/components/IssueRichText`, not the other way round). When you
are unsure where code belongs, ask which of those it may depend on.

## How a page renders

Take the project board, `app/[locale]/(default)/[workspace]/project/[projectSlug]/page.tsx`:

1. **`proxy.ts`** (Next's middleware slot) runs first. It sends visitors without
   a session to the login page and lets `next-intl` add the locale prefix.
   `/api` is _outside_ its matcher, so route handlers there authenticate
   themselves.
2. **The layout** (`[workspace]/layout.tsx`) puts the workspace id from the URL
   into a request-scoped store (`lib/current-workspace.ts`), loads the session,
   and calls `notFound()` for a workspace the person may not enter. A layout is
   a convenience, not the security boundary, see below.
3. **The page** is an async Server Component. It awaits `params`/`searchParams`
   (they are Promises in this Next.js), calls **queries** in `features/*/queries.ts`
   (often with `Promise.all`), and hands plain data to components.
4. **Queries** check access themselves and fail _empty_, never with an exception.
   `React.cache()` deduplicates calls within one request, so the layout and a
   page can both ask for the same thing.
5. **Components** that need interactivity are Client Components (`"use client"`)
   that receive the data as props. Layout lives in CSS; behaviour in JS.

Pages are `force-dynamic`: they depend on the session and the database, nothing is
statically generated against the database.

## How a change travels

All changes made by the UI are **Server Functions** (`"use server"` in
`features/<domain>/actions.ts`), not REST calls. A typical one:

1. `requirePermission("issue.update.any", { projectId })` (see
   [Permissions](permissions.md)). No permission, no work.
2. Validate input, write to the database, usually in a transaction.
3. Side effects: `recordAudit(...)` (audit log), `notify(...)` (inbox and mail),
   `fireWebhookEvent(...)` (webhooks), `recordProjectChange(...)` (so other
   open tabs notice).
4. `revalidatePath(...)` so the page re-renders with fresh data.

The REST API and the MCP server do **not** reimplement this. Both call the same
functions in `features/api-v1/` (`*ForUser` queries and mutations), so the two
surfaces cannot drift on _what_ a request does, only on transport. See
[API and MCP internals](api-and-mcp.md).

## Three ways in, one rule set

| Entry       | Authenticates with                    | Where it checks permissions                                                                                     |
| ----------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| The web app | The Auth.js session cookie            | In each query and Server Function.                                                                              |
| `/api/v1/*` | `Authorization: Bearer bry_…` API key | The route checks key, rate limit and _scope_, then the `*ForUser` function checks the person's own permissions. |
| `/api/mcp`  | An API key or an OAuth access token   | Per tool, the same way.                                                                                         |

A scope on a key only ever **narrows** what its owner may do. There is no second
permission system.

## Decisions worth knowing

- **The workspace lives in the URL**, not in a cookie: `/<workspaceId>/...`. A
  workspace's id is its slug. Nested Server Components read it from the
  request-scoped store without prop drilling.
- **Every query and action checks access itself.** A layout only protects the pages
  beneath it, not every function call. Queries return empty data instead of
  throwing, because they render in parallel with the layout and an exception would
  become a 500 before `notFound()` could act.
- **A missing thing and a forbidden thing look the same** (404). Barynt never
  tells someone that something exists which they may not see.
- **Polling, not streaming, for live updates.** Open boards poll
  `/api/workspaces/[id]/updates` every few seconds and show a banner when someone
  else changed something. A plain short GET has nothing for a proxy, CDN or tunnel to
  buffer. The change record is an in-process map, which is fine for a single
  container and is the one thing to move to a shared store before running several
  app replicas, see [Backend services](backend-services.md#realtime-updates).
- **Optional services degrade quietly.** No SMTP: no mail, links to copy. No S3:
  initials avatars, no attachments. The web app itself never needs Redis; only the
  API and MCP rate limit does, so those two need a reachable Redis, see
  [Backend services](backend-services.md#redis).
- **Environment, not settings files.** Mail, storage, auth providers and URLs are
  configured only through environment variables. Platform-wide switches that an
  administrator flips at runtime are in the `SystemSettings` table.
- **One image, migrations at start.** The app container runs `prisma migrate deploy`
  and the bootstrap before it serves, so changing the image tag is the whole update.
  See [Build, release and operations](build-and-release.md).
