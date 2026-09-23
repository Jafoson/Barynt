# Plugin security

What can go wrong when a plugin runs, what stops it, and what cannot be stopped.

> **Status: early.** The integrity check and the rule for who may run code in-process are built.
> The approval, the sandbox and the service mode are planned in the tickets named. Nothing here
> has been reviewed by anyone outside the project.

## The one thing to know

**Tier B plugin code has the power of the app.** A server module runs in the app's
process, a client bundle runs in the app's page. That means:

- **On the server:** everything the process can do. It can read the environment
  (`AUTH_SECRET`, `DATABASE_URL`, mail and storage credentials), talk to the database
  **for every tenant**, read and write files, open network connections, and change
  what other plugins do.
- **In the browser:** the same origin as the app, so it can call the app's APIs as the
  signed-in user and read everything on the page.

There is **no technical boundary inside a process.** JavaScript has no safe in-process
sandbox (`node:vm` is not one, Bun offers no permission flags such as Node's, which was checked on
1.3.14 and not on the 1.4.2 the image runs, and a worker thread still shares the process's files
and environment). So for tier B, security is a question of
**which code may run**, not of what it may do once it runs.

That has one consequence that is easy to miss. A list of *capabilities* (`issues:read`,
`network:egress:api.example.com`) is a **statement the admin agrees to, not a fence**: a
plugin that wants more can import `node:fs` or call `fetch` directly instead of using the
context it was given. Capabilities are worth having (they show an admin what a plugin
says it does, and a store review can check the code against them), but for tier B they
cannot be enforced. BARY-95 says the SDK context "enforces" them; that holds only for
plugins that use the context.

## Who can get code in, and what stops them

| Threat | Control | Status |
| --- | --- | --- |
| **A plugin with code that is not from the official store, or not approved** | **It does not run in the app's process: `decideExecution()` blocks it, fail closed** | **built (the rule); the approval is planned (BARY-122)** |
| Someone uploads or drops in a plugin | Blocked unless the platform allows plugins from no store; the setting is off by default (BARY-110) | planned |
| A store's plugin was changed after review | The store entry pins a hash of the release archive; the installer verifies it before it extracts anything | store repository built; installer planned (BARY-60, BARY-105) |
| **Files on disk changed after install** | **The hash of the plugin directory is checked before every load; a plugin whose files differ, or that contains a symlink or another odd file, does not load** | **built** |
| A different plugin version than the one approved gets loaded | The approval is of one exact hash; a new version needs a new approval | planned (BARY-60, BARY-95) |
| A plugin update asks for more than the old one | A new version needs new consent, including every added capability | planned (BARY-95) |
| A plugin's client code loads scripts or frames from elsewhere | Content Security Policy for plugin client code (BARY-97) | planned |
| **A reviewed plugin is malicious, or so is one of its bundled dependencies** | **Only the review. Nothing technical stops it in tier B.** | cannot be stopped |

## The integrity check

[`lib/plugins/integrity.ts`](../../lib/plugins/integrity.ts). When a plugin is installed and
approved, the hash of its directory is computed and stored in `Plugin.integrity`. Before
**every** load, the loader computes it again and compares. A mismatch, a missing hash or
a malformed one means the plugin does not load and nothing of it is imported: **no hash, no
load.** It applies to every plugin, also one without server code, because a client bundle and a
manifest are files the host serves.

**The hash.** One line per file, `<sha512 hex>  <size>  <relative path>`, sorted by path,
and the SHA-512 of those lines as `sha512-<base64>`. Content, size, name and place of every
file count, hidden files included. Empty directories do not.

**What a plugin directory may contain.** Only regular files and directories. A **symlink,
device, socket or pipe anywhere inside is refused**, because it could make the directory say
one thing and load another. Also refused: a name with a line break (it could forge a line of the
list), more than 5000 files, more than 12 levels, a file over 32 MiB or more than 128 MiB in
total, so a hostile directory cannot make the host hash for minutes.

**What it does not do:**

- It does not make code safe, only unchanged. Approved malicious code stays malicious.
- It protects against *others* changing a plugin. Plugin code in the same process can also
  reach the database and rewrite the recorded hash, so a plugin cannot be stopped from
  approving itself.
- A file could be swapped between the check and the import by anything that can write to the
  plugin directory while the app runs. Plugin code in the same process can, because it has the
  app's file permissions. So the check covers tampering from **outside** the process (a
  compromised volume, a bad update path), not from a plugin. Keeping the directory writable only
  by the install process helps against the first and is part of BARY-117.
- A file that changes *while* it is being hashed is caught by comparing the bytes read with
  the size, but that race is not covered by a test.

## Decided: who may run code, and where

Decided in review on 23.09.2026 (BARY-120): **unreviewed plugins get no server code in the app's
process; a plugin with server logic runs as a service of its own; in-process code exists only for
plugins from the official store that the platform has approved explicitly, for the exact files.**

There are four **execution modes**. They are named so they do not get mixed up with the trust tiers
A, B and C in the [overview](README.md#trust-tiers):

| Mode | What runs where | Who may use it | Status |
| --- | --- | --- | --- |
| `declarative` | Nothing of the plugin runs; the host renders what the manifest declares | any plugin from a store | built |
| `sandbox` | The plugin's UI in an iframe without same-origin, on its own origin, talking through a message bridge; no server code | the default for an unreviewed plugin that shows UI | planned (BARY-123) |
| `service` | The plugin's server logic as a service of its own, with no secrets and no database access, calling Barynt only through its REST and MCP APIs with a token of narrow scopes | a plugin that needs server logic | planned (BARY-124) |
| `in-process` | A server module in the app's process, a client bundle in the page, with the full power of the app | **only** a plugin from the **official store** that the platform has **approved**, for the **exact hash** | the rule is built (below), the approval is planned (BARY-122) |

**The rule today.** `sandbox` and `service` do not exist yet, so a plugin with `server` or `client`
code counts as `in-process`, and is therefore **blocked** unless it is from the official store and
approved. A plugin without code runs. This is what
[`lib/plugins/policy.ts`](../../lib/plugins/policy.ts) decides, for every installed plugin, before the
loader sees it:

1. Input that is missing or malformed: blocked (`invalid`). Not knowing whether a plugin has code is
   not the same as it having none.
2. No `server` and no `client` (a value that is there counts, even an empty one): `declarative`, it runs.
3. Not from the official store, that is `source` is not `STORE`, or the store is not the official one:
   blocked (`not-official-store`). The address is compared in one normalised form; anything that is
   not a plain `https://host/path` (another scheme, credentials, a port, a query, the `git@host:`
   form, a look-alike host or repository, a sub-path) is not the official store.
4. No valid hash on record, or no approval: blocked (`not-approved`).
5. The approval is for another hash than the installed one, as after an update:
   blocked (`approval-outdated`). A new version needs a new approval.
6. Otherwise `in-process`.

The official store's address is a constant in code, not a setting, because what may run with the full
power of the app should not depend on an environment variable.

**Open:** a plugin from a custom or private store with code is not in-process by default. Whether a
company may run its own plugins in-process, and how (approving each one, or trusting the store), is
decided with the approval mechanism (BARY-122). The proposal is: one at a time, never a store as a whole.
