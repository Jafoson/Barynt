# What a store contains, and how the instance reads it

A plugin store is a Git repository ([barynt-plugin-store](https://github.com/Jafoson/barynt-plugin-store) is the official one;
the format is defined there and checked by its CI). The instance keeps a **local clone** of each store that is on, and reads the
catalog from it, so the store page also works offline with the last state. This page is about the reading: BARY-104 (the format)
and the reader from BARY-105. How the clone gets there and is kept fresh (the transport) and how a plugin is installed from an
entry come in later steps.

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

## The catalog

One entry per store **and** plugin: the same id in two stores is two entries with their store on them, because an installed plugin is
updated only from the store it came from (BARY-96). An entry carries the manifest's words in the admin's language, the scope, whether it
has code, what it asks for, the versions (highest first, revoked ones marked), the version to install (the highest that is not
revoked, `null` if all are), whether it is compatible with this Barynt, and if it is installed: which version, whether from this store,
and the update (only from the store it came from, only to a higher version that is not revoked).

## Deliberately not here

- **Fetching and updating a clone** (BARY-111 transport, BARY-105 sync).
- **Installing** from an entry: download, hash check, unpacking, atomic placement (BARY-107).
- **Signed commits** (`maintainerKeys` is read and ignored).
- **A check against the store's published JSON Schemas.** The schemas are a copy; a script that compares them with the store's
  `schemas/*.json` can be added when the format moves.
