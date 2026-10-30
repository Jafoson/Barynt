# Developer docs

Everything you need to work **on** Barynt: run it locally, understand how it is
put together, change it safely, test it, ship it. For using and administering
Barynt, see the [user guide](../guide/).

These pages are written for people who can read TypeScript and have not seen
this codebase before. They explain **ideas and decisions** and point at the
files that hold the details. The code itself is heavily commented, so when a
page says "see `lib/permissions.ts`", the comment at the top of that file is
the next thing to read.

## Read in this order

| Page | What you get |
| --- | --- |
| [Getting started](getting-started.md) | Run Barynt on your machine: tools, database, mail, first sign-in, daily commands. |
| [Architecture](architecture.md) | The stack, the folder layout, and how a request travels from the browser to the database and back. |
| [Data model](data-model.md) | The Prisma schema in groups, the ideas behind it, migrations, seed and bootstrap. |
| [Authentication](authentication.md) | Passkeys, OAuth/OIDC, magic links, sessions, API keys and OAuth tokens. |
| [Permissions (RBAC)](permissions.md) | Roles, scopes and the rules every check follows. The most important page before you touch access. |
| [Frontend](frontend.md) | Components, styling, responsive rules, rich text, icons, shortcuts, personal settings, translations. |
| [Backend services](backend-services.md) | Mail, storage, Redis, realtime updates, audit log, notifications, webhooks, other building blocks. |
| [API and MCP internals](api-and-mcp.md) | How the REST API, the MCP server and the in-app reference are wired, and how to add a route, tool or event. |
| [Testing](testing.md) | `bun run test`, why the suite is split, how to write a test that behaves. |
| [Build, release and operations](build-and-release.md) | Docker image, CI workflows, releases, Helm chart, installer. |
| [Contributing](contributing.md) | Workflow, commit style, pull requests, and the checklists for common changes. |

More detail that is useful once you are deeper in:

- [Permissions audit](permissions-audit.md): an inventory of where the code
  checks a permission (a snapshot from August 2026, read it as a map of how the
  model landed in the code, not as the current to-do list).

## Where things are documented

| For | Lives in | Language |
| --- | --- | --- |
| People who use and run Barynt | [`docs/guide/`](../guide/), published on [barynt.dev](https://barynt.dev/docs/) | English and German |
| People who change Barynt | `docs/dev/` (here), read on GitHub and published as "Development" on [barynt.dev](https://barynt.dev/docs/development/) | English |
| AI coding assistants | [`CLAUDE.md`](../../CLAUDE.md) and `AGENTS.md`: the rules in condensed form | English |
| The reasons behind a piece of code | Comments in the code itself | English |

`CLAUDE.md` is the short rule sheet; these pages explain the same ground for
humans, with the reasoning. When they ever disagree, the code wins, then
`CLAUDE.md`: please fix the page.

## Writing developer docs

- One topic per page, in Markdown that reads well on GitHub. Relative links to
  other pages and to source files (`../../lib/permissions.ts`); a test checks
  that every link in `docs/dev/` and `docs/guide/` points at something that exists.
- Explain **why**, then **where** (the file), then **how to change it**. Do not
  paste code that the repository already contains: link it instead, so the page
  cannot go stale.
- A change that alters how something works updates its page **in the same pull
  request**, just like the user guide does.
- Write the reason a decision was made while it is fresh. "Why not X" is often
  the most valuable sentence on the page.
