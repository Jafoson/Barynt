# User docs

```
docs/guide/
  en/<group>/<page>.md     English pages
  de/<group>/<page>.md     German pages
  assets/en/, assets/de/   screenshots per language
  _groups.json             groups and their names
```

Everything in this folder (except this file) is published as the docs on the
website ([barynt-site](https://github.com/Jafoson/barynt-site), built with
[Starlight](https://starlight.astro.build)). The site reads the folder at the
release tag `vX.Y.Z`, so the docs always match the version people run. Change
the docs in the same PR as the feature.

## A page

One Markdown file per page. English pages live in `en/`, German ones in `de/`
at the same path. The folder inside is the sidebar group, the file name the
URL: `en/getting-started/install.md` → `/docs/getting-started/install/`.

```md
---
title: Install
description: One sentence under the title, also used for search and link previews.
sidebar:
  order: 2        # position within the group
  badge: New      # optional
---

## A heading

Plain Markdown. It reads the same here on GitHub as on the site.
```

| You write | The site shows |
| --- | --- |
| ` ```bash ` code block | a code block with a copy button |
| `> [!NOTE]` / `> [!TIP]` / `> [!WARNING]` / `> [!CAUTION]` | a callout (GitHub renders these too) |
| `[Install](install.md)` | a link to that page (also works on GitHub) |
| `{{version}}` | the release the site is built for, e.g. in `--version {{version}}` |
| `<!-- TODO … -->` | nothing: a note for the next person |

## Images

Images live in `assets/<language>/`: `assets/en/` for the English pages,
`assets/de/` for the German ones. A page links the folder of its own language,
relatively: `![Workspace overview](../../assets/en/overview.webp)` in English,
`![Workspace-Übersicht](../../assets/de/overview.webp)` in German (a German page
that has no picture of its own may link the English one).

Screenshots are always taken in the dark theme.

The screenshots are recorded from a demo workspace, in all four variants at
once: see `scripts/docs-shots/README.md`. Re-record them when the interface
changes instead of editing them by hand.

## German

The German page sits at the same path under `de/` instead of `en/`:
`de/getting-started/install.md`. Links to other pages stay relative and
identical; images point at their own language folder (`../../assets/en/…` in
English, `../../assets/de/…` in German). A page without a German version shows
the English one with a note, so a missing translation never blocks a PR.

## The API reference is generated

`en|de/api-reference/` is written by `bun run docs:api` from the same data as
the reference in the app (`features/account/components/AccountApiKeys/*DocsData.ts`,
`AccountMcp/mcpDocsData.ts`) and from the real input schemas of the MCP tools.
Don't edit those pages. Change the data when a route, tool or event changes,
run the script and commit the result; `bun run test` fails while they are out
of date, and also when an MCP tool exists without a description. The guides
around them (`integrations/api.md`, `mcp.md`, `webhooks.md`) are hand-written.

## A new group

Add a folder and its name in both languages to `_groups.json`; the order there
is the order in the sidebar.

## Preview

```bash
git clone https://github.com/Jafoson/barynt-site ../barynt-site
cd ../barynt-site && bun install
BARYNT_DOCS_DIR=../Barynt/docs/guide bun run dev   # http://localhost:4321/docs/
```

`bun run test` checks the folder (front matter, links, images, groups), see
`tests/unit/docs/`.
