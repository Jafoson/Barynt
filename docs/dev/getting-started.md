# Getting started

Run Barynt on your machine in about ten minutes.

## What you need

- **[Bun](https://bun.sh)**, the package manager and runtime. CI and the Docker
  image pin an exact version (see `bun-version` in
  [`tests.yml`](../../.github/workflows/tests.yml) and `BUN_VERSION` in the
  [`Dockerfile`](../../Dockerfile)); use that one. Bun releases have broken the
  test suite before, which is why it is pinned, see [Testing](testing.md).
- **[Docker](https://www.docker.com)** for PostgreSQL and Redis (and, if you
  like, a local mail catcher and object storage).
- A browser with passkey support (any current one), if you want to sign in
  without setting up mail.

## First run

```bash
bun install                       # also runs the postinstall patch for Turbopack
cp example.env .env               # the defaults match docker-compose.yml
bun run db:dev                    # Postgres + Redis, migrations, demo data
bun run dev                       # http://localhost:3000
```

`example.env` already contains a development `AUTH_SECRET`. For anything that is
not your laptop, generate a real one with `bunx auth secret`.

`bun run db:dev` does four things in a row (see `package.json`): starts Postgres
and Redis from [`docker-compose.yml`](../../docker-compose.yml), runs
`prisma generate`, applies the migrations, and runs the **seed**.

> [!WARNING]
> The seed (`prisma/seed.ts`) **deletes every row first** and writes demo data.
> It is for development databases only. The non-destructive part that every
> installation needs, the system statuses, priorities, types and roles, lives
> in `prisma/bootstrap.ts` and is what production runs. See [Data model](data-model.md).

## The demo data

The seed creates a workspace called **Nimbus** with people whose names tell you
their role: `owner@nimbus.io`, `admin@nimbus.io`, `manager1@nimbus.io`,
`projectlead1@nimbus.io`, `member1@nimbus.io`, `viewer1@nimbus.io` and so on,
plus a platform admin, a platform support account, a deactivated account and
projects with issues. The point is that you can open the member list, see who
holds which permissions, and sign in as that person to check what they can do.

## Signing in locally

Barynt has **no passwords**. The seeded accounts therefore have no way in
yet. Pick one of these:

- **Magic link through a local mail catcher** (best for the seeded accounts).
  Start Mailpit, point the app at it, and ask for a sign-in link:

  ```bash
  docker compose --profile dev up -d mailpit
  # in .env:  SMTP_HOST="localhost"  SMTP_PORT="1025"   (then restart bun run dev)
  ```

  Open `http://localhost:3000`, enter `owner@nimbus.io`, and read the mail at
  `http://localhost:8025`. The mail holds a link and a short code.
- **A passkey for a new account.** "Register with passkey" on the login page
  works on `localhost` without any setup. A new account is a new person: it
  sees nothing until it joins a workspace (an invitation, or a domain you claim
  for a workspace).
- **An OAuth provider**, if you set `AUTH_<ID>_ID`/`AUTH_<ID>_SECRET` in `.env`
  (see [Authentication](authentication.md)).
- **For automated checks**, mint a session cookie yourself. The screenshot
  recorder for the user guide does exactly that, see
  [`scripts/docs-shots/capture.mjs`](../../scripts/docs-shots/capture.mjs).

Without `SMTP_HOST` the app sends no mail at all. Everything still works, but
an existing account without a passkey cannot sign in (a magic link is the only
proof the address is theirs).

## Optional services

| Need                    | How                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mail                    | Mailpit as above, or any SMTP server (`SMTP_*` in `.env`).                                                                                                                                                                                                                                                                                                                                          |
| Attachments and avatars | S3-compatible storage. The bundled RustFS comes with the `app` profile: `docker compose --profile app up -d rustfs rustfs-init`, then in `.env` set `S3_ENDPOINT="http://localhost:9000"`, `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` to `rustfsadmin` and the buckets `S3_BUCKET_AVATARS="avatars"`, `S3_BUCKET_ISSUES="issues"` (see `example.env`). Without `S3_ENDPOINT` uploads are simply off. |
| Redis                   | Started by `db:dev`. Used for the API rate limit only, see [Backend services](backend-services.md).                                                                                                                                                                                                                                                                                                 |

Every variable is described in `example.env`, and for operators in the user
guide's [Configuration](../guide/en/getting-started/config.md).

## Daily commands

| Command                                | What it does                                                               |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `bun run dev`                          | The dev server (Turbopack).                                                |
| `bun run lint`                         | Biome check (lint and format check). `bun run format` fixes formatting.    |
| `bun x tsc --noEmit`                   | Type check. CI runs it next to lint.                                       |
| `bun run test`                         | The whole test suite. **Not** `bun test`, see [Testing](testing.md).       |
| `bun run test:watch`                   | Tests in watch mode.                                                       |
| `bun run db:up`                        | Only Postgres and Redis, plus migrations and bootstrap (no demo data).     |
| `bun run db:dev`                       | Services, migrations, **seed** (destroys data).                            |
| `bun run db:reset`                     | Throw away the volumes and rebuild everything.                             |
| `bun run db:logs`                      | Follow the Postgres log.                                                   |
| `bun prisma migrate dev --name <what>` | Create a migration after a schema change. See [Data model](data-model.md). |
| `bun run icons:build`                  | Regenerate the icon bundle after adding or removing an icon.               |
| `bun run docs:api`                     | Regenerate the API reference pages of the user guide.                      |

Before you push: `bun run lint`, `bun x tsc --noEmit` and `bun run test` should
all be green. That is what CI runs.

## Running the production image locally

`docker compose --profile app up -d --build` builds the image and starts the
whole stack including HTTPS through Caddy (uncomment the `build:` lines on `app`
in `docker-compose.yml` to build instead of pulling). The app container applies
pending migrations when it starts. More in [Build, release and operations](build-and-release.md).

## Troubleshooting

- **"Invalid Server Actions request" in a Codespace or behind a tunnel.** Next
  checks the request origin. `next.config.ts` allows `localhost:3000` inside a
  Codespace; for a tunnel, open the app through the origin you configured.
- **Opening the dev server from a phone on your network never becomes
  interactive.** Next blocks client chunks for foreign origins in dev; add your
  address to `allowedDevOrigins` in `next.config.ts`.
- **`next build` crashes at "collecting page data".** Modules read their
  configuration at import time; the build uses placeholder values (see the
  `builder` stage of the Dockerfile). Do not make a module connect to a service at
  import time without an error handler (see `lib/redis.ts` for why).
- **Prisma errors after pulling.** Run `bun prisma generate` and
  `bun prisma migrate deploy` (or `bun run db:dev` to start over).
