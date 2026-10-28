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
`publish`. The run then:

1. commits `package.json`, the Helm chart (`version`, `appVersion` and the
   image Artifact Hub lists, all set to the release) and `releases/` to `main`;
2. creates the GitHub release on tag `vX.Y.Z`: the English notes, the German
   ones folded underneath, relative image paths rewritten to the tag's raw
   files. Attached are the installer's files — `install.sh`,
   `docker-compose.yml`, `Caddyfile`, `example.env` — their `SHA256SUMS` and
   `install.sh.sigstore.json` (a keyless cosign signature of the installer);
3. builds the Docker image on the tag (`docker-build.yml`): `X.Y.Z` and
   `latest`, multi-arch, scanned and signed;
4. after that, publishes the signed Helm chart (`helm-release.yml`).

So once the run is green, `curl -fsSL https://github.com/Jafoson/Barynt/releases/latest/download/install.sh | sh`,
`barynt upgrade` and `helm install oci://ghcr.io/jafoson/charts/barynt` all
get the new version. The sidebar's update card compares against the release.

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

The part you write is also what the app shows: the version line under the user
card opens a window with these notes, one tab per version, in the viewer's
language. The generated change block, the heading and HTML comments stay out of
it; images are served from `releases/assets/`. After an update the window opens
once by itself.
