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
| [`features/plugin-stores/actions.ts`](../../features/plugin-stores/actions.ts) | `addPluginStore`, `setPluginStoreEnabled`, `removePluginStore`: permission, validation, audit |
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
- **Remove** is there for every store but the main one, and asks first.
- **No store on** shows a notice above the list: no plugin with code can run.

The page does not decide anything itself. Every change goes through the three actions above, so what a button shows
and what the server allows cannot drift apart.

### What an address may look like

Only a plain `https://host/path`. Another scheme, credentials in the address, a port, a query, a fragment,
the `git@host:` form and an address that is only a host are refused. Two spellings of one store
(`.../plugins`, `.../plugins.git`, upper case, a trailing slash) are the same store. This is deliberately
strict: an address that cannot be compared exactly cannot be trusted exactly. It also means a self-hosted
Git server on another port, or a store reached over SSH, cannot be connected yet; that is decided with the
store client (BARY-105, BARY-111).

Limits: a name of 1 to 80 characters, an address of at most 300, at most 20 stores.

## Not built yet

- **Private repositories**: credentials (a token or an SSH key), stored encrypted and never sent to the
  client or logged. That needs the secrets storage (BARY-85) and the Git transport (BARY-111).
- **Branch, last sync, last error, head commit** of a store, which come with the store client (BARY-105).
- **The same plugin id in two stores** is shown, not resolved silently. That belongs to the plugin
  browser, which needs the store client first (BARY-105).
