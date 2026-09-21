# Spike: loading plugin code at runtime

Throwaway experiment behind [ADR 0001](../adr-0001-runtime-loading.md). Nothing
here ships with the app.

## Files

| File | What it is |
| --- | --- |
| `plugin-spike-route.ts.txt` | The route handler used in the experiment (a `.txt` so it is not linted or type-checked as app code). |
| `fixtures/` | Small plugins, one per question: plain ESM, TypeScript, a bare `zod` import, a bare `react` import, a bundled dependency, an import of a host alias, a module that throws, and one that is edited between requests. |
| `run.sh` | Starts the built image with the fixtures mounted and prints the results. |
| `run-output.txt` | The output of the last run (2026-09-22). |

## Reproduce

Needs Docker and Bun.

```sh
# 1. Put the spike route into the app (do not commit it).
mkdir -p app/api/plugin-spike
cp docs/plugins/spike/plugin-spike-route.ts.txt app/api/plugin-spike/route.ts

# 2. Build the image from the repository's own Dockerfile.
docker build --target runner -t barynt-spike:local .

# 3. Run the experiments.
docs/plugins/spike/run.sh          # IMAGE=... to use another tag

# 4. Remove the route again.
rm -r app/api/plugin-spike
```

`run.sh` compares three layouts (plugins at `/app/plugins`, at `/plugins`, and at
`/plugins` with `bun --no-install`), then reloading a changed plugin, Bun's
auto-install behaviour and the compiled output. It uses ports 3301 to 3305 and
removes its containers on exit.

The image-size comparison in the ADR is not part of the script; it comes from
building `main` (without the route) and the two route variants and comparing
`docker images`.
