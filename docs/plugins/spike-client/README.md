# Spike: loading plugin client code in the browser

Throwaway experiment behind [ADR 0002](../adr-0002-client-bundles.md). Nothing here
ships with the app.

## Files

| File | What it is |
| --- | --- |
| `fixtures/` | Five plugin sources: a good one, the same one built in development mode, one that bundles its own React, one that throws while rendering, one that imports an unmapped package. |
| `build-fixtures.sh` | Builds them to `/tmp/barynt-plugin-spike/<id>/1.0.0/client.js` with Bun (React and the SDK as externals, production mode). |
| `host/` | The temporary app code, as `.txt` so it is not compiled or linted: a route that serves plugin files, a route that serves the import map's shim modules, the test page, the client component that loads plugins, an entry page for the soft-navigation test, and a patch that puts the import map into the root layout. |
| `browser.ts`, `run-browser.sh` | Headless Chromium driven over the DevTools protocol: load a URL, wait until every case has finished, print what is in the DOM plus console errors. |
| `run-output.txt` | Results of the runs behind the ADR. |

## Reproduce

Needs Bun, `chromium` and, for the production run, Docker. The dev server on port
3000 (`bun dev`) is used as it is.

```sh
# 1. Build the fixture plugins.
docs/plugins/spike-client/build-fixtures.sh

# 2. Copy the host code into the app. Temporary, do not commit.
H=docs/plugins/spike-client/host
mkdir -p "app/api/plugin-spike/asset/[...path]" "app/api/plugin-spike/runtime/[name]" \
         "app/[locale]/(auth)/login/plugin-spike" "app/[locale]/(auth)/login/plugin-spike-entry"
cp $H/asset-route.ts.txt   "app/api/plugin-spike/asset/[...path]/route.ts"
cp $H/runtime-route.ts.txt "app/api/plugin-spike/runtime/[name]/route.ts"
cp $H/PluginSpikeHost.tsx.txt "app/[locale]/(auth)/login/plugin-spike/PluginSpikeHost.tsx"
cp $H/page.tsx.txt         "app/[locale]/(auth)/login/plugin-spike/page.tsx"
cp $H/entry-page.tsx.txt   "app/[locale]/(auth)/login/plugin-spike-entry/page.tsx"
git apply $H/root-layout-importmap.patch.txt          # the import map, in the root layout

# 3. Run against the dev server.
docs/plugins/spike-client/run-browser.sh                                    # direct load
docs/plugins/spike-client/run-browser.sh http://localhost:3000/en/login/plugin-spike-entry   # soft navigation

# 4. Optional, production build:
docker build --target runner -t barynt-spike:client .
docker run -d --name spike-client -p 3331:3000 -e PLUGINS_DIR=/plugins \
  -e DATABASE_URL=postgresql://x:x@127.0.0.1:5432/x -e AUTH_SECRET=spike \
  -v /tmp/barynt-plugin-spike:/plugins:ro barynt-spike:client
docs/plugins/spike-client/run-browser.sh http://127.0.0.1:3331/en/login/plugin-spike
docker rm -f spike-client

# 5. Remove the temporary code again.
git checkout -- "app/[locale]/layout.tsx"
rm -r app/api/plugin-spike "app/[locale]/(auth)/login/plugin-spike" "app/[locale]/(auth)/login/plugin-spike-entry"
```

To see the failure the ADR describes, leave out the `git apply` and put the
`<script type="importmap">` from the patch into `page.tsx` instead: a direct load
works, a soft navigation through the entry page does not.

`docs/` is excluded from `tsconfig.json`, because the fixtures import packages that
only exist at runtime (`@barynt/plugin-sdk`) and would otherwise fail the type check.
