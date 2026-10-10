# Plugin manifest

Every plugin ships a `manifest.json` next to its `main.js` (and optional
`styles.css`). The same file sits in the plugin's GitHub release assets.

The schema lives in `lib/plugins/manifest.ts` and is strict: an unknown field
is an error. Validate a manifest locally:

```
bun scripts/validate-plugin-manifest.ts manifest.json
```

## Example

```json
{
  "id": "gantt-timeline",
  "name": "Gantt Timeline",
  "version": "1.2.0",
  "minBaryntVersion": "0.1.0",
  "author": "Acme GmbH",
  "description": "Issues on a timeline.",
  "license": "MIT",
  "kind": "sandbox",
  "levels": ["project"],
  "capabilities": ["issues:read", "ui:project-view"],
  "network": [],
  "contributes": {
    "projectViews": [{ "id": "timeline", "title": "Timeline" }]
  }
}
```

## Fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | 3 to 40 characters, lower-case letters, digits and `-`. `barynt`, `core`, `system`, `admin` are reserved. |
| `name`, `description`, `author`, `license` | yes | Shown in the store and in the install dialog. |
| `version` | yes | `MAJOR.MINOR.PATCH`, optional `-prerelease`. |
| `minBaryntVersion` | yes | Lowest Barynt version the plugin was built for. |
| `maxBaryntVersion` | no | Highest version it was tested on. |
| `kind` | yes | `declarative` (no code), `sandbox` (browser code in a sandboxed iframe), `service` (an external service). |
| `levels` | yes | Where it can be switched on: `workspace`, `project`. |
| `capabilities` | yes | What it asks for. Closed list, see `CAPABILITIES`. |
| `network` | yes | Hosts the plugin may call (bare host names, no scheme, port or wildcard). Empty for declarative plugins. |
| `contributes` | no | What it adds: `navItems`, `projectViews`, `dashboardWidgets`, `issuePanels`, `issueBadges`, `actions`, `fields`, `settings`. |

## Rules checked by the validator

- A contribution needs its capability (`projectViews` needs `ui:project-view`, `fields` needs `fields:write`, …).
- A `declarative` plugin has no code: no `network`, and it may only contribute `fields`, `settings` and `issueBadges`.
- A `service` plugin has no browser surface: it may only contribute `fields` and `settings`.
- Ids inside one list are unique; choice fields and `select` settings need options, other types must not have them.
- `maxBaryntVersion` is not lower than `minBaryntVersion`.

Execution inside the Barynt server process is not a plugin kind. That is
reserved for Barynt's own code.
