# Releases

One pair of files per version: `<version>.md` (English) and `<version>.de.md`
(German), images under `assets/<version>/`.

```
releases/
  0.2.0.md
  0.2.0.de.md
  assets/0.2.0/screenshot.png
```

Nothing here is written from scratch. After every merge to `main`, the
**Release PR** workflow keeps a pull request `release/next` up to date: it
proposes the next version from the Conventional Commits since the last tag,
creates the two files and bumps `package.json`. Edit the files in that PR:

- Write the highlights above the `<!-- changes:start -->` marker — text,
  screenshots (`![Board](assets/0.2.0/board.png)`), whatever makes the release
  read well. This part is never touched again.
- The list between `changes:start` and `changes:end` is generated (grouped by
  `feat`/`fix`/…, with the previous version and a compare link) and rewritten
  on every run. Don't edit it.
- The German file gets the same generated list (commit messages are English)
  and your German prose.

Merging the PR creates the tag `vX.Y.Z` and the GitHub release (`release.yml`):
the English text, the German one folded underneath, relative image paths
rewritten to the tag's raw files. The sidebar's update card compares against
that release.

To release a different version than proposed, rename the two files (and
`assets/<version>/`) and set `package.json` to match in the PR. `fix:` bumps the
patch, `feat:` the minor, `feat!:` / `BREAKING CHANGE:` the major (below 1.0:
the minor). `chore:`, `docs:`, `test:` alone don't make a release.
