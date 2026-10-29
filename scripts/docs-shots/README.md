# Screenshots for the user guide

`docs/guide/assets/*.webp` are recorded, not drawn by hand, so they can be
re-recorded when the interface changes. Every shot exists four times: English
and German, dark and light (`name.webp`, `name.de.webp`, `name.light.webp`,
`name.de.light.webp`).

## What you need

- A running Barynt (`bun run build && bun run start`, or `bun run dev`) on
  `BASE_URL` (default `http://localhost:3000`) with a **fresh, migrated
  database**.
- The demo data: workspace "Nimbus" with its projects, people, issues,
  webhooks and audit entries. Load `demo.sql` on top of the normal seed.
- `psql` and `pg_restore` on the path, Playwright (`npm i -g playwright`),
  and the repository's own `sharp`.

## Recording

```bash
# once, after loading the demo data: a snapshot to reset to between shots
pg_dump -Fc -a --exclude-table=_prisma_migrations "$DATABASE_URL" > demo.dump

SNAPSHOT=demo.dump node scripts/docs-shots/capture.mjs              # everything
SNAPSHOT=demo.dump node scripts/docs-shots/capture.mjs board inbox  # some shots
LANGS=en THEMES=dark node scripts/docs-shots/capture.mjs board      # one variant
```

Shots that change data (invitations, API keys, public links) start from the
snapshot, which is why `SNAPSHOT` matters. `shots.mjs` lists every shot: the
page, the window size and, if needed, the clicks before the picture is taken.
The sign-in page with company logins (`login-sso`) is recorded by starting the
app with `AUTH_GITHUB_*` / `AUTH_GOOGLE_*` set and running `capture.mjs login`.

Only demo data ever ends up in a picture. Look at the result before you commit.
