# Backend services

The building blocks in `lib/` that features share. Most follow the same pattern:
a **narrow write function** that any domain can call without knowing about the
others, configuration **only from the environment**, and **no hard failure** when the
add-on is not configured.

| Block                                 | Folder                                 | Needed?              |
| ------------------------------------- | -------------------------------------- | -------------------- |
| [Mail](#mail)                         | `lib/mail`                             | Optional (SMTP)      |
| [Object storage](#object-storage)     | `lib/storage`                          | Optional (S3)        |
| [Redis](#redis)                       | `lib/redis.ts`, `lib/api/rateLimit.ts` | Only for API and MCP |
| [Realtime updates](#realtime-updates) | `lib/realtime`                         | Built in             |
| [Audit log](#audit-log)               | `lib/audit`                            | Built in             |
| [Notifications](#notifications)       | `lib/notify`                           | Built in             |
| [Webhooks](#webhooks)                 | `lib/webhooks`                         | Built in             |
| [Smaller pieces](#smaller-pieces)     | various                                | Built in             |

## Mail

SMTP only, configured through `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_FROM` (and `MAIL_COMPANY_NAME`/`MAIL_COMPANY_ADDRESS` for the
footer). **Without `SMTP_HOST` the app sends no mail** and every flow still works
(invitation links to copy, in-app notifications). `tests/setup.ts` clears every
`SMTP_*` variable before a test run, because Bun loads `.env` for tests too and a
local Mailpit setting would otherwise make `isMailConfigured()` true mid-test.

| File                      | Job                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/mail/config.ts`      | Reads the variables; `isMailConfigured()`.                                                                                                                              |
| `lib/mail/transport.ts`   | The nodemailer transport, reused while the config is unchanged.                                                                                                         |
| `lib/mail/send.ts`        | `sendMail()`: swallows errors, does nothing without config.                                                                                                             |
| `lib/mail/templates/*.ts` | One pure function per occasion: `(Input) → { subject, html, text }`, no DB access. `layout.ts` holds the frame, footer and table/alert helpers; `html.ts` the escaping. |
| `lib/mail/overrides.ts`   | Templates an admin edited (`MailTemplate`) override the defaults.                                                                                                       |
| `lib/mail/index.ts`       | Barrel plus `sendInvitationEmail()` and `sendMemberRemovedEmail()`, which load what they need themselves.                                                               |

Active callers: invitations and removals call the senders directly; everything else
goes through `notify()`. Some templates (`welcome`, `emailVerification`,
`passwordReset`, `weeklyDigest`, `issueUpdate`) exist but are **not wired up yet**.
The authoritative table is in [`CLAUDE.md`](../../CLAUDE.md#email-libmail).

**Adding a template:** write a function in `lib/mail/templates/` that uses
`renderLayout()` and returns `{ subject, html, text }`. Run **every value from the
database or from a user** through `escapeHtml()` before it enters the HTML (the plain
text version stays unescaped). Every input interface carries `to`, the recipient,
for the footer's "this email was sent to …". Register it in `features/mail-templates/catalog.ts` so the admin
editor and its live preview can find it.

## Object storage

For avatars (users, workspaces) and issue attachments. Any S3-compatible provider:
AWS S3, MinIO, the bundled RustFS. Configuration is `S3_ENDPOINT`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_AVATARS`, `S3_BUCKET_ISSUES`
(and `S3_PUBLIC_ENDPOINT` when the browser reaches the store under another address).
The two buckets are independent: avatars can work while attachments stay off.
**Without `S3_ENDPOINT` uploads are off** and avatars fall back to initials.

How it works:

- **Direct upload.** The server checks type and size and returns a **presigned PUT
  URL**; the browser uploads straight to storage. Nothing large passes through the
  app. The REST API also offers an inline base64 upload up to 10 MB.
- **Downloads** go through server-signed, time-limited URLs (one hour; the API says
  so as `urlExpiresAt`). Both buckets must be **private**.
- **Keys** carry a random suffix per upload. "Replace" means upload a new key, then
  delete the old one best-effort, never overwrite in place, so a cached signed URL
  cannot serve stale content.
- **Limits** (`lib/storage/validation.ts`): avatars 5 MB, attachments 100 MB, any file
  type. Permission checks stay _outside_ the storage code, in the calling action.
- **Path-style addressing** (`<endpoint>/<bucket>/<key>`) always, so it works the same
  everywhere. The client is `aws4fetch`, not the AWS SDK: the SDK breaks under
  Turbopack in dev (the comment in `lib/storage/client.ts` has the details).
- The bundled RustFS needs CORS on the buckets for browser uploads; the compose
  file's `rustfs-init` service sets it.

## Redis

Used for exactly one thing: the **per-key request counter** of the REST API and MCP
(`lib/api/rateLimit.ts`). A fixed window per key: `INCR`, `EXPIRE` 60 seconds on the
first hit, 120 requests allowed. Every response carries `X-RateLimit-*`; the rejected
ones `Retry-After`. Rejected requests still count.

The web app does not touch Redis, so a Redis outage affects API and MCP calls only.
`REDIS_URL` defaults to `redis://localhost:6379`. The client in `lib/redis.ts` registers
an `error` handler on purpose: ioredis emits an error on every failed connection and
retries forever, and an unhandled `error` event crashes the process (it once took down
`next build`, which imports every route against placeholder settings).

## Realtime updates

When someone changes issues, other open tabs should notice. The mechanism is
deliberately simple:

1. A Server Function calls `recordProjectChange(...)` (`lib/realtime/store.ts`), which
   remembers the most recent change **per workspace** in memory.
2. Open boards poll `GET /api/workspaces/[id]/updates` every 15 seconds
   (`useProjectUpdates`, also on `visibilitychange`, because browsers throttle timers
   in background tabs) and show a banner when the change is newer than what they know.
3. `lib/realtime/localMutation.ts` keeps a per-tab watermark so a tab does not announce
   its **own** change to itself.

Why polling and not SSE or WebSockets: a short GET has nothing for a reverse proxy, CDN
or tunnel to buffer or cut. Why in memory: one container, nothing needs to survive a
restart, and a lost notice is repaired by the next change.

> [!WARNING]
> The store is **per process**. With several `app` replicas, a poll can land on a
> replica that never saw the change. Before scaling out, move the store to Redis or a
> database column. The store also keeps its map on `globalThis`, because Next can bundle
> one module separately per layer (actions vs. route handlers) inside a single process, and
> two copies of the map would never meet.

## Audit log

`AuditLog` records who did what to what, for accountability: sign-ins, role changes,
deletions, break-glass access, issue changes.

- **Registry.** The events live in `lib/audit/actions.ts` (`AUDIT_ACTIONS`), dependency-free
  so the UI can name events without pulling Prisma into the bundle.
- **Two ways to write.** `recordAudit(input)` **swallows errors**: a sign-in must not
  fail because the log is jammed. `recordAuditIn(tx, input)` writes inside a running
  transaction and swallows nothing, for events where the entry is the point: the
  emergency membership and its log entry exist together or not at all.
- **Frozen context.** The row stores the actor's and target's _labels and colours at the
  time_, so it stays readable after a rename or deletion. `meta` is free-form JSON so a new
  kind of event needs no migration.
- **Reading** is `listAudit`/`countAudit` with filters, used by the workspace "Activity"
  page and the platform's audit view. The per-issue activity (`features/issues/audit.ts`)
  is built on the same table.

**Adding an event:** add the key to `AUDIT_ACTIONS` (with its translation in
`messages/*`), call `recordAudit` at the place it happens, and test it.

## Notifications

`notify()` (`lib/notify/index.ts`) writes the in-app inbox row and, if the person wants
it, an email. Like the audit log it is called from several domains and **swallows errors**:
a stumbling notification must never block an assignment, a comment or a role change.

- **Events:** `assigned`, `mentioned`, `comment`, `commentReply`, `status`, `invite`, `role`,
  `issueShared`. Nobody is notified about their own action.
- **Preferences:** each event has an in-app and an email switch per person
  (`UserPreferences.*InApp`, `*Email`). Defaults: everything on, except email for `comment`
  and `status`. The defaults sit in `EMAIL_DEFAULT` and must match `prisma/schema.prisma`.
- **Who is told:** a comment goes to the issue's assignee and creator, a reply to the
  parent comment's author, a mention to the mentioned person, a status change to
  assignee and creator.
- The mail's footer link "Manage notifications" points to the person's notification settings.

## Webhooks

`fireWebhookEvent(workspaceId, event, data)` (`lib/webhooks/deliver.ts`) is called without
`await` after the change succeeded. It finds the enabled webhooks of the workspace that
subscribed to the event and sends each a signed `POST`:
`{ event, timestamp, data }`, header `X-Barynt-Signature` = hex HMAC-SHA256 over
`<timestamp>.<body>` with the webhook's secret, and `X-Barynt-Timestamp`.

It is **one attempt with a ten-second timeout, no retries**. A retry needs a durable queue,
which the app does not have, so the outcome (status or error) is stored on the webhook row
(`lastDeliveryAt`, `lastDeliveryStatus`, `lastDeliveryError`) for the settings page. Events:
`lib/webhooks/events.ts`. Payload shapes and how to add an event: [API and MCP
internals](api-and-mcp.md#adding-a-webhook-event). For receivers, see the user guide's
[Webhooks](../guide/en/integrations/webhooks.md).

## Smaller pieces

| Piece               | File                                                                      | What it does                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL            | `lib/app-url.ts`                                                          | `appUrl()`/`appBaseUrl()` build absolute URLs from `AUTH_URL` (not from the request: links are copied elsewhere, and behind a proxy the request's host is not the public one). Deliberately without `server-only`, the mail templates use it. |
| Platform switches   | `lib/system-settings.ts`                                                  | `getSystemSettings()`: "may anyone create a workspace", "default workspace". A plain runtime flag with **no permission check**; writing it is gated in `features/system-settings`.                                                            |
| Last seen           | `lib/presence.ts`                                                         | A coarse "last seen" for the admin's account list, at most one write per hour per person.                                                                                                                                                     |
| Update check        | `lib/update-check.ts`                                                     | Asks GitHub for the newest release, shown to platform admins only. The only outgoing call the app makes on its own; `UPDATE_CHECK=false` turns it off.                                                                                        |
| Release notes       | `lib/releases`                                                            | Reads `releases/<version>.md` / `.de.md` for the in-app window.                                                                                                                                                                               |
| Membership          | `lib/project-membership.ts`                                               | Keeps `ProjectMember` rows consistent when people or projects come and go.                                                                                                                                                                    |
| Dashboard time axes | `lib/buckets.ts`                                                          | Generates the full day/week axis so charts show zeros instead of gaps. Pure, no DB.                                                                                                                                                           |
| Status helpers      | `lib/status-category.ts`, `lib/statuses.ts`, `lib/issue-status-events.ts` | Categories and the append-only status history.                                                                                                                                                                                                |
| Rich text           | `lib/richtext`                                                            | See [Frontend](frontend.md#rich-text).                                                                                                                                                                                                        |
| Identifiers         | `lib/utils/id.ts`                                                         | `uid(prefix)`; falls back to `getRandomValues` where `crypto.randomUUID` does not exist (plain HTTP on a LAN address).                                                                                                                        |
