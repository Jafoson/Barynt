# Plugin security

What can go wrong when a plugin runs, what stops it, and what cannot be stopped.

> **Status: early.** The integrity check, the rule for who may run code in-process and the approval
> that lets a plugin's code run there are built. The sandbox and the service mode are planned in the
> tickets named. Nothing here has been reviewed by anyone outside the project.

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
| **A plugin with code that is not from an active store, or not approved** | **It does not run in the app's process: `decideExecution()` blocks it, fail closed** | **built: the rule, and the approval ([below](#the-approval))** |
| Someone uploads or drops in a plugin, or enters a repository address by hand | Not loaded at all unless the platform allows plugins from no store. The setting is off by default, only `plugin.manage` can switch it on, and only after a warning that the server checks itself. Even then one with code stays blocked ([below](#plugins-from-no-store-unsigned)) | the setting and the rule are built; the installer that enters an address is planned (BARY-60, BARY-111) |
| A store's plugin was changed after review | The store entry pins a hash of the release archive; the installer verifies it before it extracts anything | store repository built; installer planned (BARY-60, BARY-105) |
| **Files on disk changed after install** | **The hash of the plugin directory is checked before every load; a plugin whose files differ, or that contains a symlink or another odd file, does not load** | **built** |
| A different plugin version than the one approved gets loaded | The approval is of one exact hash; a new version needs a new approval, and a plugin whose approval does not fit is not imported | approval built; the update itself is planned (BARY-60, BARY-95) |
| A plugin update asks for more than the old one | A new version needs new consent, including every added capability | planned (BARY-95) |
| A plugin's client code loads scripts or frames from elsewhere | Content Security Policy for plugin client code (BARY-97) | planned |
| A private store's access token leaks: from a database dump or backup, a log, an error, a page or an audit entry | Sealed with AES-256-GCM and bound to the store's address; never selected into a page, an action result, an error or an audit entry; only the store client may open it, and only to send it to that address ([Plugin stores](stores.md#private-repositories)) | storing built; the client that uses it is planned (BARY-105) |
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
plugins from a store the platform has switched on, that the platform has also approved explicitly,
for the exact files.**

There are four **execution modes**. They are named so they do not get mixed up with the trust tiers
A, B and C in the [overview](README.md#trust-tiers):

| Mode | What runs where | Who may use it | Status |
| --- | --- | --- | --- |
| `declarative` | Nothing of the plugin runs; the host renders what the manifest declares | any plugin from a store | built |
| `sandbox` | The plugin's UI in an iframe without same-origin, on its own origin, talking through a message bridge; no server code | the default for an unreviewed plugin that shows UI | planned (BARY-123) |
| `service` | The plugin's server logic as a service of its own, with no secrets and no database access, calling Barynt only through its REST and MCP APIs with a token of narrow scopes | a plugin that needs server logic | planned (BARY-124) |
| `in-process` | A server module in the app's process, a client bundle in the page, with the full power of the app | **only** a plugin from a store that is **switched on**, that the platform has **approved**, for the **exact hash** | the rule and the approval are built (below) |

**The rule today.** A plugin with code runs in the app's process only with an approval ([below](#the-approval)); without
one it is not even imported. `sandbox` and `service` do not exist yet, so a plugin with `server` or `client`
code counts as `in-process`, and is therefore **blocked** unless it is from an active store and
approved. A plugin without code runs, if it comes from a store or the platform allows plugins from no
store. This is what [`lib/plugins/policy.ts`](../../lib/plugins/policy.ts) decides, for every installed
plugin, before the loader sees it (`decideExecution(input, activeStores, { allowUnsigned })`):

1. Input that is missing or malformed, or a `source` that is not text: blocked (`invalid`). Not
   knowing whether a plugin has code is not the same as it having none.
2. Not from a store, that is `source` is not `STORE`: blocked (`unsigned-not-allowed`) unless
   `allowUnsigned` is exactly `true`. With it, a plugin without code is `declarative` and runs, and one
   with code is blocked (`unsigned-code`). See [Plugins from no store](#plugins-from-no-store-unsigned).
3. No `server` and no `client` (a value that is there counts, even an empty one): `declarative`, it runs.
4. Its store is not in the list of active stores it is given: blocked (`store-not-active`). Addresses are compared in one normalised
   form; anything that is not a plain `https://host/path` (another scheme, credentials, a port, a
   query, the `git@host:` form, a look-alike host or repository, a sub-path) matches no store, and an
   entry in the list that is no address matches nothing. A missing, non-list or empty list means no
   store is on, so no code.
5. No valid hash on record, or no approval: blocked (`not-approved`).
6. The approval is for another hash than the installed one, as after an update:
   blocked (`approval-outdated`). A new version needs a new approval.
7. Otherwise `in-process`.

### Plugins from no store (unsigned)

A plugin that comes from **no store** (an upload, a directory, later a repository address entered by hand) is
**unsigned**: nothing pins its files and nobody reviewed it. A store entry with its hash is what makes a plugin
"verified" here, so a plugin without one is not.

- **Off by default.** `SystemSettings.allowUnsignedPlugins` is `false`. A plugin from no store is then not loaded
  at all, code or not, and shows as blocked because it is unsigned. A missing settings row, or a database that cannot
  be read, means off; only a row that says `true` allows it ([`lib/plugins/unsigned.ts`](../../lib/plugins/unsigned.ts)).
- **Only `plugin.manage` switches it on, after a warning.** The switch is on the Plugin stores page. Switching it on
  always opens a dialog that says these plugins are untested and used at the admin's own risk, and asks for a tick.
  The **server** asks for the same tick (`setAllowUnsignedPlugins(true, true)`), so calling the action directly does not
  skip it. Switching it off asks nothing. Both are audited (`plugin.unsigned.allowed`, `plugin.unsigned.disallowed`).
- **It asks again for each plugin.** Allowing unsigned plugins once is not consent for every one: installing or updating
  one has to show the same warning and refuse without the tick, every time. The actions that install from the plugin
  directory do this now, and the **server** checks the tick (`installPlugin`, `updatePlugin`, [Lifecycle](lifecycle.md));
  installing from an address entered by hand (BARY-111) is built to the same requirement.
- **What it allows.** A plugin without code runs. **A plugin with code stays blocked** (`unsigned-code`), with the setting
  on as well: unreviewed code does not get to run in the app's process, which has the power of the whole app (decided
  in BARY-120). It will run isolated, in a sandbox or as a service of its own, when those exist (BARY-123, BARY-124).
  This is deliberately not "on your own risk, in the process": that would give code nobody looked at the keys to
  every tenant, and a warning does not change what that code can do.
- **Switching it off** does not delete anything. The plugins stay installed and are not loaded until it is switched on
  again.
- **What it does not protect against.** An admin who ticks the box and installs a plugin has decided to run
  something nobody checked. The warning says so; it cannot make the plugin safe.

### The approval

Installing a plugin and letting its code run are two steps. A plugin with `server` or `client` runs in the process only when the
platform has approved it, for **one plugin and its exact files, and never for a store as a whole**
([`features/plugins/actions.ts`](../../features/plugins/actions.ts), `approvePluginCode`). The approval is `Plugin.codeApprovalHash`,
the directory hash the plugin was installed with (`Plugin.integrity`), and `Plugin.codeApprovedAt`; who approved it is in the audit log.

What the server checks before it writes anything:

1. **`plugin.manage`**, and a real **yes** (`acknowledged === true`) to: after this the plugin's code runs with the full power of the app,
   can read the data of every workspace and act as any user, and nothing stops it. The server asks for it itself, so the dialog cannot
   be skipped by calling the action directly.
2. **The hash the admin was shown.** If the plugin's recorded hash is another one by now, nothing is approved, and the write itself is tied
   to that hash, so an update between the check and the write cannot get the old approval.
3. **What is on disk is what the hash says**, checked before the manifest is read.
4. **Only what the policy would run anyway.** Not a plugin without code, not one from a store that is not switched on, and not one from no
   store (its code does not run in the process, whatever is approved). An approval that could never take effect would only look like a promise.

An update brings another hash, so the old approval stays stored and **no longer fits**: the policy says `approval-outdated`, the plugin
is not imported, and the new version has to be approved on its own. Withdrawing (`revokePluginCodeApproval`) clears it. Both change what may
run, so both tell the registry, and from the next request the plugin is or is not handed out
([Loading](loading.md#when-it-is-built-again)); what it already started keeps running until a restart.

Approving is audited as `plugin.code.approved` and marked as an intervention, with the hash; withdrawing as `plugin.code.revoked`.

**Still to come.** The dialog that shows the hash, the origin and what a plugin promises, and says what the approval means: it needs the
admin page for plugins (BARY-63). Until then the actions can only be called from code. An install does not approve
anything ([Lifecycle](lifecycle.md#install)); an update withdraws the approval of the old version.

**What it does not do.** It does not make code safe. Approved code that is malicious is malicious, and it has the power of the app. The
approval is a decision about *whose* code and *which* files, made by someone who was told what it means.

### Stores

The **official store** is the Git repository the project owner manages (the store repository). It is
**on by default**. The platform admin can change that: connect **another store** (another Git repository,
also a private one), or switch the official one off and use **only their own**. Which stores are on is a setting that only
the platform can change (`plugin.manage`), with an audit entry, on an admin page ([Plugin stores](stores.md)). Until
the registry reads the list, it passes the default, the official store alone (`DEFAULT_ACTIVE_STORES`).

Connecting a store means trusting what its authors publish, and the dialog has to say so. But it runs
**nothing by itself**: every plugin with code from any store, the official one included, still needs its own
approval for its exact hash ([The approval](#the-approval)). A store that is switched off keeps nothing running: its plugins with
code stop being allowed in-process **from the next request**, because the registry is built again
([Loading](loading.md#when-it-is-built-again)). What a plugin already started, such as a timer or a listener in its
`boot`, keeps running until the process restarts: JavaScript cannot unload it, so a restart is what ends the code.

The policy itself has no store of its own and no default: it is given the list, so a missing or empty list
blocks everything with code. The official store's address is a constant only as the default entry of that list.
