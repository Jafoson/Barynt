# Data model

What the database knows about plugins: two tables in `prisma/schema.prisma`. The
plugin's **code** is not in the database; it lies in the plugin directory,
`<id>/<version>/` ([ADR 0001](adr-0001-runtime-loading.md)).

The platform installs (`plugin.manage`), a workspace enables (`plugin.enable`, see
[RBAC](../rbac.md#plugins-two-permissions-not-one)). That is why there are two
tables, one row per installation and one per plugin and workspace.

## `Plugin`: one row per installed plugin

| Column | Meaning |
| --- | --- |
| `id` | the manifest's `id`, also the directory name. It is the primary key: two plugins with one id cannot exist, and paths, permissions and routes derive from it |
| `version` | the installed version. Only one version is installed at a time; an update replaces it |
| `status` | `ENABLED` or `DISABLED`, the platform's switch for the whole plugin. `DISABLED` stops it loading without uninstalling it; the workspaces' settings stay |
| `source` | `STORE`, `UPLOAD` or `DIRECTORY`. `STORE` means it came from a plugin store and its hash is pinned in the store entry; the other two have no store entry and load only if the platform allows unsigned plugins (BARY-110) |
| `scope` | `WORKSPACE` or `PLATFORM`, taken from the manifest's `scope` at install and at every update. `WORKSPACE`: switched on per workspace (`PluginWorkspace`). `PLATFORM`: applies to the whole instance as soon as it is installed and `ENABLED`, with no switch per workspace. Stored so that "which plugins apply in this workspace" is one query and not a walk over the manifests on disk |
| `config` | the platform's settings for a `PLATFORM` plugin, `{}` until something is set. Unused for `WORKSPACE` plugins, whose settings are per workspace in `PluginWorkspace.config` |
| `origin` | for `STORE` the address of the store (the official one or a custom one), otherwise empty |
| `integrity` | the hash of the plugin **directory** as `sha512-<base64>`, computed at install by `hashPluginDirectory()` and approved by the admin. It is checked before every load, and a plugin whose files differ does not load ([Security](security.md#the-integrity-check)). The archive hash pinned in a store entry is verified by the installer before it extracts; the directory hash is what is stored |
| `installedAt`, `updatedAt` | `updatedAt` changes on every update, every switch of `status` and every change of `config` |

Whether a plugin **loads** is not stored. That is decided at start by
[`lib/plugins/resolve.ts`](../../lib/plugins/resolve.ts) (matching Barynt version,
dependencies), so a host upgrade has nothing to bring up to date.

## `PluginWorkspace`: a workspace plugin in one workspace

Primary key `(pluginId, workspaceId)`. Only for plugins with `scope = WORKSPACE`: a platform
plugin applies everywhere and has no rows here. The database does not enforce that (a
constraint would need a trigger); the registry never creates such a row.

| Column | Meaning |
| --- | --- |
| `enabled` | on in this workspace. The row appears at the first switch-on and **stays when it is switched off**, so the settings are not lost |
| `config` | the plugin's settings in this workspace, `{}` until something is set. The plugin defines the shape (BARY-66) |
| `createdAt`, `updatedAt` | |

There is an index on `workspaceId` for the most common question, which plugins are on
in this workspace (every page that renders slots asks it).

## `PluginStore`: a plugin store

A store that is connected, on or off ([Plugin stores](stores.md)).

| Column | Meaning |
| --- | --- |
| `url` | the address as entered, a plain `https://host/path`, which the store is cloned from |
| `key` | the address normalised (lower case, without `.git` and a trailing slash). Unique, so the same store is there once however it is spelled |
| `name` | what the store is called in lists |
| `official` | the project's main store. It can be switched off but not removed |
| `enabled` | on: plugins from it may be approved and run. Off: it is not in the list the policy is given |
| `credential` | the access token for a private repository, **sealed** (`lib/secrets.ts`) and bound to `key`. Null: the repository is public. Never in the clear, never in a query result for a page, never logged ([Plugin stores](stores.md#private-repositories)) |
| `credentialUser` | the user name that goes with the token, if the host wants one. Not a secret |

The main store is put in by `prisma/bootstrap.ts` on every deploy. Branch and sync state are not here yet.

## What happens when something is deleted

| Deleted | Effect |
| --- | --- |
| a workspace | its `PluginWorkspace` rows go, the plugin stays installed |
| a plugin (uninstall) | all its `PluginWorkspace` rows go, so its settings go too |

The choice to keep a plugin's **data** on uninstall (BARY-54) is about the generic
storage (BARY-85), which is a separate table with no foreign key to `Plugin`.

## Deliberately not here

- **Tables of a plugin's own.** Plugin data goes through the generic storage (BARY-85).
- **An opt-out per project.** It arrives with the slot framework (BARY-65), the first
  thing that needs it.
- **Who installed it.** The audit log records that with the lifecycle actions (BARY-60).

## Working with the schema

The migration is `prisma/migrations/*_plugins`. It creates two enums and two tables and
touches nothing else. The image that runs migrations (`docker/migrate`, the `migrate`
stage of the `Dockerfile`) copies the whole `prisma/` directory, so it needs nothing new.
The seed does not need a change either: it wipes workspaces, and their `PluginWorkspace`
rows go with them through the foreign key; installed plugins are platform configuration,
like the system settings, and the seed leaves them alone.

`prisma migrate dev` also proposes two `ALTER COLUMN "searchVector" DROP DEFAULT`
statements for `Comment` and `Issue`. Those columns are generated by Postgres, Prisma's
diff engine does not understand that, and Postgres rejects the statement. They are
removed from the migration by hand, as in an earlier one.
