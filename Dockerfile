# syntax=docker/dockerfile:1.7

# Barynt — production image, following Next.js's own recommended Docker
# pattern (`output: "standalone"`, see next.config.ts): the runtime stage
# ships only next's traced, pruned node_modules + build output, not the
# full dependency tree. Final image: ~460MB (measured), vs. ~1.5GB for a
# full-node_modules image without standalone output.
#
# Multi-arch by construction: every stage is built FROM oven/bun, which
# Bun publishes as a real multi-platform manifest (linux/amd64 + linux/arm64).
# Build natively for both with:
#
#   docker buildx build --platform linux/amd64,linux/arm64 -t barynt:latest --push .
#
# No cross-compilation tricks (no --platform=$BUILDPLATFORM) are used on
# purpose: `bun install` must run *for the target platform* so it resolves
# the correct native optional deps (@next/swc-*, @img/sharp-*) for that arch.
# buildx already takes care of that — one native (or emulated) build per
# platform — as long as the Dockerfile doesn't force a fixed platform itself.
#
# Getting standalone output to actually work here took two explicit
# `outputFileTracingIncludes` entries in next.config.ts — without them,
# Next's automatic file tracing (@vercel/nft) drops the generated Prisma
# client and the hash-named node_modules symlinks that work around the
# Turbopack+Bun externals bug (scripts/fix-turbopack-bun-externals.ts),
# and the standalone server crashes on its first request. See the comment
# there for why.
#
# `prisma migrate deploy` deliberately does NOT run from the runtime image:
# the `prisma` CLI package drags in engine binaries and Prisma Studio's own
# UI toolchain that the running app itself never needs — it only ever talks
# to Postgres through `@prisma/client` + the `pg` driver adapter, no engine
# binary involved. Migrations instead run from the dedicated `migrate` stage
# below (see docker-compose.yml's `migrate` service, `build.target: migrate`,
# behind the "app" profile) — its own isolated dependency set
# (`docker/migrate/package.json` + `bun.lock`), entirely separate from the
# app's, so next/react/tiptap/sass etc. never end up in it. Reusing the
# app's `builder` stage as-is used to be the previous approach; that put the
# full node_modules tree (~1GB, everything the app itself needs) plus the
# entire built app into an image whose only job is to run two one-shot CLI
# commands, ballooning it to ~1.9GB.

# Pinned, not the floating "1" major tag: a `docker build` on a later date
# would otherwise silently pull whatever the newest 1.x is at build time —
# see the `migrate-deps` stage below for a Bun-version-dependent regression
# this already caused once. Matches the version tests.yml pins for CI
# (AGENTS.md/CLAUDE.md have the full rationale for pinning it there too).
# Bump deliberately, alongside a full test-suite run, not via a Dependabot
# auto-merge.
#
# Bumped from 1.3.14 (2026-09-15): 1.3.14's JSC GC has a segfault that hit
# `bun run build` reliably inside `docker buildx build` on GitHub Actions'
# ubuntu-24.04 runners (not locally — hardware/timing-sensitive), matching
# multiple upstream reports of the same JSC GC instability in that release
# (oven-sh/bun#31832, #31939, #31159). Confirmed clean on 1.4.2: local
# `docker build --target runner` plus the full `bun run test` suite in an
# `oven/bun:1.4.2-slim` container, specifically checking for the
# module-cache race described below (none observed).
ARG BUN_VERSION=1.4.2

# ---------------------------------------------------------------------------
# deps: full install (build needs the TypeScript compiler etc.)
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS deps
WORKDIR /app

# package.json + bun.lock first (and the postinstall script they call) so
# `bun install` is cached across builds as long as dependencies don't change.
COPY package.json bun.lock ./
COPY scripts/fix-turbopack-bun-externals.ts ./scripts/fix-turbopack-bun-externals.ts
# On a BuildKit-enabled Docker (buildx installed) you can speed repeat builds
# up further with a cache mount:
#   RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
# Left out by default so a plain `docker build` keeps working everywhere.
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# builder: prisma client + next build, for the `runner` stage below
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time placeholders only, never real secrets: `next build` evaluates
# modules that read these at import time (Auth.js, the Prisma datasource
# url), but no page in this app is statically generated against the
# database — actual values are injected at container start.
ENV NODE_ENV=production \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build-time-placeholder-unused-at-runtime"

RUN bun prisma generate
RUN bun run build

# ---------------------------------------------------------------------------
# runner: standalone output only, non-root
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS runner
WORKDIR /app
# `next start` isn't used here — the standalone server.js is a self-
# contained entrypoint with its own env handling: `hostname =
# process.env.HOSTNAME || '0.0.0.0'`. Docker sets HOSTNAME to the
# container ID for every container unless overridden, which server.js
# then dutifully binds to instead of the "|| '0.0.0.0'" fallback —
# reachable from the host (its published-port NAT target happens to
# resolve the same way) but NOT from 127.0.0.1 inside the container
# itself, which silently broke this image's own HEALTHCHECK and anything
# depending on it (e.g. Caddy's `depends_on: condition: service_healthy`)
# until caught here. Must be set explicitly.
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# oven/bun:*-slim pins a Debian snapshot at publish time, so it drifts
# behind Debian's own security updates (gzip, perl-base, libsqlite3-0,
# libpcre2-8-0 CVEs — all "fixed" upstream but not yet in the base image)
# between Bun releases. `apt-get upgrade` pulls those patched packages in
# at build time instead of waiting on the next Bun bump; the Trivy scan in
# docker-build.yml (`ignore-unfixed: true`) fails the build on exactly
# this class of gap, since a fix is available even though Bun hasn't
# republished the base image yet.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# The base image already ships an unprivileged "bun" user (uid/gid 1000).
# Chown the still-empty WORKDIR and switch to it *before* copying anything
# in: a `RUN chown -R` after the fact would force an overlayfs copy-up of
# every file already in the image onto a new layer, silently doubling the
# image size for no reason. `--chown` on each COPY avoids that.
RUN chown bun:bun /app
USER bun

COPY --chown=bun:bun --from=builder /app/.next/standalone ./
COPY --chown=bun:bun --from=builder /app/.next/static ./.next/static
COPY --chown=bun:bun --from=builder /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000),{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server.js"]

# ---------------------------------------------------------------------------
# migrate-deps: isolated install for the one-shot migration image — its own
# package.json + bun.lock (docker/migrate/), not the app's. Keep the pinned
# versions there in sync with the matching entries in the root package.json.
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS migrate-deps
WORKDIR /app
COPY docker/migrate/package.json docker/migrate/bun.lock ./
RUN bun install --frozen-lockfile

# `@types/*` are TypeScript declaration files, never `require()`d as code —
# Bun strips types at run time without consulting them, so unlike in `deps`
# above (where `bun run build` actually type-checks), they're pure dead
# weight here.
#
# Deliberately NOT pruned: `prisma`'s own dependencies on Prisma Studio
# (`@prisma/studio-core`) and `prisma dev`'s embedded local-Postgres tooling
# (`@prisma/dev`), together the bulk of what's left (~65MB) — neither
# feature is ever invoked by `prisma generate`/`prisma migrate deploy`, but
# `prisma`'s CLI entrypoint reaches into both eagerly on module load on some
# Bun versions and not others (confirmed: deleting them broke `prisma
# generate` under 1.4.2 while working fine under 1.3.14, for a reason not
# visible from either package's own declared dependencies). Since `ARG
# BUN_VERSION` (top of file) floats, this stage would then silently start failing
# on the next `oven/bun:1-slim` pull with no code change to explain it —
# the class of Bun-version fragility AGENTS.md/tests.yml already pins an
# exact Bun version elsewhere to avoid. Not worth reintroducing it here for
# another ~65MB; see git history on this comment if revisiting.
RUN rm -rf node_modules/@types

# Only the handful of source files `prisma migrate deploy` +
# `prisma/bootstrap.ts` actually import — not `COPY . .`, which is what
# pulled the entire repo (and, transitively via the old `builder`-stage
# reuse, the whole Next.js build) into the previous migrate image.
COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY lib/rbac-provision.ts lib/workspace-defaults.ts ./lib/
COPY lib/rbac ./lib/rbac

# Same build-time-only placeholder as the `builder` stage above — `prisma
# generate` reads the schema, not a live database.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN bun prisma generate

# ---------------------------------------------------------------------------
# migrate: runs `prisma migrate deploy` + `prisma/bootstrap.ts` once against
# a real database (see docker-compose.yml's `migrate` service). Non-root,
# same as `runner`.
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS migrate
WORKDIR /app

RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

RUN chown bun:bun /app
USER bun

COPY --chown=bun:bun --from=migrate-deps /app/node_modules ./node_modules
COPY --chown=bun:bun --from=migrate-deps /app/prisma.config.ts /app/tsconfig.json ./
COPY --chown=bun:bun --from=migrate-deps /app/prisma ./prisma
COPY --chown=bun:bun --from=migrate-deps /app/lib ./lib

CMD ["sh", "-c", "bun prisma migrate deploy && bun prisma/bootstrap.ts"]
