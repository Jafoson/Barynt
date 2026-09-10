import { mock } from "bun:test";
import { plugin } from "bun";

// server-only throws when imported outside of Next.js server context
mock.module("server-only", () => ({}));

// Bun automatically loads `.env` for every invocation, including `bun test`
// — an SMTP_HOST set locally for Mailpit & co. would otherwise make
// `isMailConfigured()` turn true in the middle of a unit test, without any
// test expecting that or `@/lib/db` being mocked accordingly. Tests that
// check mail delivery itself (`tests/unit/mail/config.test.ts`) set the
// variables deliberately, on their own.
for (const name of [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
]) {
  delete process.env[name];
}

// The same risk as with SMTP: a `.env` set locally for rustfs would make
// `isStorageConfigured()` turn true in the middle of a unit test.
// `tests/unit/storage/config.test.ts` sets the variables deliberately, on its own.
for (const name of [
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET_AVATARS",
  "S3_BUCKET_ISSUES",
]) {
  delete process.env[name];
}

// Components import their SCSS modules directly — there's no bundler for
// that in tests. The stub returns each class's own name, so rendered class
// names stay readable.
plugin({
  name: "css-module-stub",
  setup(build) {
    build.onLoad({ filter: /\.(css|scss)$/ }, () => ({
      exports: {
        default: new Proxy({}, { get: (_target, key) => String(key) }),
      },
      loader: "object",
    }));
  },
});

// next/headers is a special Next.js module — it must be mocked in the preload
// so the mock is in place before lib/session.ts is imported in any test file.
// The mock functions are exposed via globalThis so session tests can assert on them.
const cookieFns = { set: mock(), get: mock(), delete: mock() };
(
  globalThis as unknown as { __mockCookieFns: typeof cookieFns }
).__mockCookieFns = cookieFns;

const headerFns = { get: mock(), has: mock(), entries: mock(() => []) };

mock.module("next/headers", () => ({
  cookies: () => Promise.resolve(cookieFns),
  // next-auth (via @/auth) imports `headers` — must be present in the mock.
  headers: () => Promise.resolve(headerFns),
}));
