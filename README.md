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

Barynt is a Linear/Jira-style issue tracker you run yourself. Workspaces contain projects, projects contain issues, and everything — statuses, priorities, issue types, labels, roles — is configurable per workspace instead of hard-coded. It ships as a single Next.js app plus Postgres, Redis and S3-compatible storage, and installs on your own server with one command — the whole stack, HTTPS via Caddy included — or on Kubernetes with a Helm chart.

## Features

- **Workspaces & projects** — multiple workspaces per instance, each with its own members, teams, projects, and settings
- **Issues** — rich-text descriptions and comments (Tiptap/ProseMirror), custom statuses, priorities, and issue types per workspace, labels, drag-and-drop ranking, file attachments
- **Role-based access control** — permissions are composed at the platform, workspace, and project scope, with built-in and custom roles (see [docs/rbac.md](docs/rbac.md))
- **Teams** — group members and projects for scoped visibility and assignment
- **Notifications** — in-app inbox plus optional email delivery per event type, with per-user preferences
- **Invitations** — invite by email or shareable link, to a workspace or directly into a project
- **Audit log** — tracked changes across workspaces for accountability
- **Public API** (`/api/v1`) — API keys with Redis-backed rate limiting
- **MCP server** (`/api/mcp`) — a remote [Model Context Protocol](https://modelcontextprotocol.io) server exposing workspaces, projects, issues, comments, and labels as tools. Authenticates either with a personal API key (same keys as the REST API) or via OAuth 2.1 — a connector-based client (Claude.ai, Claude Desktop) discovers the OAuth flow automatically from the server URL alone, dynamic client registration included, no key to paste. Point Claude Desktop, Claude Code, or any other MCP client at it to manage issues from your AI assistant.
- **Webhooks** — outgoing event notifications for integrating with other tools
- **Keyboard-driven UI** — command palette (`⌘K`/`Ctrl+K`), Vim-style list navigation (`j`/`k`), single-key issue actions (status, priority, assignee, labels, …) and `g`+letter "go to" navigation, all listed in an in-app `?` shortcut reference
- **Authentication, including SSO, at no extra cost** — passkeys (WebAuthn) by default, plus GitHub, Google, GitLab, Microsoft Entra ID, Apple, and any generic OIDC/SSO provider (Keycloak, Authentik, Okta, …), and email magic links via SMTP — every provider is a free config addition, not a paid/enterprise tier
- **Object storage** — avatars and issue attachments via any S3-compatible provider (bundled: [RustFS](https://github.com/rustfs/rustfs))
- **Internationalization** — English and German out of the box (`next-intl`)
- **Admin panel** — instance-wide administration and permission auditing

## Tech stack

|                           |                                                                               |
| ------------------------- | ----------------------------------------------------------------------------- |
| Framework                 | [Next.js 16](https://nextjs.org) (App Router), React 19                       |
| Language                  | TypeScript                                                                    |
| Database                  | PostgreSQL via [Prisma 7](https://www.prisma.io)                              |
| Auth                      | [Auth.js](https://authjs.dev) (passkeys, OAuth, OIDC, email)                  |
| Styling                   | SCSS Modules (no Tailwind)                                                    |
| Rich text                 | [Tiptap](https://tiptap.dev) / ProseMirror                                    |
| Rate limiting             | Redis                                                                         |
| Object storage            | S3-compatible (RustFS bundled, or any AWS S3-compatible provider)             |
| AI integration            | [Model Context Protocol](https://modelcontextprotocol.io) server (`/api/mcp`) |
| i18n                      | [next-intl](https://next-intl.dev)                                            |
| Package manager / runtime | [Bun](https://bun.sh)                                                         |
| Linting / formatting      | [Biome](https://biomejs.dev)                                                  |
| Testing                   | [Vitest](https://vitest.dev)/Bun test runner                                  |

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

| Command                                       | What it does                                      |
| --------------------------------------------- | ------------------------------------------------- |
| `bun run dev`                                 | Start the dev server                              |
| `bun run build` / `bun run start`             | Production build / start                          |
| `bun run lint` / `bun run format`             | Biome check / format                              |
| `bun run test`                                | Run the full test suite (see [Testing](#testing)) |
| `bun run test:watch`                          | Tests in watch mode                               |
| `bun run db:up`                               | Start Postgres + Redis only                       |
| `bun run db:dev`                              | Start services, migrate, and seed                 |
| `bun run db:reset`                            | Drop volumes and rebuild from scratch             |
| `bun run db:logs`                             | Tail the Postgres container logs                  |
| `bun prisma migrate dev --name <description>` | Create a new migration                            |

## Deployment

Three ways to run Barynt, all with the same prebuilt, multi-arch image (`ghcr.io/jafoson/barynt`, scanned and signed). On every start the app applies pending database migrations itself, so an update is only ever a new version.

### Install script (recommended)

On a Linux server (amd64 or arm64, 2 GB RAM or more):

```bash
curl -fsSL https://github.com/Jafoson/Barynt/releases/latest/download/install.sh | sh
```

The installer:

- checks the system and Docker, and offers to install Docker (official script, only after you confirm) if it's missing;
- downloads the release's `docker-compose.yml`, `Caddyfile` and `example.env` to `/opt/barynt` and checks each one against the release's `SHA256SUMS`;
- asks for your domain and generates every secret (`AUTH_SECRET`, the database password, the storage keys) into a `.env` only you can read;
- starts Barynt, waits until it answers, and tells you where to open it. The first account you create becomes the administrator.

Point **two** DNS records at the server and keep ports 80 and 443 open — HTTPS certificates are then fetched automatically:

| Record                     | Serves                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `issues.example.com`       | Barynt                                                                                                          |
| `files.issues.example.com` | Uploaded avatars and attachments (the browser loads them directly; their signed links need a host of their own) |

Without questions, e.g. from cloud-init:

```bash
curl -fsSL https://github.com/Jafoson/Barynt/releases/latest/download/install.sh | sh -s -- \
  --domain issues.example.com --yes
```

Other options: `--version 1.0.13` pins a release, `--dir` picks the directory, `--dry-run` shows what would happen, `--help` lists everything.

Prefer to read it before running it? Download it, verify its signature, then run it:

```bash
curl -fsSLO https://github.com/Jafoson/Barynt/releases/latest/download/install.sh
curl -fsSLO https://github.com/Jafoson/Barynt/releases/latest/download/install.sh.sigstore.json
cosign verify-blob install.sh --bundle install.sh.sigstore.json \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github.com/Jafoson/Barynt/'
less install.sh && sh install.sh
```

Afterwards the same script is installed as `barynt`:

| Command                                      | Does                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `barynt status`                              | Containers, version, health                                                                                      |
| `barynt upgrade`                             | Newest version (or `--version X.Y.Z`), with a backup first                                                       |
| `barynt backup` / `barynt restore <archive>` | Database, uploaded files and `.env` in one archive (`/opt/barynt/backups`)                                       |
| `barynt logs [service]`                      | Follow the logs (`app`, `postgres`, `caddy`, …)                                                                  |
| `barynt config`                              | Change the domain or set up email (SMTP); `barynt config KEY=VALUE` for anything listed in [example.env](example.env) |
| `barynt doctor`                              | Check Docker, memory, disk, DNS and health                                                                       |
| `barynt start` / `stop` / `restart`          | Start, stop or restart all services                                                                              |
| `barynt uninstall`                           | Remove the containers; `--purge` also deletes all data                                                           |

macOS works for trying it out (`~/barynt`, Docker Desktop required), not for production.

### Docker Compose by hand

The installer only automates this. Take the files from a release rather than `main`, so they match the image:

```bash
mkdir barynt && cd barynt
for f in docker-compose.yml Caddyfile example.env SHA256SUMS; do
  curl -fsSLO "https://github.com/Jafoson/Barynt/releases/download/v1.0.13/$f"
done
sha256sum -c --ignore-missing SHA256SUMS

{
  echo 'BARYNT_VERSION="1.0.13"'
  echo 'DOMAIN="issues.example.com"'
  echo 'FILES_DOMAIN="files.issues.example.com"'
  echo 'AUTH_URL="https://issues.example.com"'
  echo 'COMPOSE_S3_PUBLIC_ENDPOINT="https://files.issues.example.com"'
  echo "AUTH_SECRET=\"$(openssl rand -hex 32)\""
  echo "POSTGRES_PASSWORD=\"$(openssl rand -hex 32)\""
  echo 'S3_ACCESS_KEY_ID="barynt"'
  echo "S3_SECRET_ACCESS_KEY=\"$(openssl rand -hex 32)\""
} > .env
chmod 600 .env

docker compose --profile app up -d
```

This starts the app, Postgres, Redis, the bundled [RustFS](https://github.com/rustfs/rustfs) object storage and [Caddy](https://caddyserver.com) as the reverse proxy, with automatic Let's Encrypt HTTPS for both domains. Every service besides Caddy binds to `127.0.0.1` — only ports 80/443 are meant to be public. [example.env](example.env) lists every other option: sign-in providers, SMTP, an external Postgres or S3, ports.

**Updating:** set `BARYNT_VERSION` to the new release (and refresh `docker-compose.yml` and `Caddyfile` from it), then run `docker compose --profile app up -d` again. Pending migrations run on start. Set `MIGRATE_ON_START=false` if your database is migrated elsewhere, and `MIGRATE_DATABASE_URL` if migrations need a database user other than the app's.

### Kubernetes (Helm)

```bash
helm install barynt oci://ghcr.io/jafoson/charts/barynt --version 1.0.13 \
  -n barynt --create-namespace -f values.yaml
```

The chart bundles Postgres, Redis and RustFS for a quick start; for production, point it at an external database, Redis and S3 and enable the ingress (with `ingress.filesHost` for uploads to the bundled storage). It runs under the restricted Pod Security Standard and ships a PodDisruptionBudget, optional NetworkPolicies and optional nightly database backups. Everything is in the [chart's README](deploy/helm/barynt/README.md), with [examples/values-production.yaml](deploy/helm/barynt/examples/values-production.yaml) as a starting point.

The chart is signed:

```bash
cosign verify ghcr.io/jafoson/charts/barynt:1.0.13 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github.com/Jafoson/Barynt/'
```

### Working on Barynt itself

Clone the repo and uncomment the `build:` lines on `app` in `docker-compose.yml` to run your own changes: `docker compose --profile app up -d --build`.

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
