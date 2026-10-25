# Releases

One pair of files per version: `<version>.md` (English) and `<version>.de.md`
(German), images under `assets/<version>/`.

```
releases/
  0.2.0.md
  0.2.0.de.md
  assets/0.2.0/screenshot.png
```

## Releasing

Actions → **Release** → _Run workflow_ (from `main`):

| Input                             | Meaning                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `version`                         | e.g. `0.2.0`. Empty: proposed from the Conventional Commits since the last tag                                         |
| `highlights_en` / `highlights_de` | The text at the top of the notes, Markdown, `\n` for a line break. Empty: a file already in `releases/` stays as it is |
| `publish`                         | Off: preview only, shown in the job summary, nothing is written. On: release                                           |

Run it without `publish` first, read the preview, fix the inputs, run again with
`publish`. The run then commits `package.json` and `releases/` to `main`, tags
`vX.Y.Z` and creates the GitHub release: the English notes, the German ones
folded underneath, relative image paths rewritten to the tag's raw files. The
sidebar's update card compares against that release.

Each file is the highlights you wrote (text, screenshots) above a generated
block between `<!-- changes:start -->` and `<!-- changes:end -->`: the changes
grouped by `feat`/`fix`/…, the previous version and a compare link. The block
is rewritten on every run, everything else is kept. The German file gets the
same list (commit messages are English).

Longer notes or screenshots: commit `releases/<version>.md` (+ `.de.md`) and
`releases/assets/<version>/` in a normal PR beforehand and leave the inputs
empty — images are linked as `![Board](assets/0.2.0/board.png)`.

`fix:` bumps the patch, `feat:` the minor, `feat!:` / `BREAKING CHANGE:` the
major (below 1.0: the minor). With only `chore:`, `docs:`, `test:` since the
last tag there is nothing to propose — give a `version` to release anyway.
