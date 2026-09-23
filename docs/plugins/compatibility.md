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
| `dependency-unavailable` | it is installed in a fitting version but cannot load itself | `dependency` |
| `dependency-cycle` | the plugin depends on itself through other plugins | `members` (all of them, sorted) |

A plugin can have several reasons at once and gets all of them. The reasons are
**codes with their values**: the admin UI builds the text in the user's language.
`describeProblem()` returns the English text for logs.

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

## Not decided yet

- **Barynt has no release version yet.** `package.json` says `0.1.0`, and the
  examples in these docs claim `>=1.0.0 <2.0.0`. On 0.1.0 such a plugin is left out
  as `host-incompatible`. Until Barynt has a 1.0, plugins have to name 0.x ranges,
  and in SemVer `^0.1.0` means only `>=0.1.0 <0.2.0`.
- **React and the SDK contract have no range of their own.** A plugin built for
  another React major does not load ([ADR 0002](adr-0002-client-bundles.md)), and the
  SDK contract has its own version ([SDK](sdk.md)). Both are covered by the `barynt`
  range on the condition that a React major or a breaking SDK change only ships with
  a Barynt major. If that ever has to happen inside a major, the manifest needs a
  field for it.
