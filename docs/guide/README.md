# User docs

Everything in this folder (except this file) is published as the docs on the
website ([barynt-site](https://github.com/Jafoson/barynt-site), built with
[Starlight](https://starlight.astro.build)). The site reads the folder at the
release tag `vX.Y.Z`, so the docs always match the version people run. Change
the docs in the same PR as the feature.

## A page

One Markdown file per page. The folder is the sidebar group, the file name the
URL: `getting-started/install.md` → `/docs/getting-started/install/`.

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

Put them in `assets/` and link them relatively:
`![Workspace overview](../assets/overview.webp)`. Variants are picked by file
name, and every one is optional:

| File | Used for |
| --- | --- |
| `overview.webp` | always (the fallback) |
| `overview.de.webp` | German pages |
| `overview.light.webp` | light mode |
| `overview.de.light.webp` | German pages in light mode |

## German

The German page sits at the same path under `de/`:
`de/getting-started/install.md`. Links and images stay relative, so the same
`../assets/…` becomes `../../assets/…`. A page without a German version shows
the English one with a note, so a missing translation never blocks a PR.

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
