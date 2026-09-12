import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [{ hostname: "www.gravatar.com" }],
  },
  // Next's file tracing misses both of these because neither is a static
  // import it can see: `lib/generated/prisma` is produced by `prisma
  // generate` (gitignored, not source Next scans), and the pg-*/@prisma/
  // client-* entries are hash-named node_modules symlinks that work around
  // the Turbopack+Bun externals bug (scripts/fix-turbopack-bun-externals.ts)
  // — the compiled server bundle requires them by that literal hashed name,
  // but nft's static analysis never resolves it back to the real packages.
  // Without this, `output: "standalone"` silently ships a server that
  // crashes on its first Prisma query. Deliberately NOT including the
  // `prisma` CLI package here — it drags in ~200MB of engine binaries
  // (schema engine, Prisma Studio) that the running app never needs;
  // `prisma migrate deploy` instead runs from the `builder` stage as a
  // separate one-off step (see docker-compose.prod.yml's `migrate` service).
  outputFileTracingIncludes: {
    "/*": [
      "lib/generated/prisma/**/*",
      "node_modules/pg-*/**/*",
      "node_modules/@prisma/client-*/**/*",
    ],
  },
  // The MCP/OAuth authorization spec (RFC 9728, RFC 8414) mandates these
  // exact `/.well-known/...` paths — but the App Router silently never
  // registers a route under a literally dot-prefixed folder (`app/.well-known/`
  // is treated like `.git`/`.next`, invisible to the router), and every
  // other top-level path here falls through to `app/[locale]/...`, which
  // 404s trying to read ".well-known" as a locale. Rewriting to real routes
  // under `app/api/oauth/well-known/` (a path shape the router does
  // register, and one `proxy.ts`'s matcher already excludes as `/api/*`)
  // is what actually exposes them at the spec-required URLs.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/well-known/protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/well-known/authorization-server",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
