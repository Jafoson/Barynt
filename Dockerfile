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
# the `prisma` CLI package drags in ~200MB of engine binaries (schema
# engine, Prisma Studio) that the running app itself never needs — it only
# ever talks to Postgres through `@prisma/client` + the `pg` driver adapter,
# no engine binary involved. Migrations instead run once from the `builder`
# stage, which already has the full toolchain (see docker-compose.yml's
# `migrate` service, `build.target: builder`, behind the "app" profile).

ARG BUN_VERSION=1

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
# builder: prisma client + next build (also doubles as the migration
# runner — see docker-compose.prod.yml)
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
