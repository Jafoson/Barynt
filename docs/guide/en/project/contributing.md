---
title: "Contributing"
description: "Run Barynt on your own machine, make a change, and send it back. For developers, translators and anyone who spots a typo."
sidebar:
  order: 1
---

Barynt is open source (MIT) and welcomes contributions: a fixed typo, a better sentence in these docs, a translation, a bug fix or a feature. This page gets you from zero to a pull request.

## Ways to help without writing code

- **Report a bug or an idea** as an issue on [GitHub](https://github.com/barynt-dev/Barynt/issues). Say what you did, what you expected and what happened. A screenshot helps.
- **Improve these docs.** Every page has an **Edit page** link at the bottom that opens the file on GitHub. Fix what is wrong or unclear, and propose the change. See [Writing the docs](#writing-the-docs) below.
- **Translate.** The app speaks English and German, and so do these docs. A missing or awkward German sentence is a good first contribution.

## Running it locally

You need [Bun](https://bun.sh) 1.3 or newer and [Docker](https://www.docker.com) (for the database).

```bash
git clone https://github.com/barynt-dev/Barynt.git
cd Barynt
bun install
cp example.env .env          # then put a secret into AUTH_SECRET: bunx auth secret
bun run db:dev               # starts Postgres and Redis, migrates and fills demo data
bun run dev                  # http://localhost:3000
```

The demo data is a company called Nimbus with a few projects, issues and people, so you have something to click through right away. Passkeys work on `localhost` without any further setup.

| Command | What it does |
| --- | --- |
| `bun run dev` | The development server |
| `bun run lint`, `bun run format` | Check and format the code (Biome) |
| `bun run test` | The full test suite |
| `bun run db:reset` | Throw the database away and start over |

## The shape of the code

- **Next.js 16 and React 19**, TypeScript, PostgreSQL with Prisma. Styles are SCSS modules, no Tailwind.
- Pages are **server components** by default. Changes go through **server functions**, not API routes.
- Every feature component is split into the part that loads data and the part that draws it.
- The detailed conventions live in `CLAUDE.md` at the root of the repository: architecture, styling, rich text, icons, email, the database workflow and testing. Read it before a larger change.

> [!WARNING]
> Always run the tests with `bun run test`, not `bun test`. The suite is split into several isolated processes on purpose, because some tests replace modules that others test for real. `CLAUDE.md` explains why.

## Sending a change

1. Create a branch from `main`.
2. Make the change. If you touch `prisma/schema.prisma`, add a migration (`bun prisma migrate dev --name what-it-does`) and check that the seed still runs.
3. Run `bun run lint`, `bun run format` and `bun run test`.
4. Use **Conventional Commits** for your messages: `fix(board): keep the card order after a refresh`. The type (`fix`, `feat`, `docs`, …) decides how the next version number is chosen and what appears in the release notes.
5. Open a pull request and describe what changed and why.

## Writing the docs

These pages are Markdown files in `docs/guide/` of the repository. A feature that changes what users see or do should update its page **in the same pull request**.

- One file per page, in a folder per group: `using-barynt/views.md`. The German page has the same path under `de/`.
- The front matter at the top holds the `title`, a one-sentence `description` and the `sidebar.order`.
- Write for people who do not code: team leads, product people, administrators. Short sentences, concrete examples, and the words the app itself uses.
- Callouts use GitHub's `> [!NOTE]`, `> [!TIP]` and `> [!WARNING]`. Links between pages are relative `.md` links.
- Screenshots go into `docs/guide/assets/`. English pages use `assets/en/`, German ones `assets/de/`; take screenshots in the dark theme. The test `tests/unit/docs` checks that links and images exist.

`docs/guide/README.md` has the full guide, including how to preview your changes on the real site.
