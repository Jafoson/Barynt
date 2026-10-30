# Build, release and operations

How Barynt becomes an image, a Helm chart and a GitHub release, and what runs in CI. For
*operating* an installation (installing, upgrading, backups) see the user guide's
[Install](../guide/en/getting-started/install.md), [Manage](../guide/en/getting-started/manage.md),
[Docker Compose](../guide/en/getting-started/compose.md) and
[Helm](../guide/en/getting-started/helm.md) pages.

## The Docker image

[`Dockerfile`](../../Dockerfile), one image for everything. Its stages:

| Stage | Job |
| --- | --- |
| `deps` | `bun install --frozen-lockfile` (cached while `package.json` and `bun.lock` do not change). |
| `builder` | `prisma generate`, then `next build`, with **placeholder** `DATABASE_URL` and `AUTH_SECRET`. No page is generated against the database; real values arrive at container start. |
| `migrate-deps` | An isolated install of the Prisma CLI and engines under `/opt/migrate`, from `docker/migrate/package.json` and `bun.lock`. |
| `runner` | Next's **standalone** output (`output: "standalone"` in `next.config.ts`) plus the isolated migration set. Small, about 460 MB. |

Things that are easy to break:

- **Standalone tracing needs help.** Next's file tracing cannot see the generated Prisma client
  or the hash-named `node_modules` symlinks that work around a Turbopack-with-Bun externals bug
  (`scripts/fix-turbopack-bun-externals.ts`, run in `postinstall`). `next.config.ts` lists them in
  `outputFileTracingIncludes`, along with `releases/**` (the in-app release notes). Without those
  entries the server builds fine and **crashes on its first request**. If you add a file the app reads
  at runtime that is not a static import, it needs an entry there too.
- **The `prisma` CLI is not in the app's `node_modules`.** It drags in about 200 MB of engines and
  Studio that the running app never needs. The app talks to Postgres through `@prisma/client` and the
  `pg` adapter. Keep the versions in `docker/migrate/package.json` in step with the root
  `package.json`.
- **Multi-arch by construction.** Every stage is `FROM oven/bun`, a real multi-platform manifest, and
  nothing forces a platform, so `bun install` resolves the right native dependencies (`@next/swc-*`,
  `@img/sharp-*`) per architecture.
- **The Bun version is pinned** (`ARG BUN_VERSION`), the same version as `tests.yml`. A floating tag
  once pulled a Bun release that crashed `bun run build` on CI runners. Bump it deliberately, together
  with a full test run.

### What happens when the container starts

[`docker/entrypoint.sh`](../../docker/entrypoint.sh):

1. Unless `MIGRATE_ON_START=false`: `prisma migrate deploy` (retried up to ten times, because the
   database may still be starting), then `prisma/bootstrap.ts` (idempotent system data).
   `MIGRATE_DATABASE_URL` lets the migration use a database user that may change the schema while the
   app's own user may not.
2. `exec` the server.

`migrate deploy` takes a database-wide advisory lock, so several replicas starting together apply each
migration once. **Changing the image tag is the whole update.** There is no separate migrate image or job.

### Health

| Endpoint | Means | Used for |
| --- | --- | --- |
| `/api/health` | **Readiness**: the database answers within 3 seconds. Public, returns `status`, `version`, `checks`. | The installer, the compose health check, the Helm readiness and startup probes. |
| `/api/health/live` | **Liveness**: the process answers. Touches nothing else. | The Helm liveness probe. A liveness check that included the database would make Kubernetes restart every pod during a database outage, which fixes nothing. |

## Compose

[`docker-compose.yml`](../../docker-compose.yml) is one file for development *and* production, split
by **profiles**:

- No profile: `postgres` and `redis`. This is what `bun run db:up` starts; the app runs on the host.
- `dev`: `mailpit` (SMTP on 1025, UI on 8025).
- `app`: `app`, `rustfs` (S3-compatible storage), `rustfs-init` (buckets and CORS) and `caddy` (HTTPS).

`app` defaults to the published image `ghcr.io/jafoson/barynt` and its database URL is built from
`POSTGRES_*`; set `COMPOSE_DATABASE_URL`, `COMPOSE_S3_ENDPOINT`, `COMPOSE_SMTP_HOST` to point at
external services. Everything except Caddy binds to `127.0.0.1` by default. The variables and their
reasons are commented in the file and in `example.env`.

## CI workflows

All in [`.github/workflows/`](../../.github/workflows/).

| Workflow | Runs on | Does |
| --- | --- | --- |
| `tests.yml` | every push, PRs to `main` | Lint and typecheck, then `bun run test` and the summary. |
| `security.yml` | `main`, PRs, every Monday | CodeQL, dependency review, Gitleaks, a Trivy filesystem scan, OpenSSF Scorecard. |
| `installer.yml` | changes to the installer | `shellcheck`, the shell tests under `dash` and `bash`, and a real install in CI. |
| `helm-lint.yml` | changes to the chart | `helm lint` and rendering checks. |
| `docker-build.yml` | by hand, and called by `release.yml` | Builds per platform, scans with Trivy, pushes by digest, merges the manifest and signs it with cosign (keyless). |
| `helm-release.yml` | by hand, and called by `release.yml` | Lints, packages and pushes the signed chart as an OCI artifact. |
| `release.yml` | by hand | The release, below. |

Dependabot (`.github/dependabot.yml`) opens weekly updates for npm, GitHub Actions and Docker. Dev
dependencies are grouped. Merge them with a full test run, especially anything near Bun, Next or Prisma.

## Releasing

A release is **started by hand**: Actions → **Release** → *Run workflow* from `main`. Run it first without
`publish` and read the preview in the job summary. The full procedure and inputs are in
[`releases/README.md`](../../releases/README.md); in short, a published run:

1. writes `releases/<version>.md` and `.de.md`, bumps `package.json` and the Helm chart's `version`/`appVersion`,
   commits to `main`, tags `vX.Y.Z`;
2. creates the GitHub release with the English notes (German folded underneath) and the installer's files
   (`install.sh`, `docker-compose.yml`, `Caddyfile`, `example.env`), their checksums and a keyless cosign
   signature of `install.sh`;
3. builds, scans, pushes and signs the Docker image on the tag (`X.Y.Z` and `latest`, amd64 and arm64);
4. publishes the signed Helm chart;
5. tells [barynt-site](https://github.com/Jafoson/barynt-site) to rebuild for the new version
   (`repository_dispatch`, needs the secret `SITE_DISPATCH_TOKEN`; without it this step only warns).

**Commits drive the version.** Use Conventional Commits (`type(scope): summary`). `fix` bumps the patch,
`feat` the minor, a `!` or a `BREAKING CHANGE:` footer the major (below 1.0 both of those bump the minor).
`chore`, `docs`, `test` alone propose nothing. The generated block between the `changes:` markers in a notes
file is rewritten on every run; never edit it, and never edit `package.json`'s `version` by hand.
The logic is in `scripts/release/notes.ts` (tested in `tests/unit/release/`), the I/O in `scripts/release/cli.ts`.
If `main` is protected, pushing needs a secret `RELEASE_TOKEN`.

The notes are also shown **inside the app** (`lib/releases`, `features/releases`). It reads the files at runtime
and shows only the hand-written part, so write them for the person who upgraded.

## Documentation pipeline

The user guide in `docs/guide/` is published by
[barynt-site](https://github.com/Jafoson/barynt-site) (Astro with Starlight). At build time the site fetches
`docs/guide/` **at the release tag**, so the docs always match the version people run; `DOCS_REF` is the
fallback for a tag from before the docs existed, and `BARYNT_DOCS_DIR` points a local preview at your working
copy. English pages come from `docs/guide/en/`, German from `docs/guide/de/`, a missing German image
falls back to the English one. See [`docs/guide/README.md`](../guide/README.md) for writing pages and
previewing them. These developer docs (`docs/dev/`, English only) are published too, as the **Development** section of the same site: at build time
the site turns each page into a page of the guide (title from the first heading, the first paragraph as the lead, links to other
dev pages and to guide pages rewritten for the site, links to source files pointing at GitHub at the release tag). German visitors
see them in English with a notice. They stay plain Markdown that reads fine on GitHub, so do not add front matter to them.

## The installer

[`install.sh`](../../install.sh) is a POSIX `sh` script (`shellcheck`ed, tested under `dash` and `bash`). It is
also installed as the `barynt` command: `status`, `upgrade`, `backup`, `restore`, `logs`, `config`, `doctor`,
`uninstall`. The whole script is wrapped in functions and only `main` at the very end runs anything, so a download
that breaks off halfway through `curl | sh` does nothing at all. It installs the release's compose file, Caddyfile and
`.env`, then waits for `/api/health`. Tests: `tests/installer/test.sh`.

## The Helm chart

[`deploy/helm/barynt`](../../deploy/helm/barynt) deploys the same thing as the compose file. Its pieces:
`values.yaml` with a JSON schema (`values.schema.json`) that rejects bad values early, templates, example values
(`examples/`) and unit tests for the templates (`unittests/`, run with the `helm-unittest` plugin, no cluster
needed). Postgres and Redis come as simple bundled workloads rather than as subcharts; the chart's README explains
why, and covers secrets, external services, backups, SSO, Pod Security "restricted" and versioning. **The chart's
README is in German.** The chart is versioned with the app by the release workflow.

## Operations a developer should know

- **Single instance for now.** Besides the realtime store ([Backend services](backend-services.md#realtime-updates)),
  nothing else assumes one process. Run one replica of `app` unless you have moved that store.
- **Outgoing calls.** The app calls out only to the SMTP server, S3, OAuth/OIDC providers, the webhooks you configured,
  and GitHub for the update check (`UPDATE_CHECK=false` disables the last).
- **Secrets** are environment variables (`AUTH_SECRET`, `AUTH_*_SECRET`, `S3_SECRET_ACCESS_KEY`, `SMTP_PASS`, database
  URLs). API keys and OAuth tokens are stored as hashes; webhook secrets in clear, by design.
- **Backups** are the database and the S3 buckets. The installer and the chart offer ways to do both.
