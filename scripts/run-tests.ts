/**
 * Runs the unit test suite as a series of separate `bun test` processes —
 * see the "always use `bun run test`" section in CLAUDE.md for why a single
 * `bun test` invocation across all of `tests/unit/` doesn't work: Bun 1.3+
 * shares its module cache within one process, so a `mock.module()` call in
 * one file can leak into another file's real implementation (or vice
 * versa). Each segment below is a group of files that are safe to share a
 * process with each other, but not with files outside the group.
 *
 * Each segment writes a JUnit report plus its raw console output under
 * `test-results/`; `scripts/test-summary.ts` reads both to build the
 * GitHub Actions job summary (the JUnit file has structured pass/fail/time
 * per test, but Bun's `<failure>` elements carry no message — that only
 * shows up in the console output).
 */

const COVERAGE = process.argv.includes("--coverage");

const SEGMENTS: string[][] = [
  [
    "tests/unit/auth",
    "tests/unit/workspace/createWorkspace.test.ts",
    "tests/unit/workspace/pendingInvitations.test.ts",
    "tests/unit/workspace/workspaceAvatar.test.ts",
    "tests/unit/workspace/workspaceDomains.test.ts",
    "tests/unit/workspace/workspaceSettings.test.ts",
    "tests/unit/issues",
    "tests/unit/tabbar",
    "tests/unit/projects",
    "tests/unit/invitations",
    "tests/unit/admin/breakGlass.test.ts",
    "tests/unit/admin/mailTemplates.test.ts",
    "tests/unit/admin/platformAccounts.test.ts",
    "tests/unit/admin/platformQueries.test.ts",
    "tests/unit/admin/platformWorkspaces.test.ts",
    "tests/unit/audit",
    "tests/unit/i18n",
    "tests/unit/dashboard",
    "tests/unit/permissions/rbac.test.ts",
    "tests/unit/permissions/roleActions.test.ts",
    "tests/unit/permissions/roleManagerView.test.ts",
    "tests/unit/api-keys/apiAuth.test.ts",
    "tests/unit/api-keys/createApiKey.test.ts",
    "tests/unit/api-keys/revokeApiKey.test.ts",
    "tests/unit/api-keys/cursor.test.ts",
    "tests/unit/api-keys/rateLimit.test.ts",
    "tests/unit/webhooks",
  ],
  ["tests/unit/permissions/resolver.test.ts"],
  ["tests/unit/session"],
  ["tests/unit/richtext", "tests/unit/table", "tests/unit/ui"],
  ["tests/unit/account"],
  ["tests/unit/notifications"],
  ["tests/unit/mail/send.test.ts"],
  [
    "tests/unit/mail/config.test.ts",
    "tests/unit/mail/templates.test.ts",
    "tests/unit/mail/override.test.ts",
    "tests/unit/mail/catalog.test.ts",
    "tests/unit/mail/preview.test.ts",
  ],
  ["tests/unit/storage/avatars.test.ts"],
  ["tests/unit/storage/attachments.test.ts"],
  [
    "tests/unit/storage/config.test.ts",
    "tests/unit/storage/keys.test.ts",
    "tests/unit/storage/presign.test.ts",
  ],
  ["tests/unit/api-keys/route.test.ts"],
  ["tests/unit/api-keys/richtext.test.ts"],
  // Tests `@/lib/system-settings` for real; `workspace/createWorkspace.test.ts`
  // mocks that module away entirely, and the mock would otherwise win the
  // module-cache race for the rest of segment 0 — see CLAUDE.md.
  ["tests/unit/admin/systemSettings.test.ts"],
  // Mocks `@/lib/app-url` (for a deterministic canonical MCP resource URI
  // in the exchange/verify tests) — `lib/invitations.ts`,
  // `lib/invite-links.ts`, `lib/issue-share.ts`, and the mail templates all
  // import the real `appUrl`/`appBaseUrl`, and plenty of segment-0 tests
  // exercise those. Same module-cache-race risk as every other case here.
  ["tests/unit/oauth"],
  // Real `next/server` import — patches process-wide globals, see CLAUDE.md.
  ["tests/unit/proxy"],
  // Mocks `@/lib/project-membership` away entirely — see CLAUDE.md.
  [
    "tests/unit/workspace/inviteLinks.test.ts",
    "tests/unit/workspace/inviteWorkspaceMember.test.ts",
    "tests/unit/workspace/removeMember.test.ts",
    "tests/unit/workspace/teams.test.ts",
  ],
];

async function runSegment(paths: string[], index: number): Promise<number> {
  const args = ["test", ...paths];
  if (COVERAGE) args.splice(1, 0, "--coverage");

  const part = String(index).padStart(2, "0");
  let outFile: Bun.BunFile | undefined;
  if (!COVERAGE) {
    args.splice(1, 0, `--reporter-outfile=test-results/part-${part}.xml`);
    args.splice(1, 0, "--reporter=junit");
    outFile = Bun.file(`test-results/part-${part}.log`);
  }

  const proc = Bun.spawn(["bun", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Bun's default reporter (file headers, error detail, the `(pass|fail)`
  // lines, the run summary) writes to stderr; stdout only carries the
  // version banner. Only stderr needs to land in the log file that
  // `test-summary.ts` parses for failure detail — both still stream to the
  // terminal for a normal `bun run test` experience.
  const writer = outFile?.writer();
  const forward = async (
    stream: ReadableStream<Uint8Array>,
    sink: NodeJS.WriteStream,
    capture: boolean,
  ) => {
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sink.write(value);
      if (capture) writer?.write(value);
    }
  };
  await Promise.all([
    forward(proc.stdout, process.stdout, false),
    forward(proc.stderr, process.stderr, true),
  ]);
  await writer?.end();

  return proc.exited;
}

async function main() {
  await Bun.$`mkdir -p test-results`.quiet();

  for (const [index, paths] of SEGMENTS.entries()) {
    const exitCode = await runSegment(paths, index);
    if (exitCode !== 0) process.exit(exitCode);
  }
}

main();
