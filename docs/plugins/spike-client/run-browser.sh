#!/usr/bin/env bash
# Loads the spike page in headless Chromium (over the DevTools protocol, see
# browser.ts) and prints, per plugin case, what ended up in the DOM plus the
# browser's console errors.
#
#   docs/plugins/spike-client/run-browser.sh [url]
#
# Default url: the dev server on port 3000. Needs `chromium` and Bun.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
URL="${1:-http://localhost:3000/en/login/plugin-spike}"

# Warm up first: a cold dev server compiles the page on the first request.
curl -s -o /dev/null --max-time 120 "$URL" || true

bun "$HERE/browser.ts" "$URL"
