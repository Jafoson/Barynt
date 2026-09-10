<p align="center">
  <img src="public/Logo/color/Logo_horizontal.svg" alt="Barynt" width="360">
</p>

<p align="center"><b>The open-source Linear/Jira alternative you self-host.</b></p>

<p align="center">
  Workspaces, projects, issues, and role-based access control — run on your own infrastructure.
</p>

<p align="center">
  <a href="https://github.com/Jafoson/Barynt/actions/workflows/tests.yml"><img src="https://github.com/Jafoson/Barynt/actions/workflows/tests.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/Jafoson/Barynt/actions/workflows/docker-build.yml"><img src="https://github.com/Jafoson/Barynt/actions/workflows/docker-build.yml/badge.svg" alt="Docker Build"></a>
  <a href="https://github.com/Jafoson/Barynt/actions/workflows/security.yml"><img src="https://github.com/Jafoson/Barynt/actions/workflows/security.yml/badge.svg" alt="Security"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/Jafoson/Barynt/stargazers"><img src="https://img.shields.io/github/stars/Jafoson/Barynt" alt="GitHub Stars"></a>
</p>

---

Barynt is a Linear/Jira-style issue tracker you run yourself. Workspaces contain projects, projects contain issues, and everything — statuses, priorities, issue types, labels, roles — is configurable per workspace instead of hard-coded. It ships as a single Next.js app plus Postgres, with Redis and S3-compatible storage as optional add-ons, and a `docker compose` profile that stands up the whole stack (including HTTPS via Caddy) on one server.

## Features

- **Workspaces & projects** — multiple workspaces per instance, each with its own members, teams, projects, and settings
- **Issues** — rich-text descriptions and comments (Tiptap/ProseMirror), custom statuses, priorities, and issue types per workspace, labels, drag-and-drop ranking, file attachments
- **Role-based access control** — permissions are composed at the platform, workspace, and project scope, with built-in and custom roles (see [docs/rbac.md](docs/rbac.md))
- **Teams** — group members and projects for scoped visibility and assignment
- **Notifications** — in-app inbox plus optional email delivery per event type, with per-user preferences
- **Invitations** — invite by email or shareable link, to a workspace or directly into a project
- **Audit log** — tracked changes across workspaces for accountability
- **Public API** (`/api/v1`) — API keys with Redis-backed rate limiting
- **MCP server** (`/api/mcp`) — a remote [Model Context Protocol](https://modelcontextprotocol.io) server exposing workspaces, projects, issues, comments, and labels as tools, authenticated with the same API keys as the REST API. Point Claude Desktop, Claude Code, or any other MCP client at it to manage issues from your AI assistant.
- **Webhooks** — outgoing event notifications for integrating with other tools
- **Keyboard-driven UI** — command palette (`⌘K`/`Ctrl+K`), Vim-style list navigation (`j`/`k`), single-key issue actions (status, priority, assignee, labels, …) and `g`+letter "go to" navigation, all listed in an in-app `?` shortcut reference
- **Authentication, including SSO, at no extra cost** — passkeys (WebAuthn) by default, plus GitHub, Google, GitLab, Microsoft Entra ID, Apple, and any generic OIDC/SSO provider (Keycloak, Authentik, Okta, …), and email magic links via SMTP — every provider is a free config addition, not a paid/enterprise tier
- **Object storage** — avatars and issue attachments via any S3-compatible provider (bundled: [RustFS](https://github.com/rustfs/rustfs))
- **Internationalization** — English and German out of the box (`next-intl`)
- **Admin panel** — instance-wide administration and permission auditing

## Tech stack

| | |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router), React 19 |
| Language | TypeScript |
| Database | PostgreSQL via [Prisma 7](https://www.prisma.io) |
| Auth | [Auth.js](https://authjs.dev) (passkeys, OAuth, OIDC, email) |
| Styling | SCSS Modules (no Tailwind) |
| Rich text | [Tiptap](https://tiptap.dev) / ProseMirror |
| Rate limiting | Redis |
| Object storage | S3-compatible (RustFS bundled, or any AWS S3-compatible provider) |
| AI integration | [Model Context Protocol](https://modelcontextprotocol.io) server (`/api/mcp`) |
| i18n | [next-intl](https://next-intl.dev) |
| Package manager / runtime | [Bun](https://bun.sh) |
| Linting / formatting | [Biome](https://biomejs.dev) |
| Testing | [Vitest](https://vitest.dev)/Bun test runner |

## Getting started (local development)

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Docker](https://www.docker.com) (for Postgres/Redis via `docker compose`)

### Setup

```bash
# 1. Install dependencies
bun install

# 2. Configure environment variables
cp example.env .env
# At minimum, set AUTH_SECRET:
bunx auth secret

# 3. Start Postgres + Redis, run migrations, and seed the database
bun run db:dev

# 4. Start the dev server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). Passkey login works with no further configuration; see [example.env](example.env) for optional OAuth providers, SMTP (needed to accept email invitations), and S3-compatible storage for avatars/attachments.

### Useful scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start the dev server |
| `bun run build` / `bun run start` | Production build / start |
| `bun run lint` / `bun run format` | Biome check / format |
| `bun run test` | Run the full test suite (see [Testing](#testing)) |
| `bun run test:watch` | Tests in watch mode |
| `bun run db:up` | Start Postgres + Redis only |
| `bun run db:dev` | Start services, migrate, and seed |
| `bun run db:reset` | Drop volumes and rebuild from scratch |
| `bun run db:logs` | Tail the Postgres container logs |
| `bun prisma migrate dev --name <description>` | Create a new migration |

## Deployment

Barynt ships as a single `docker-compose.yml` used for both local dev and production, split by [Compose profiles](https://docs.docker.com/compose/how-tos/profiles/):

```bash
cp example.env .env
bunx auth secret   # paste the result into AUTH_SECRET in .env
# set POSTGRES_PASSWORD and DOMAIN in .env for a real deployment

docker compose --profile app up -d --build
```

This builds and starts the app, a one-off migration runner, bundled RustFS object storage, and [Caddy](https://caddyserver.com) as a reverse proxy with automatic Let's Encrypt HTTPS once `DOMAIN` points at the host. Every service besides Caddy binds to `127.0.0.1` by default — only ports 80/443 are meant to be exposed publicly. See the comments at the top of [docker-compose.yml](docker-compose.yml) and [example.env](example.env) for the full set of options (external Postgres/S3/SMTP, custom ports, etc.).

A multi-arch image is also published to `ghcr.io/jafoson/barynt` via [.github/workflows/docker-build.yml](.github/workflows/docker-build.yml).

## Testing

```bash
bun run test           # full suite
bun run test:watch     # watch mode
bun run test:coverage  # with coverage report
```

Tests use Vitest-style APIs on Bun's test runner. Always use `bun run test`, not `bun test` directly — the suite is split across multiple isolated `bun test` processes (via [scripts/run-tests.ts](scripts/run-tests.ts)) because several test files intentionally mock modules that other files under test rely on for real; running everything in one process lets those mocks leak across files. See the [Testing](CLAUDE.md#testing) section in `CLAUDE.md` for the full rationale.

## Documentation

- [CLAUDE.md](CLAUDE.md) — project conventions (architecture, styling, Prisma workflow, testing, mail)
- [docs/rbac.md](docs/rbac.md) — the permissions/roles model
- [docs/permissions-audit.md](docs/permissions-audit.md) — permission audit notes

## Contributing

Issues and pull requests are welcome. Before opening a PR:

1. `bun run lint` and `bun run format`
2. `bun run test`
3. If you touched `prisma/schema.prisma`, make sure a migration is included (`bun prisma migrate dev --name <description>`) and that the seed script still runs

## License

[MIT](LICENSE)
