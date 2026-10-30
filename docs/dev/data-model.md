# Data model

The schema is [`prisma/schema.prisma`](../../prisma/schema.prisma) (about 1,800
lines, 60-odd models), the configuration is [`prisma.config.ts`](../../prisma.config.ts)
(Prisma 7 uses it as the entry point), and the generated client lands in
`lib/generated/prisma` (gitignored, created by `bun prisma generate`).

Database access goes through one client, `db` from [`lib/db.ts`](../../lib/db.ts),
a singleton on top of `pg` and the Prisma `pg` adapter. Use it only in Server
Components, Server Functions and route handlers, never in a client component.

## The model in groups

| Group                        | Models                                                                                                                    | What they are                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tenancy**                  | `Workspace`, `WorkspaceDomain`, `WorkspaceLink`, `SystemSettings`                                                         | A workspace is a tenant. `suspended` locks it without deleting. A domain claimed by a workspace lets matching sign-ups join automatically. `SystemSettings` is a single row of platform-wide switches. |
| **People**                   | `User`, `Account`, `Session`, `VerificationToken`, `Authenticator`                                                        | The person and how they sign in: OAuth accounts, magic-link tokens, passkeys (`Authenticator`).                                                                                                        |
| **Membership**               | `WorkspaceMember`, `Project`, `ProjectMember`, `Team`, `TeamMember`, `TeamProject`, `Invitation`, `InviteLink`            | Who is in which workspace and project, with which role. `ProjectMember` is the access decision for a project: no row, no access.                                                                       |
| **Roles**                    | `Role`, `Permission`, `RolePermission`                                                                                    | The permission registry and role bundles. See [Permissions](permissions.md).                                                                                                                           |
| **Work**                     | `Issue`, `IssueRelation`, `Comment`, `CommentReaction`, `Attachment`, `Label`, `ProjectHiddenLabel`                       | The issues and what hangs off them.                                                                                                                                                                    |
| **Workflow vocabulary**      | `Status`, `Priority`, `IssueType` and their `Workspace*` join tables, `IssueStatusEvent`                                  | The statuses, priorities and types, shared across workspaces.                                                                                                                                          |
| **Views and personal state** | `SavedView`, `SavedViewUserState`, `IssueViewPreference`, `MyIssuesViewPreference`, `ProjectUserState`, `UserPreferences` | Saved views and how each person arranged the app.                                                                                                                                                      |
| **Dashboards**               | `DashboardPreference`, `WorkspaceDashboardPreference`, `DashboardLayout`, `CustomWidget`, `DashboardNote`                 | Widget layouts and custom widgets.                                                                                                                                                                     |
| **Integrations**             | `ApiKey`, `OAuthClient`, `OAuthAuthorizationCode`, `OAuthAccessToken`, `OAuthRefreshToken`, `Webhook`                     | API keys, the OAuth server for MCP, outgoing webhooks.                                                                                                                                                 |
| **Operations**               | `Notification`, `AuditLog`, `MailTemplate`                                                                                | The inbox, the audit trail, admin-edited mail templates.                                                                                                                                               |

## Ideas that shape the schema

**Ids are strings.** Most ids are generated in code with a prefix (`uid("i")`
gives `i<uuid>`), some are `cuid()`. A **workspace's id is its slug**, which is why
URLs read `/acme/...`. A project has an id and a human `slug` plus a `prefix`
(`WEB`); an issue has a per-project counter `key`, so its reference is `WEB-42`.
The counter lives on the project (`lastIssueKey`) and is incremented atomically
whenever an issue is created.

**Rich text is JSON, with a text twin.** `Issue.description` and `Comment.body`
are ProseMirror documents (`Json`). Next to each sits a derived text column
(`descriptionText`, `bodyText`), rewritten on **every** write from
`toPlainText(doc)`, because `contains` does not work on `Json`. `Issue` also has a
generated `tsvector` column (title weighted above text) that Postgres keeps in
sync itself, used by the full-text search. Details in [Frontend](frontend.md#rich-text).

**Ordering is a float.** `Issue.rank` is a `Float`; dragging an issue between two
others gives it a rank between theirs (`features/issues/rank.ts`). No renumbering.

**Statuses are shared vocabulary.** `Status`, `Priority` and `IssueType` rows are
global and every workspace points at them through join tables
(`WorkspaceStatus` and so on). That is why a fresh installation must run the
**bootstrap** (below) before anyone can create a workspace. A status carries a
**category** (`backlog`, `unstarted`, `started`, `completed`, `canceled`); whether
an issue counts as open or closed hangs on the category, never on the status's name.

**History where metrics need it.** `Issue.closedAt` is its own column (set when
the status becomes `completed`/`canceled`, cleared when work resumes), because
`updated` changes with every later edit and would make throughput and cycle time
wrong in hindsight. `IssueStatusEvent` is append-only: one row per status change,
with the category frozen at that moment, which feeds the flow metrics on the
dashboard (cumulative flow, cycle time, burndown).

**Free-form where it avoids migrations.** `AuditLog.meta` and `targetType` are
free-form, `ApiKey.scopes` is a string array rather than an enum, so a new audit
event or a new scope needs no migration. The audit row freezes the actor's name
and colour at the time so it stays readable after the account is gone.

**Secrets are hashed, except where they must not be.** API keys and OAuth tokens
are stored as SHA-256 digests (they carry 256 bits of randomness, so a slow
password hash adds nothing); the raw value is shown once. A webhook **secret** is
stored in the clear because it has to be read back to sign every delivery.

## Changing the schema

Always do all three steps. Doing one alone breaks something.

```
1. Edit prisma/schema.prisma
2. bun prisma migrate dev --name <what-changed>   creates the migration and regenerates the client
3. Update the seed and every action/query that must know the new field
```

- Step 1 alone leaves client and database out of sync. Step 2 without 1 creates
  no migration. Forgetting 3 breaks `prisma/seed.ts` and with it `bun run db:reset`.
- **A new NOT NULL column without a default** needs a hand-written backfill in the
  generated `migration.sql`; Prisma cannot guess one:

  ```sql
  ALTER TABLE "Model" ADD COLUMN "field" TEXT;
  UPDATE "Model" SET "field" = <backfill>;
  ALTER TABLE "Model" ALTER COLUMN "field" SET NOT NULL;
  ```
- **Never leave a directory under `prisma/migrations/` without a
  `migration.sql`.** It breaks `migrate deploy` with error `P3015`.
- Migrations are applied in order and **never edited after they have shipped**.
  Fix a mistake with a new migration.
- Migrations run on every start of the app container (`docker/entrypoint.sh`),
  using a database-wide advisory lock, so replicas starting together apply each
  migration once.
- A new **permission** is not a schema change but needs provisioning. See
  [Permissions](permissions.md#introducing-a-new-permission).

## Seed and bootstrap

|             | `prisma/bootstrap.ts`                                                                                             | `prisma/seed.ts`                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Purpose     | What every installation needs: the global statuses, priorities and types, the shared permissions and system roles | Demo data for development: the Nimbus workspace, people for every role, projects, issues |
| Destructive | No, idempotent (upserts and `skipDuplicates`)                                                                     | **Yes**, deletes every row first                                                         |
| Runs        | At every start of the app container, and from `bun run db:up`                                                     | `bun run db:dev`, `db:seed`, `db:reset`                                                  |

`seed.ts` calls the bootstrap instead of duplicating it, so the two cannot drift.
If you add global vocabulary or a system role, it goes into the bootstrap path.

## Language of comments

Code comments and documentation are English. The older doc comments inside
`schema.prisma` are German; leave them as they are, and write new ones in English.
