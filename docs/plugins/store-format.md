# What a store contains, and how the instance reads it

A plugin store is a Git repository ([barynt-plugin-store](https://github.com/Jafoson/barynt-plugin-store) is the official one;
the format is defined there and checked by its CI). The instance keeps a **local clone** of each store that is on, and reads the
catalog from it, so the store page also works offline with the last state. This page is about the reading (BARY-104, the format and the
reader), how the clone is [kept up to date](#keeping-the-clone-up-to-date) (BARY-105) and, in [ADR 0003](adr-0003-store-transport.md),
how it gets there (BARY-111). How a plugin is installed from an entry comes in a later step (BARY-107).

## The layout

```
store.json                        schemaVersion (1), id, name, optional maintainerKeys
plugins/<plugin-id>/
  barynt-plugin.json              a copy of the manifest inside the release archive
  source.json                     versions[]: version, download (https), sha512, released, changelog, revoked; optional repository
plugins/_example/                 directories that start with _ or . are reserved and ignored
```

- The **manifest copy** is there so the store page can show the description, the capabilities and the compatibility without
  downloading anything. The store's CI checks that it equals the manifest in the archive; the instance checks it again when it
  installs (a later step) and never uses it as what runs.
- `sha512` is the hash of the **release archive**, hex, pinned by the entry. Published versions never change. It is not the hash
  of the installed directory (`Plugin.integrity`), which the instance computes after unpacking.
- `revoked` is `true` or a reason. A revoked version is shown with a warning and is never the version to install.

## The reader

[`lib/plugins/store/`](../../lib/plugins/store):

| File | Does |
| --- | --- |
| `format.ts` | The zod schemas for `store.json` and `source.json`, a copy of the store's `scripts/schema.ts` so CI and the instance know one format. Downloads and repository addresses must be `https://` without credentials. |
| `reader.ts` | `readStoreDirectory(dir)`: reads a clone. Never throws. |
| `catalog.ts` | `buildCatalog(...)`: puts the entries of the stores that are on together for the store page. Pure. |
| `paths.ts` | `storeCloneDir(pluginsDir, key)`: `<plugins>/.stores/<name>`, where the name is one safe path segment made from the address and a hash. |
| `transport.ts` | `fetchStoreArchive(source)`: the address of the default branch's archive for GitHub, GitLab, Bitbucket and Gitea/Forgejo, the token as a header for that host only, and the download. |
| `fetch.ts` | `safeDownload(address, limits)`: https only, public addresses only (checked for every redirect, too), limits on size and time, credentials never sent on to another host. Never throws. |
| `address.ts` | `isPublicAddress(address)`: pure, IPv4 and IPv6, including an IPv4 address inside an IPv6 one. |
| `tar.ts` | `readTar(bytes, limits)`: reads a tar archive without writing anything and refuses what it does not understand. Pure. |
| `archive.ts` | `unpackStoreArchive(bytes, dir)`: writes only `store.json` and each plugin's `barynt-plugin.json` and `source.json`. |
| `sync.ts` | `syncStoreClone(...)`: fetch, unpack aside, read, move into place; the old clone stays on any failure. |
| `syncPolicy.ts` | `syncConfig(env)` and `syncDue(...)`: when opening the store page fetches a store on its own. Pure. |

**The clone is data, never code, and never trusted.** The reader only parses JSON; it runs nothing from the clone. What it repeats
from the store's CI, because a clone can be anything (a maintainer's mistake, an attacker in a store the admin trusted, a
half-written sync):

- symlinks are not followed, for the clone, for `store.json`, for an entry and for each of its files (`O_NOFOLLOW`, so also not one
  that appears while it is being read);
- every file is at most 256 KiB, read with a limit and never in full;
- a directory name has to be a plugin id, and the manifest's `id` has to equal it;
- the manifest has to be valid by the same rules as an installed plugin's (`validateManifest`), and `source.json` has to list the
  version the manifest is for;
- at most 2000 entries; the rest is not read, and the result says so.

A problem with one entry is that entry's problem (`problems: [{ id, issues }]`, one line per issue with its file and path); the
others are listed. A clone that is missing or is no store is `{ ok: false, error }` with the reason, so the page can say
"the store has not been fetched yet" instead of showing an empty list as if the store had nothing.

## Keeping the clone up to date

[`sync.ts`](../../lib/plugins/store/sync.ts) brings one store's clone up to date, and only replaces it with something that is a store:
download the archive ([ADR 0003](adr-0003-store-transport.md)), unpack it into a fresh directory `.stores/.tmp-*` with the allowlist, read it
with `readStoreDirectory`, and only then move it to `.stores/<name>`. The clone that was there is first moved aside and put back if the
new one cannot be moved in. **Whatever goes wrong, the old clone stays as it was**: the store page then shows the last state that worked
and says why it could not be updated, instead of an empty list. It never throws.

- A store whose archive is no store (no `store.json`, or one that does not fit the schema), is refused and the old clone stays.
  A store with entries that cannot be used is taken; those entries are counted and listed as problems, like before.
- `.stores` has to be a real directory: a symlink in its place is refused and nothing is written through it. A symlink where the clone
  should be is replaced, not followed.
- Two syncs of the same store at the same time download once and both get the result (the state hangs on `global`, because the page and
  the action are bundled apart). Leftovers of a sync that was cut off (`.tmp-*`, `*.old-*`) are removed when they are over an hour old.
- Between the two moves the clone is briefly not there; a page that reads at that moment says "not fetched yet". That is the price of not
  using anything but plain renames, and it lasts as long as one rename.
- [`features/plugins/storeSync.ts`](../../features/plugins/storeSync.ts) records how it went on the store's row (`syncedAt`,
  `syncAttemptedAt`, `syncError`, [Data model](data-model.md)) and opens the sealed token for the store it was sealed for.
  `syncPluginStores` (the *Update* button; `plugin.manage`) fetches one store or all that are on. Fetching is not audited: it decides
  nothing about what runs, and the store's address was entered (and audited) by the admin.

**Without anyone asking.** Opening the store page fetches a store that was never fetched (the page waits, at most 15 seconds, because there
is nothing to show without it) and, after the page is sent, one whose state is older than allowed. A store that was tried in the last ten
minutes is left alone, so one that cannot be reached is not asked on every visit. Two environment variables, neither has to be set:

| Variable | Default | Does |
| --- | --- | --- |
| `BARYNT_STORE_AUTO_SYNC` | on | `off`, `false`, `0` or `no`: opening the page never fetches. For an instance that must not reach out unless an admin presses the button |
| `BARYNT_STORE_MAX_AGE_HOURS` | 6 | How old a state may be before opening the page fetches again. A number above 0 and up to 720; anything else is the default |

A scheduled job (BARY-90) is a later addition; the rule above is `lib/plugins/store/syncPolicy.ts`, pure.

## The catalog

One entry per store **and** plugin: the same id in two stores is two entries with their store on them, because an installed plugin is
updated only from the store it came from (BARY-96). An entry carries the manifest's words in the admin's language, the scope, whether it
has code, what it asks for, the versions (highest first, revoked ones marked), the version to install (the highest that is not
revoked, `null` if all are), whether it is compatible with this Barynt, and if it is installed: which version, whether from this store,
and the update (only from the store it came from, only to a higher version that is not revoked).

## Deliberately not here

- **A scheduled sync** (BARY-90): today a store is fetched when someone presses *Update* and when the store page is opened and the state is old.
- **Installing** from an entry: download, hash check, unpacking, atomic placement (BARY-107).
- **Signed commits** (`maintainerKeys` is read and ignored).
- **A check against the store's published JSON Schemas.** The schemas are a copy; a script that compares them with the store's
  `schemas/*.json` can be added when the format moves.
