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
checking the mock instead of the resolver. That's why the `test` script in
`package.json` splits the invocation into several processes:

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

```
# Correct:
bun run test

# Do NOT use directly (session and markdown tests fail):
bun test
```

### CI

GitHub Actions workflow: `.github/workflows/tests.yml`
Runs on every push and PR to `main`.
