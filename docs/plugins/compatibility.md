# Compatibility and dependencies

Which installed plugins can load, and in what order. A plugin that cannot load is
left out and comes back **with its reasons**, so the admin UI can say why instead
of the plugin silently missing.

The logic is [`lib/plugins/resolve.ts`](../../lib/plugins/resolve.ts): pure, no
database, no `server-only`. It only looks at four manifest fields: `id`, `version`,
`barynt` and `dependencies`. The registry (BARY-54) calls it; this step does not
touch the database or the UI.

## When a plugin cannot load

| Code | Reason | Values |
| --- | --- | --- |
| `host-incompatible` | Barynt is not a version the plugin's `barynt` range accepts | `range`, `host` |
| `dependency-missing` | a plugin in `dependencies` is not installed | `dependency`, `range` |
| `dependency-version` | it is installed, in a version outside the range | `dependency`, `range`, `installed` |
| `dependency-scope` | a platform plugin needs a workspace plugin | `dependency` |
| `dependency-unavailable` | it is installed in a fitting version but cannot load itself | `dependency` |
| `dependency-cycle` | the plugin depends on itself through other plugins | `members` (all of them, sorted) |

A plugin can have several reasons at once and gets all of them. The reasons are
**codes with their values**: the admin UI builds the text in the user's language.
`describeProblem()` returns the English text for logs.

`dependency-scope` follows from the plugin's `scope` ([manifest](manifest.md#scope)). A
platform plugin applies to the whole instance, a workspace plugin only where a
workspace switched it on, so a platform plugin cannot lean on one: it would run in
workspaces where its dependency is off. The other way round is fine, a workspace plugin
may depend on either kind. A plugin that leaves `scope` out counts as a workspace
plugin. If the dependency also has the wrong version, both reasons are reported, and
the platform plugin does not additionally blame the dependency for not loading.

`dependency-unavailable` is passed on, however deep: if `c` needs `b` needs `a`, and
`a` does not fit the host, then `b` and `c` are both left out. The members of a
cycle do not blame each other for it; they only report the cycle.

## The host version

`BARYNT_VERSION` in [`lib/version.ts`](../../lib/version.ts) is read from
`package.json`, the one place a release changes it. `resolvePlugins()` takes it as
an argument, so tests and tooling can ask about any version.

A pre-release of the host counts as its release: `1.5.0-rc.1` is checked as `1.5.0`.
Compared as written, `2.0.0-rc.1` would satisfy `<2.0.0` and load plugins written
for 1.x into a 2.0 build, and `1.5.0-rc.1` would not satisfy `^1.5.0`.

A **plugin's** pre-release version does not satisfy a plain range: `1.1.0-beta.1`
does not satisfy `^1.0.0`. That is SemVer's own rule, so a beta of a dependency is
never picked up by accident.

## Load order

`order` lists the plugins that can load, each after the plugins it depends on.
Plugins with no order between them are sorted by id, so the result is the same
whatever order the plugins were read in.

## When to ask

| Moment | Call |
| --- | --- |
| Start, and after a host upgrade | `resolvePlugins(installed, BARYNT_VERSION)`. Load `order`, show `problems` |
| Install, or update to a newer version | `previewInstall(installed, candidate, BARYNT_VERSION)`: `problems` says whether the candidate could load, `breaks` lists installed plugins that would stop loading (an update can leave a dependent's range behind) |
| Uninstall | `previewUninstall(installed, id, BARYNT_VERSION)`: the installed plugins that would stop loading, however deep |

Pass the plugins the host would load. Resolution is over the **installed** set, not
per workspace: a plugin loads once per process, a workspace only enables it
(BARY-54).

`resolvePlugins()` throws only when the host version is not SemVer, which is a build
defect. It never throws for a plugin.

## Barynt is in alpha

Decided: Barynt is versioned `0.x` while it is in alpha, and the first stable release
becomes `1.0`. Until then plugins name `0.x` ranges. In SemVer `^0.1.0` means only
`>=0.1.0 <0.2.0`, so during the alpha every minor version may break plugins and a
plugin re-declares its range per minor. That is the intended message: nothing is
promised yet.

The examples in these docs use `0.x` ranges for that reason (`>=0.1.0 <0.2.0`, `^0.1.0`).
A plugin written for a stable release will say `>=1.0.0 <2.0.0` or `^1.2.0` instead; on
an alpha host it is left out as `host-incompatible`.

## React and the SDK follow the `barynt` range

Decided: a plugin declares **one** compatibility range, `barynt`. The React major its
UI runs on and the SDK contract ([SDK](sdk.md)) have no range of their own. A plugin
built for another React major does not load ([ADR 0002](adr-0002-client-bundles.md)),
and a plugin built for an incompatible SDK does not work either; both are covered by
`barynt` on one condition: **a React major or a breaking SDK change only ships with a
Barynt major.**

During the alpha that condition is loose, since any minor may break. It binds from 1.0
on. If a React major ever has to change inside a stable Barynt major, the manifest gets
optional fields for it then; nothing has to be prepared now.
