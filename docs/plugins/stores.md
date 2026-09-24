# Plugin stores

Which stores plugins can come from, and which are switched on. The stores are a **list the
platform admin controls**; what it means for running code is in [Security](security.md#stores).

## The model

There is a **main store**: the store repository the project owner manages
([barynt-plugin-store](https://github.com/Jafoson/barynt-plugin-store)). It is **on by default**.
The platform admin can change that: connect **another store** (another Git repository), or switch
the main store off and use **only their own**.

- **Connecting a store means trusting what its authors publish.** The dialog says so and asks for a
  yes; the server refuses without it, so the warning cannot be skipped by calling the action directly.
  Switching a store on again needs the same yes (the main store excepted).
- **It runs nothing by itself.** Every plugin with code, from any store including the main one, still
  needs its own approval for its exact hash (BARY-122).
- **Only `plugin.manage` may change the list**, and every change is audited (`plugin.store.added`,
  `.enabled`, `.disabled`, `.removed`). Which stores are on decides which code the platform can be asked
  to approve, so it is not a workspace setting.
- **The main store cannot be removed**, only switched off, so it is always there to switch back on.
- **Removing or switching off a store keeps its plugins installed, but their code is no longer allowed
  to run**: the policy is given only the stores that are on, and blocks code from any other.

## In the code

| | |
| --- | --- |
| `PluginStore` (table) | `url` as entered, `key` (the address normalised, unique: the same store is there once, with or without `.git`), `name`, `official`, `enabled`. See [Data model](data-model.md) |
| `prisma/bootstrap.ts` | Puts the main store in on every deploy. It never touches `enabled`: a store an admin switched off stays off |
| [`features/plugin-stores/actions.ts`](../../features/plugin-stores/actions.ts) | `addPluginStore`, `setPluginStoreEnabled`, `removePluginStore`, `setPluginStoreCredential`, `clearPluginStoreCredential`: permission, validation, audit |
| [`features/plugin-stores/unsignedActions.ts`](../../features/plugin-stores/unsignedActions.ts) | `setAllowUnsignedPlugins`: allow or forbid plugins from no store, with the warning the server checks |
| [`lib/plugins/unsigned.ts`](../../lib/plugins/unsigned.ts) | `getAllowUnsignedPlugins()`: the setting the policy is given. Fails closed |
| [`features/plugin-stores/credential.ts`](../../features/plugin-stores/credential.ts) | What may be entered as a token and a user name |
| [`lib/plugins/storeCredentials.ts`](../../lib/plugins/storeCredentials.ts) | `sealStoreToken` / `openStoreToken`: a token sealed for one store's address |
| [`lib/secrets.ts`](../../lib/secrets.ts) | `sealSecret` / `openSecret`: AES-256-GCM with a key from the environment, bound to a context |
| [`features/plugin-stores/components/`](../../features/plugin-stores/components) | The page's list and its dialogs (`PluginStores`, `NewPluginStoreModal`, `SwitchOnStoreModal`, `TrustNotice`) |
| `app/[locale]/(default)/admin/plugin-stores/page.tsx` | The page, `/admin/plugin-stores`, in the platform admin's navigation. Reading the list needs `plugin.manage` as well |
| [`lib/plugins/stores.ts`](../../lib/plugins/stores.ts) | `getActiveStoreUrls()`: the list the policy is given. **Fails closed:** if the stores cannot be read, none is on, and it never falls back to the main store |
| [`lib/plugins/storeUrl.ts`](../../lib/plugins/storeUrl.ts) | The main store's address and how addresses are compared |

### The page

**Admin, Plugin stores.** One row per store: name, address, a badge on the main store and a switch.

- **Switching a store off** asks first and says what it means: its plugins stay installed, their code does not run.
- **Switching a store on** is direct for the main store. For any other it opens the same trust notice as connecting
  and needs the tick; the server checks it again.
- **Connect store** takes a name and an address and shows the trust notice. The button stays off until both are filled
  in and the box is ticked. On a phone the dialog is a sheet.
- **Access to a private repository**: a closed section "Private repository" in the connect dialog, and a key
  button on every row to set, replace or remove it later. The stored token is never shown: the field says one
  is stored, and entering a new one replaces it. A lock and "Access set" mark such a store in the list.
- **Remove** is there for every store but the main one, and asks first.
- **Unsigned plugins**: below the list, one switch, "Allow unsigned plugins", for plugins that come from no store.
  Switching it on always opens a warning (untested, at your own risk) with a tick that must be set; the server checks
  it as well. Switching it off asks first. What it allows, and what it does not, is in
  [Security](security.md#plugins-from-no-store-unsigned).
- **No store on** shows a notice above the list: no plugin with code can run.

The page does not decide anything itself. Every change goes through the three actions above, so what a button shows
and what the server allows cannot drift apart.

### Private repositories

A private store needs an **access token** (HTTPS), and for hosts that want one a **user name** (Bitbucket, Azure
DevOps). It is entered with the store or later, and it is separate from the address, which still may not contain
credentials.

- **Stored sealed, never in the clear.** `PluginStore.credential` holds the token sealed with AES-256-GCM
  ([`lib/secrets.ts`](../../lib/secrets.ts)), a random nonce per value. The user name is not a secret and is
  stored as is.
- **Bound to the store's address.** The context that is sealed with it is `pluginStore:<key>`, the address in its
  normalised form. A sealed value copied into another store's row does not open there, so whoever can write to the
  database cannot send one host's token to another by swapping two values. There is no way to change a store's
  address today; when there is, it has to seal the token again.
- **It never leaves the server.** The list query reads the sealed value only to tell whether there is one and hands
  the page `hasCredential` and the user name, nothing else, and a test pins the exact fields. No action result,
  error text, audit entry or log line carries it. The audit log records that access was set
  (`plugin.store.credentialSet`) or removed (`plugin.store.credentialCleared`), never the value.
- **Only `plugin.manage`** may set, replace or remove it, like everything else on this page.
- **What may be entered.** A token of 1 to 1024 visible ASCII characters, no space, line break or other control
  character, and a user name of at most 100 with no colon. That is strict on purpose: both end up in an HTTP header
  or a command line in the store client, and anything that could break out of one is refused here rather than
  escaped there.
- **The key** is `SECRETS_KEY` if it is set, else `AUTH_SECRET` (the Helm chart generates it once and keeps it across
  upgrades), at least 32 characters, run through HKDF. If there is no usable key, nothing is stored and the form
  says so; a token is never kept in a form that is not sealed. A `SECRETS_KEY` that is set but too short does not fall
  back to `AUTH_SECRET`.
- **Changing the key makes every stored token unreadable.** `openStoreToken` then gives `null`, the client goes on
  without a token, a private repository fails to clone, and the admin enters the token again. It never falls back to
  anything weaker.

**What this does not protect against.** A database dump or backup on its own is useless without the key. Whoever has
the key too can read the tokens, and so can code that runs in the app's process, which can read the environment: that
is the same limit as for everything an in-process plugin can reach ([Security](security.md#the-one-thing-to-know)). Use
a token that can do the least: read-only, limited to the store's repository (a deploy token or a fine-grained token),
so that a leaked one costs as little as possible.

**What the store client has to do** (BARY-105, BARY-111), because nothing uses the token yet:

- read it only with `openStoreToken(store.key, credential)`, and treat `null` as "no token";
- send it only to the store's own address, and **not** follow a redirect to another host with it;
- never log it, never put it on a command line (visible to every process on the machine) or in a URL, and never
  leave it in a `.git/config`; hand it to Git through an environment variable or a credential helper;
- keep it out of every error it reports.

### What an address may look like

Only a plain `https://host/path`. Another scheme, credentials in the address, a port, a query, a fragment,
the `git@host:` form and an address that is only a host are refused. Two spellings of one store
(`.../plugins`, `.../plugins.git`, upper case, a trailing slash) are the same store. This is deliberately
strict: an address that cannot be compared exactly cannot be trusted exactly. It also means a self-hosted
Git server on another port, or a store reached over SSH, cannot be connected yet; that is decided with the
store client (BARY-105, BARY-111).

Limits: a name of 1 to 80 characters, an address of at most 300, at most 20 stores.

## Not built yet

- **Installing from a repository address entered by hand**: the setting exists, but there is no address field and no
  installer yet (BARY-60, BARY-111, BARY-105). When there is, it needs the setting on **and** the same warning with a tick
  every time, and it installs a plugin without a store entry, so it is unsigned by definition.
- **Using the token**: it is stored (above), but nothing reads it until the store client and the Git transport
  exist (BARY-105, BARY-111). **SSH keys** are not supported; the address has to be `https://`.
- **The general secrets storage for plugins** (BARY-85). `lib/secrets.ts` is the small part of it that this needed,
  and is meant to be what that ticket builds on.
- **Branch, last sync, last error, head commit** of a store, which come with the store client (BARY-105).
- **The same plugin id in two stores** is shown, not resolved silently. That belongs to the plugin
  browser, which needs the store client first (BARY-105).
