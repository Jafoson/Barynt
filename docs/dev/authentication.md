# Authentication

How a person (or a script) proves who they are. What they may then _do_ is a
separate question, answered in [Permissions](permissions.md).

## Three kinds of credentials

| Credential                            | For                                            | Looks like                                                      | Where it is checked                                                            |
| ------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Session** (Auth.js JWT in a cookie) | People in the browser                          | cookie `authjs.session-token` (`__Secure-` prefixed over HTTPS) | `proxy.ts`, `getSession()` / `currentUserId()`                                 |
| **API key**                           | Scripts, CI, integrations; also usable for MCP | `bry_…`                                                         | `resolveApiUser()` in [`lib/api-auth.ts`](../../lib/api-auth.ts)               |
| **OAuth access token**                | AI assistants connected through MCP            | `bryat_…`                                                       | `verifyOAuthAccessToken()` in `lib/oauth/verify.ts`, used by `lib/mcp/auth.ts` |

There are no passwords anywhere. The login page offers passkeys, any number of
OAuth/OIDC providers, and, if mail is configured, a magic link.

## Sign-in methods

Auth.js is configured in two files so that the middleware can stay light:

- [`auth.config.ts`](../../auth.config.ts): the **edge-safe** base config. No
  Prisma adapter, no Node-only modules. Used by `auth.edge.ts` for `proxy.ts`,
  which only needs to decode the JWT. Also resolves the OAuth providers from the
  environment and holds the `jwt`/`session` callbacks.
- [`auth.ts`](../../auth.ts): the full Node configuration with the Prisma
  adapter, the WebAuthn provider, the Nodemailer (magic link) provider and the
  `signIn` callback.

| Method       | Provider                                              | Enabled by                                                                                                                                                                                                                                                                         |
| ------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passkey      | Auth.js `WebAuthn` (`@simplewebauthn`)                | On by default. `AUTH_PASSKEY_LOGIN_ENABLED=false` turns passkeys off entirely, `AUTH_PASSKEY_REGISTRATION_ENABLED=false` only blocks _new accounts_ from registering one.                                                                                                          |
| OAuth / OIDC | Every provider Auth.js ships, plus a generic OIDC one | `AUTH_<ID>_ID` and `AUTH_<ID>_SECRET` (plus `AUTH_<ID>_ISSUER` where needed) switch a provider on by itself. `AUTH_OIDC_ISSUER`/`_CLIENT_ID`/`_CLIENT_SECRET`/`_NAME` is the generic one. The list is in [`lib/auth-providers/registry.ts`](../../lib/auth-providers/registry.ts). |
| Magic link   | Nodemailer                                            | Only when SMTP is configured (`isMailConfigured()`). The link and an 8-character code (alphabet without `O/0/I/1`) share one token, valid 15 minutes.                                                                                                                              |

`AUTH_REGISTRATION_ENABLED=false` makes the instance invite-only: a genuinely new
account can no longer be created by any of the three methods. Anyone with an open
invitation still gets in, because their account row already exists from the
moment they were invited. The very first account of a fresh installation is always
allowed, so closing registration before you have signed in cannot lock you out.

All provider variables are listed and explained in `example.env`; the operator's
view is in the user guide's [Single sign-on](../guide/en/administration/sso.md).

## What happens at sign-in

The `signIn` callback in `auth.ts` runs for **every** method, so one place guards
them all:

- A **deactivated** account is refused, and the refusal is written to the audit
  log (`reason: "deactivated"`).
- A **shadow account**: an invitation creates an account with a fixed address
  but no credentials. Auth.js would normally refuse to link an OAuth login to an
  existing address (`OAuthAccountNotLinked`). For an _untouched_ shadow account
  (never verified, no passkey, no provider) nothing can be hijacked, so the callback links it.
- **IdP switch.** With `AUTH_OIDC_ALLOW_EMAIL_LINKING=true`, an unknown OIDC
  login is linked to the existing account with the same email. Off by default, and
  only safe if the IdP verifies addresses.
- A genuinely **new account** gets its `handle` and colour in the adapter's
  `createUser`, then `provisionNewUser()` runs (`lib/user-provisioning.ts`): if the
  address's domain is claimed by a workspace, the person joins it immediately.
  The **very first account of an installation** becomes platform admin
  (`isFirstAccount`).
- `touchLastSeen()` records "last seen", coarsely, for the admin's list of accounts
  (`lib/presence.ts`, one write per hour at most).

A passkey registration needs _some_ email for the WebAuthn ceremony. The login
form sends a placeholder under `@no-email.invalid`, which the adapter discards;
the account ends up with no email.

## The session

Sessions are **JWTs**, not database rows. The token carries only display data:
user id, name, colour. **The role is deliberately not in the token.** A JWT lives
until the next sign-in, so a role in it would make a role change take effect late.
Permissions are resolved fresh from the database on every check.

`getSession()` (`lib/session.ts`) is a thin wrapper that returns `{ userId }`.
Server code never reads the JWT directly. After a person changes their name or
colour, the settings action calls Auth.js's `unstable_update`; the `jwt` callback
copies only those three fields, because anything else in that payload is input
from the browser.

## Public paths

`proxy.ts` lists the pages reachable without a session: `/login`, `/register`,
`/invite`, `/join`, `/share`. Each is public for a reason (the token in the path
_is_ the authorization, or the page decides between "signed in" and "sign in
first" itself). Everything under `/api` is outside the middleware and checks on
its own.

## Invitations, links and shares

Three token-based entry points, all in `lib/`:

| What              | File                  | Behaviour                                                                                                                                                                              |
| ----------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitation        | `lib/invitations.ts`  | One token creates one pre-made account (the shadow account) for an email address.                                                                                                      |
| Invite link       | `lib/invite-links.ts` | Generic, unlimited redemptions until revoked or expired; one per scope, a new one replaces the old. The person registers or joins with an existing session; the same code covers both. |
| Public issue link | `lib/issue-share.ts`  | `Issue.shareToken`, one per issue, switchable and regenerable, with a fixed validity. Every change is audited.                                                                         |

## API keys

Created in the account settings (`features/account/actions.ts`): 32 random bytes,
shown **once**, stored only as a SHA-256 digest (`ApiKey.tokenHash`, the lookup
key) plus a short plain prefix for display. A key resolves to `{ userId, keyId,
scopes }` if it exists, is not revoked, has not expired and its owner is not
deactivated. `lastUsedAt` is updated at most every five minutes, so a polling
integration does not turn into a write storm.

**Scopes** (`lib/api/scopes.ts`) are a ceiling: they decide which routes a key may
call, never which data the person may see. Every route still runs the normal
permission check for the key's owner. Adding a scope means adding it to
`API_SCOPES`; the settings grid renders them in that order.

The per-key rate limit is described in [Backend services](backend-services.md#redis).

## OAuth for MCP

Barynt is its own OAuth 2.1 authorization server for the MCP endpoint, so an AI
assistant can connect with just the server URL. The pieces:

| Piece                       | Where                                                                                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery                   | `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`. Rewritten in `next.config.ts` to real routes under `app/api/oauth/well-known/`, because the App Router does not register a route under a dot-prefixed folder. |
| Dynamic client registration | `POST /api/oauth/register` (RFC 7591). Public clients only, no secret.                                                                                                                                                                               |
| Consent screen              | `app/[locale]/(auth)/oauth/authorize`, protected by the normal session; the original query string survives the login round-trip (see `proxy.ts`).                                                                                                    |
| Code exchange and refresh   | `POST /api/oauth/token`, in `lib/oauth/exchange.ts`. PKCE with `S256` is mandatory.                                                                                                                                                                  |
| Token format                | `bryoc_` (code, 10 minutes), `bryat_` (access, 1 hour), `bryrt_` (refresh, 30 days), stored hashed.                                                                                                                                                  |

Refresh tokens **rotate**: each use retires the presented token and issues a new
pair. Presenting an already-retired refresh token is treated as theft and revokes
the whole grant. The granted scopes are the requested ones that exist; if none was
requested or recognised, the grant covers all scopes (the same ceiling an API key
has). Access tokens are only accepted at `/api/mcp`; the REST API accepts API
keys only.

Tests for the whole flow are in `tests/unit/oauth/`. They mock `@/lib/app-url`, which
is why that folder runs in its own process, see [Testing](testing.md).
