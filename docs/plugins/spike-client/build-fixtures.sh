#!/usr/bin/env bash
# Builds the client fixtures into <outdir>/<id>/1.0.0/client.js (one directory per
# version, like a store install would). Default outdir: /tmp/barynt-plugin-spike.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-/tmp/barynt-plugin-spike}"
rm -rf "$OUT"

externals=(--external react --external react/jsx-runtime --external react-dom --external @barynt/plugin-sdk)

# NODE_ENV=production makes the JSX transform emit react/jsx-runtime. Without it
# bun emits react/jsx-dev-runtime (jsxDEV), which React's production build does not
# provide. A plugin build tool has to set this.
build() { # id, source-id (the fixture directory), extra bun-build args...
  local id="$1" src="$2"; shift 2
  mkdir -p "$OUT/$id/1.0.0"
  (cd "$HERE" && bun build "fixtures/$src/src/index.tsx" --format=esm --target=browser \
    --outfile "$OUT/$id/1.0.0/client.js" "$@" >/dev/null)
  [ -f "$HERE/fixtures/$src/client.css" ] && cp "$HERE/fixtures/$src/client.css" "$OUT/$id/1.0.0/client.css"
  echo "built $id ($(wc -c <"$OUT/$id/1.0.0/client.js") bytes, $(grep -o 'react/jsx[a-z-]*runtime' "$OUT/$id/1.0.0/client.js" | sort -u | tr '\n' ' '))"
}
export NODE_ENV=production

build hello-client hello-client "${externals[@]}"
NODE_ENV=development build hello-client-dev hello-client "${externals[@]}"   # forgot production mode
build bundled-react bundled-react --external @barynt/plugin-sdk              # React bundled in on purpose
build throws-client throws-client "${externals[@]}"
build bare-import bare-import "${externals[@]}" --external lodash-es
