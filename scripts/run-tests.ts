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
    "tests/unit/plugins",
    "tests/unit/plugin-stores",
    "tests/unit/plugin-approval",
    "tests/unit/store-catalog",
    "tests/unit/store-settings",
    "tests/unit/secrets",
    // A trailing slash: a path is a filter (a prefix of the file's path), and without one it would
    // also take in `custom-fields-actions`, `-modal` and the others that have a process of their own.
    "tests/unit/custom-fields/",
  ],
  ["tests/unit/permissions/resolver.test.ts"],
  // Own invocation: sharing segment 0 with tests/unit/projects made
  // projectMembers.test.ts fail on `db.workspace.findUnique` inside
  // sendInvitationEmail — a module-cache race triggered merely by this
  // file's presence in that process, not by anything it mocks itself (it
  // mocks nothing). See the "always use `bun run test`" races in CLAUDE.md.
  ["tests/unit/realtime"],
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
  // Mocks `@/auth`, `@/lib/permissions`, `@/lib/current-workspace` and `@/lib/db`
  // for the services the plugin host offers (`lib/plugins/services.ts`); other
  // files test the real permissions and session code, or mock them differently.
  ["tests/unit/plugin-host"],
  // Writing the definitions of custom fields (`features/custom-fields/actions`): replaces the database,
  // the permissions, the audit log and `next/cache`.
  ["tests/unit/custom-fields-actions/"],
  // What the screens read of the definitions (`features/custom-fields/queries`): replaces the database and
  // the permissions differently from the actions' tests.
  ["tests/unit/custom-fields-queries/"],
  // The window for a custom field at work: it replaces `react`'s hooks with a list and the actions
  // that write a definition, so it cannot share a process with the section's tests (which replace
  // them differently) or with the actions' own.
  ["tests/unit/custom-fields-modal/"],
  // The list of a workspace's or a project's fields: the same stand-in hooks, and stand-ins for the
  // window's opener, the confirmation and the actions.
  ["tests/unit/custom-fields-section/"],
  // Answering a field on an issue (`features/custom-fields/valueActions`): replaces the database, the
  // permissions, the issue's audit helper and `next/cache`.
  ["tests/unit/custom-fields-values/"],
  // The answers on the issue's detail view (`IssueCustomFields`, the value and the editor): the value
  // view and the editor need only stand-ins for `next-intl` and the avatar; the section replaces
  // `react`'s hooks, so it has a folder of its own.
  ["tests/unit/custom-fields-issue/"],
  // Creating an issue with answers (`createIssue`): replaces the database, the permissions and what
  // `features/issues/actions` reaches into (notify, webhooks, cache); the values module is the real one.
  // `tests/unit/issues/updateIssue.test.ts` binds `features/issues/actions` to its own database stand-in,
  // so this cannot share its process.
  ["tests/unit/custom-fields-create/"],
  // What a board or list shows of the custom fields: the real preference readers
  // (`features/issues/queries`) and the loader against a stand-in database; `tests/unit/issues` binds
  // that module to its own.
  // The composer's one-line row of chips with its "more" menu (`components/ui/layout/ChipOverflow`): it
  // replaces `react`'s `useState` and `useRowFit`.
  ["tests/unit/chip-overflow/"],
  ["tests/unit/custom-fields-view/"],
  // Choosing them (`features/issues/actions`): its own database stand-in, like `custom-fields-create`.
  ["tests/unit/custom-fields-view-actions/"],
  ["tests/unit/custom-fields-issue-fields/"],
  // What a plugin reads of its own settings (`ctx.settings`): replaces the database and the
  // permissions, and reads the request's workspace through the reader `setCurrentWorkspaceId` publishes.
  ["tests/unit/plugin-host-settings"],
  // Mocks `@/lib/plugins/host` (the registry) for the actions that switch plugins on and
  // off and remove them; `tests/unit/plugin-host` tests the real one.
  ["tests/unit/plugin-lifecycle"],
  // Mocks the plugin actions and the registry for the plugins page (`features/plugins/queries`,
  // `PluginsAdmin`); `tests/unit/plugin-approval` and `plugin-lifecycle` test the real ones.
  ["tests/unit/plugin-admin"],
  // The same for a workspace's plugins page and what it reads (`features/plugins/workspaceQueries`,
  // `WorkspacePlugins`): they replace the registry, the switch and the workspace actions.
  ["tests/unit/plugin-workspace"],
  // Mocks the actions the store page calls, the registry-free store query and its dialogs;
  // `tests/unit/store-settings` and `plugin-lifecycle` test the real ones.
  ["tests/unit/plugin-store-page"],
  // The parts of the store page (card, featured shelf, dialogs) for real, with stand-ins only for
  // the buttons and the switch; `plugin-store-page` replaces the card and the shelf.
  ["tests/unit/plugin-store-parts"],
  // Replaces `hashPluginDirectory` (`@/lib/plugins/integrity`) to make the hash of a
  // plugin's files differ between two reads; `tests/unit/plugins/integrity.test.ts`
  // tests the real one.
  ["tests/unit/plugin-staging"],
  // Mocks `@/lib/db`, `@/lib/permissions`, `next/server` (`after`) and `node:dns/promises` for the
  // fetching of the stores that are on; `store-catalog` tests the download and the sync for real.
  ["tests/unit/store-sync"],
  // Mocks `@/lib/db`, `next/cache` and `node:dns/promises` for installing from a store; the store's
  // clone, the release, the plugin directory and the checks are real.
  ["tests/unit/store-install"],
  // Mocks `@/lib/db`, `@/lib/permissions` and `next/cache` for saving a plugin's settings
  // (`features/plugins/settingsActions`); the plugin directory and the checks are real.
  ["tests/unit/plugin-settings"],
  // The form of a plugin's settings: the state and the save as pure functions, the fields and the
  // window as markup. Mocks `next-intl` and `@iconify/react`.
  ["tests/unit/plugin-settings-ui"],
  // The same window at work: it replaces `react`'s hooks with a list, so it cannot share a process
  // with the markup tests above.
  ["tests/unit/plugin-settings-modal"],
  // Replaces `features/plugins/workspaceQueries` (tested for real in `plugin-workspace`) to test
  // what the plugins' settings area reads from it.
  ["tests/unit/plugin-settings-area"],
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
