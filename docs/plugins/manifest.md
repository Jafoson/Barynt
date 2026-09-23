# Plugin manifest

Every plugin has a `barynt-plugin.json` at the root of its directory and of its
release archive. It says what the plugin is, what it needs and what it adds to
Barynt. The host reads it **without running any plugin code**, so it can list,
check and enable a plugin before it decides to trust the code.

The format is defined once, in [`lib/plugins/manifest.ts`](../../lib/plugins/manifest.ts)
(a zod schema). Everything else is generated from it or checked against it:

- the JSON Schema for editors, [`public/schemas/barynt-plugin.schema.json`](../../public/schemas/barynt-plugin.schema.json);
- the validator, [`lib/plugins/validate.ts`](../../lib/plugins/validate.ts);
- the examples in [`examples/`](examples), which the tests validate.

> **Status: early.** Manifest format `1` is the first draft. What an item under
> `contributes` looks like is still open (see [Not decided yet](#not-decided-yet)).

## Two examples

A declarative plugin, no code at all. The host renders everything
([`examples/declarative.json`](examples/declarative.json)):

```json
{
  "$schema": "https://raw.githubusercontent.com/Jafoson/Barynt/main/public/schemas/barynt-plugin.schema.json",
  "manifestVersion": 1,
  "id": "customer-tracking",
  "name": { "en": "Customer tracking", "de": "Kundenverfolgung" },
  "version": "1.0.0",
  "description": { "en": "Adds a customer number to every issue.", "de": "Fügt jedem Issue eine Kundennummer hinzu." },
  "author": "Jane Doe",
  "license": "MIT",
  "barynt": ">=1.0.0 <2.0.0",
  "capabilities": ["issues:read"],
  "contributes": { "customFields": [{ "id": "customer-number" }] }
}
```

A plugin with server and client code, styles, translations and a dependency:
[`examples/with-code.json`](examples/with-code.json).

## Fields

| Field | Required | What it is |
| --- | --- | --- |
| `manifestVersion` | yes | Must be `1`, the format this Barynt reads. |
| `id` | yes | Lowercase letters, digits and single dashes, starting with a letter, 2 to 63 characters. Also the plugin's directory name. A few names are reserved (`barynt`, `core`, `plugin`, `plugins`, `system`, `admin`, `api`). |
| `name`, `description` | yes | A text (at most 80 and 500 characters) or one text per language: `{ "en": "…", "de": "…" }`. With several languages `en` is required, it is the fallback. |
| `version` | yes | SemVer such as `1.4.0` or `2.0.0-beta.1`. No build metadata (`+…`): the version becomes a directory name and part of URLs. |
| `author` | yes | A name, or `{ "name", "email"?, "url"? }`. |
| `license` | yes | An SPDX expression such as `MIT` or `Apache-2.0 OR MIT`. The list of licence ids is not checked. |
| `homepage`, `repository` | no | `https://` links. |
| `icon` | no | A `.svg` or `.png` shipped in the plugin, so showing it needs no request to an icon service. |
| `barynt` | yes | The Barynt versions the plugin works with, a SemVer range such as `^1.2.0`. `*` is rejected: a compatibility claim has to claim something. |
| `dependencies` | no | Other plugins by id and version range, at most 20. A plugin cannot depend on itself. |
| `server` | no | The server module, `.js` or `.mjs`. |
| `client` | no | The client bundle, `.js` or `.mjs`. |
| `styles` | no | Up to 10 `.css` files. Needs a `client`. |
| `messages` | no | A directory with one `<locale>.json` per language. |
| `capabilities` | no | What the plugin asks to be allowed to do, for example `issues:read` or `network:egress:api.example.com`. The admin confirms it on install. |
| `contributes` | no | Where the plugin plugs in, see below. |
| `$schema` | no | Lets editors offer completion. Ignored by the host. |

Any other field is an error. That is deliberate: a typo such as `capabilites`
would otherwise be silently ignored.

### Paths

`server`, `client`, `styles`, `icon` and `messages` are paths **inside the plugin
directory**: relative, with forward slashes, without `..`, empty or hidden
segments (`./a.js`, `a//b.js` and `.secret/a.js` are refused), at most 200
characters. Plugins ship built **JavaScript**; `.ts` is refused
([ADR 0001](adr-0001-runtime-loading.md) explains why).

### Tiers

A manifest without `server` and `client` is a **declarative** plugin (tier A):
nothing of the plugin runs. With either entry point the plugin runs code in the
app (tier B). Tier C, the sandbox, is a different way of running code, not a
property of the manifest.

### Contributions

`contributes` lists what the plugin adds, by extension point:

`settings`, `pages`, `navigation`, `views`, `issuePanels`, `issueActions`,
`dashboardWidgets`, `commands`, `permissions`, `events`, `jobs`, `webhooks`,
`customFields`, `notifications`.

Each value is a list of items. Every item needs an `id` (lowercase letters, digits
and dashes, unique within its list) and may have a `when` condition. An unknown
extension point is an error.

## Validating

```ts
import { formatIssues, parseManifest } from "@/lib/plugins/validate";

const result = parseManifest(text);          // or validateManifest(value) for parsed JSON
if (!result.ok) console.log(formatIssues(result.issues).join("\n"));
```

The result is either `{ ok: true, manifest }` (defaults filled in) or
`{ ok: false, issues }`, one issue per problem, each naming its field:

```
id: use lowercase letters, digits and single dashes, starting with a letter
version: must be a SemVer version such as "1.4.0" or "2.0.0-beta.1" (no build metadata)
dependencies.other: not a valid SemVer range, for example "^1.2.0" or ">=1.0.0 <2.0.0"
contributes.pages[2].id: is required
capabilites: is not a known field
```

Validation never throws, whatever the input holds. A rule that involves several
fields (a plugin depending on itself, `styles` without `client`) is only reported
once the fields themselves are valid.

## Not decided yet

Deliberately left open, because the ticket that builds the feature decides it:

- **The shape of a contribution item** beyond `id` and `when`. Each extension
  point defines its own (BARY-66 settings, BARY-70 pages, BARY-71 views, BARY-75
  issue panels, …). Until then an item can carry any further fields.
- **Which capability names exist.** Only the shape (`resource:action[:qualifier]`)
  is checked (BARY-95).
- **The grammar of `when`** (BARY-65).
- **Compatibility and dependency resolution** are not part of the manifest: it only
  checks that the ranges are valid. Whether `barynt` matches the running version and
  whether the dependencies are installed is decided in
  [`lib/plugins/resolve.ts`](../../lib/plugins/resolve.ts), see
  [Compatibility](compatibility.md).

## Regenerating the JSON Schema

After changing the zod schema:

```sh
bun run plugin-schema:build     # rewrite public/schemas/barynt-plugin.schema.json
bun run plugin-schema:check     # fail if it is out of date (the tests do this too)
```

The JSON Schema describes shapes and required fields. Rules that need code
(reserved ids, unique ids, `styles` needing a `client`) are enforced by the
validator only.

## The store's schema is looser, for now

The store repository ([barynt-plugin-store](https://github.com/Jafoson/barynt-plugin-store))
still carries a provisional copy of the manifest schema: it accepts unknown fields,
build metadata in versions and a looser id pattern, and knows no `manifestVersion`.
This schema replaces it once the store reads it (BARY-104). Until then the two
differ in both directions:

- A manifest with one text per language (`name`, `description`) passes here and is
  refused by the store, whose copy only knows a single text.
- A manifest the store accepts can fail here, because the store does not check what
  this schema added: `manifestVersion`, unknown fields, the shape of paths,
  capabilities and versions.
