# Testing

```bash
bun run test            # the whole suite, the one command that counts
bun run test:watch      # watch mode while you work
bun run test:coverage   # with a coverage report
bun run lint            # Biome
bun x tsc --noEmit      # types
```

> [!IMPORTANT]
> Use **`bun run test`, not `bun test`.** The suite is deliberately split into many separate
> `bun test` processes. Running everything in one process makes tests fail for reasons that have
> nothing to do with your change. You can run a single file with `bun test path/to/file.test.ts`
> while developing, but the gate is `bun run test`.

## The tools

Tests are plain **Bun test** (`bun:test`, with a Vitest-style API: `describe`, `it`/`test`,
`expect`, `mock`). All live under `tests/unit/`, in a folder per domain (`auth`, `issues`,
`permissions`, `api-keys`, `webhooks`, `mail`, …). `bunfig.toml` preloads
[`tests/setup.ts`](../../tests/setup.ts), which:

- mocks `server-only` (it throws outside a Next.js server context),
- **clears every `SMTP_*` and `S3_*` variable**, because Bun loads `.env` for tests too and a local
  Mailpit or RustFS setting would silently turn mail or storage "on" in the middle of a unit test,
- stubs `*.module.scss` imports so components render without a bundler (each class name maps to
  itself),
- provides a mock for `next/headers` cookies.

There is no database in unit tests. `@/lib/db` is **always mocked**, and what the code does
with it is the thing under test. Integration against a real database is not part of this suite.

## Why the suite is split

Bun shares its module cache between test files **inside one process**. A file that calls
`mock.module("@/lib/permissions", …)` replaces that module for every other file that runs
later in the same process, including a file that tests the *real* module. Order decides who
wins, and the winner can change with the Bun version or with a new file being added.

So the runner ([`scripts/run-tests.ts`](../../scripts/run-tests.ts)) holds an array of
**segments**. Each segment is a group of files that can safely share a process, and each runs in
its own `bun test` invocation, in order, stopping at the first failure. It writes a JUnit file and a
log per segment into `test-results/`, which `scripts/test-summary.ts` turns into the collapsible
summary on the GitHub Actions run.

### The rule

> **Never mock a module whose own tests run in the same process.**

Concretely, from the current segments:

| Mocked away by | Tested for real by | Therefore |
| --- | --- | --- |
| `permissions/roleActions.test.ts` mocks `@/lib/permissions` | `permissions/resolver.test.ts` | the resolver has its own segment |
| `notifications/notify.test.ts` mocks `@/lib/mail` | tests that rely on the real `sendInvitationEmail` | `notifications/` has its own segment |
| `mail/send.test.ts` mocks `lib/mail/config` and `transport` | `mail/config.test.ts` | `send.test.ts` has its own segment |
| Four workspace tests mock `@/lib/project-membership` | `projects/projectMembership.test.ts` and others | the four mockers share one segment |
| `workspace/createWorkspace.test.ts` mocks `@/lib/system-settings` | `admin/systemSettings.test.ts` | the latter has its own segment |
| `issues/getLabels.test.ts` replaces `react` with a stub | `react-dom/server` rendering | component tests run in a different segment |
| `oauth/` mocks `@/lib/app-url` | invitation, link and mail tests use the real one | `oauth/` has its own segment |
| `proxy/proxy.test.ts` imports the real `next/server` | everything that touches Next internals | it installs process-wide edge instrumentation, so it runs alone |

When you prefer a choice: **mock `@/lib/db`** (a small assumption that lets the real code run) over
mocking a sibling module.

### Adding a test file

1. Put it in the folder of its domain under `tests/unit/`.
2. Look at `SEGMENTS` in `run-tests.ts`:
   - If its **directory is listed as a whole** (`tests/unit/issues`, `tests/unit/notifications`, …), your
     file runs automatically.
   - If the directory is **listed file by file** (`workspace`, `admin`, `permissions`, `api-keys`, `mail`,
     `storage`), **a new file is not run until you add it** to a segment. Forgetting this means your
     test never executes, and nothing tells you.
3. If your test uses `mock.module(...)`, decide whether anything else in its segment tests that module
   for real. If so, give it its own segment with a comment saying why. If you are unsure, run the
   whole suite: a leak usually shows up as unrelated failures.

> [!NOTE]
> Bun releases have flipped these races before: a version bump once made 14 unrelated tests fail with
> no code change. That is why CI and the Docker image **pin an exact Bun version**. Bump it
> deliberately, with a full run of `bun run test`.

## Conventions

- **Mock the boundaries**, not your own code: `@/lib/db`, `@/lib/session` when the code reads the
  session, and per file `next/headers`, `jose`, `@/lib/mail` and so on.
- `beforeEach(() => mock.clearAllMocks())` (or the equivalent), so no state carries from one test to
  the next.
- **Assert on behaviour that matters**, for permissions and security: the call that must not
  happen (a write without permission), not only the happy path.
- Keep pure logic **dependency-free** (like `lib/richtext`, `lib/buckets.ts`, `lib/storage/keys.ts`) so it
  tests without mocks and runs in the browser, the server and scripts alike.
- A test file should say what it covers at the top, in one or two sentences; read a neighbour for the
  style.

## What the suite also guards

Some tests exist to keep generated or paired things in step. If one of these fails, fix the thing it
names, do not delete the test:

| Test | Fails when |
| --- | --- |
| `tests/unit/i18n/messages.test.ts` | a message key exists in only one language, or a key name contains a dot |
| `tests/unit/ui/iconBundle.test.ts` | an icon was added or removed without `bun run icons:build` |
| `tests/unit/docs/guide.test.ts` | a docs page lacks front matter or a group, a link or image points nowhere, or the generated API reference is stale (`bun run docs:api`) |
| `tests/unit/permissions/rbac.test.ts` | the permission registry is inconsistent (a key without a scope, a role listing an unknown key) |
| `tests/unit/release/` | the release-notes logic breaks |

## CI

[`tests.yml`](../../.github/workflows/tests.yml) runs on every push and on pull requests to `main`:

1. **Lint and typecheck:** `bun run lint` and `bun x tsc --noEmit`.
2. **Tests:** `bun run test`, then the job summary step (`if: always()`, so it also runs on failure).

Other workflows check the pieces that are not unit tests: the installer script (`installer.yml`, with
`shellcheck` and the shell tests in `tests/installer/`), the Helm chart (`helm-lint.yml`, including the
chart's unit tests in `deploy/helm/barynt/unittests`) and security scans (`security.yml`). See
[Build, release and operations](build-and-release.md).

`dorny/test-reporter` does not work here: Bun nests every `describe()` as its own `<testsuite>`, which
that parser reads as "no tests", and Bun's `<failure>` elements carry no message. The summary script
therefore matches XML test cases to the log's `(fail)` lines by rebuilding the label, a fact worth
knowing before you "simplify" it.
