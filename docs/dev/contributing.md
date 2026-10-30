# Contributing

Issues and pull requests are welcome. This page is the working agreement: how changes are
made, what a good pull request looks like, and checklists for the changes that touch several places at once.

## Before you start

- Run the project ([Getting started](getting-started.md)) and read [Architecture](architecture.md).
- For anything bigger than a fix, open an issue first and say what you plan. It saves everyone a rewrite.
- If you touch access (who may do what), read [Permissions](permissions.md) first. If you touch the
  schema, read [Data model](data-model.md).

## Workflow

- **One branch per change**, cut from an up-to-date `main`, named `<type>/<short-slug>` with the
  type `feat`, `fix`, `refactor`, `chore`, `docs` or `test`. Maintainers working from a ticket
  include its number: `feat/bary-128-plugin-system`. Never commit straight to `main`.
- **Commit messages are Conventional Commits:** `type(scope): summary`, for example
  `fix(issues): keep rank when moving between columns`. A `!` after the type or a `BREAKING CHANGE:`
  footer marks a breaking change. The type decides the next version (see
  [Releasing](build-and-release.md#releasing)): `fix` is a patch, `feat` a minor. Write the summary for
  the reader of a release note.
- **Open a pull request when it works**, with a description of what and why, and the screenshots for
  anything visual. Wait for review. Do not merge your own change without approval.
- **Merge with a merge commit**, not squash and not rebase, and delete the branch afterwards.
- **Sub-tasks** of a larger change get their own branch cut from the parent branch and a pull request
  into it; only the parent branch is merged into `main`.

Maintainers who work from tickets also move the ticket along (in progress, in review) and only mark it
done after the merge and approval. That is a process detail, written down in
[`CLAUDE.md`](../../CLAUDE.md#ticket-workflow-for-claude).

## What "ready" means

Run these and get them green:

```bash
bun run lint            # Biome; `bun run format` fixes formatting
bun x tsc --noEmit      # types
bun run test            # the suite (not `bun test`)
```

Then re-read your own diff as a reviewer would: what could make CI reject this, what did I forget to
update next to the code (a translation, an icon, a doc page, the seed, a test)?

If you changed `prisma/schema.prisma`, the pull request contains the migration, and the seed still runs.

## Code style

- **Biome** formats and lints. No ESLint, no Prettier. Do not fight it.
- **TypeScript is strict.** No `any` to silence an error; narrow the type.
- **Comments and docs are English.** A comment explains _why_: the constraint, the bug it prevents, the
  decision. Do not narrate what the line does. Match the density of the surrounding code, which comments
  decisions generously.
- **Follow the surrounding code:** naming, file layout, patterns. If you find a better pattern, change it
  in its own pull request.
- Server Components by default; `"use client"` only where interactivity needs it
  ([Frontend](frontend.md)).
- Next.js 16 differs from older versions. When you use a framework API you have not used before, read the
  matching guide in `node_modules/next/dist/docs/` and heed deprecation notices.

## Security habits

These are the things reviewers look for first:

- **Every new query and Server Function checks access itself.** `requirePermission(...)` or `can(...)`
  at the point of use; a layout is not protection. Queries fail empty, actions throw `PermissionError`.
- **Missing and forbidden look the same** to the caller (404). Do not leak that something exists.
- **Never trust the browser.** Validate input on the server, also in `updateBehavior`-style actions that
  take a settings object (only copy the fields you expect).
- **Escape what you put in HTML.** Mail templates run every dynamic value through `escapeHtml()`. Rich text
  is rendered by hand, never with `dangerouslySetInnerHTML`.
- **Secrets stay out of the repository and the logs.** New configuration comes from the environment and is
  documented in `example.env`.
- **A scope is a ceiling, not a grant.** See [Authentication](authentication.md#api-keys).

## Checklists

### A new page or feature that users see

- [ ] Route under `app/`, data in `features/<domain>/queries.ts`, changes in `actions.ts`
- [ ] Access checks in the query and in every action
- [ ] Entry in `lib/nav.ts` if it needs a menu item or tab
- [ ] Texts in **both** `messages/de.json` and `messages/en.json`
- [ ] Works on a phone, tablet and desktop ([responsive rules](frontend.md#responsive-and-touch))
- [ ] Icons written as string literals, then `bun run icons:build`
- [ ] Audit event and/or notification if it is the kind of thing that is audited or notified
- [ ] The **user guide page** updated in `docs/guide/en/` **and** `docs/guide/de/`, with a refreshed screenshot
  (see [`scripts/docs-shots/README.md`](../../scripts/docs-shots/README.md))
- [ ] Tests

### A new permission

1. Add the key, description and the scopes it may be granted in to `lib/rbac/permissions.ts`.
2. Assign it to the system roles that should have it in `lib/rbac/roles.ts`.
3. **Provision it.** The registry is only code; the `Permission` and `RolePermission` tables get the row through
   `provisionSystemRbac()` (called by `prisma/bootstrap.ts`, idempotent). On an already-set-up database a new
   permission is **inert until provisioned**: `requirePermission()` fails with nothing in the logs explaining
   why. Run the bootstrap (or the snippet in [`CLAUDE.md`](../../CLAUDE.md#new-permission--dont-forget-provisioning)).
4. Guard the code with `requirePermission(...)`. Update the role matrix text in the guide's
   [Roles and permissions](../guide/en/administration/roles.md) page.

Details and the escalation rules: [Permissions](permissions.md#introducing-a-new-permission).

### A schema change

See [Data model](data-model.md#changing-the-schema): schema, `bun prisma migrate dev --name …`, backfill for new
NOT NULL columns, seed and every action/query that must know the field.

### An API endpoint, MCP tool, scope or webhook event

See the checklists in [API and MCP internals](api-and-mcp.md#checklists). The short version: logic in
`features/api-v1`, a route **and** a tool, the in-app reference data, `bun run docs:api`, tests.

### A new setting a person can change

Allowed values go into `features/account/preferences.ts`, the settings UI, `messages/*`, and the code that reads it
(through `usePreferences()`). If it changes behaviour, add it to the table in `CLAUDE.md`.

### A new mail template

[Backend services → Mail](backend-services.md#mail): a pure function, `escapeHtml()` on every dynamic value, `to` in the
input, an entry in the catalog.

### A new icon

Use it as a literal `"prefix:name"`, then `bun run icons:build` and commit the generated bundle.

### A dependency

Prefer not adding one. If you must: why this one, its size on the client, whether it works under Turbopack and Bun,
and its licence (Barynt is MIT). Pin consistently; the Docker `migrate-deps` set mirrors the Prisma versions.

## Documentation is part of the change

- **Users:** a change in what people see or do updates its page in `docs/guide/` (English and German) in the same
  pull request. `tests/unit/docs` checks front matter, groups, links and images. The API reference is generated.
- **Developers:** a change in how something works updates the matching page in `docs/dev/`.
- **Releases:** the user-facing highlights of a version are written when it is released, see
  [`releases/README.md`](../../releases/README.md).

## Reporting a problem

Open an issue with what you did, what you expected, what happened, and the version (shown under the user card in the
sidebar). For a security problem, do not open a public issue: contact the maintainers privately (for example through a GitHub
security advisory on the repository).
