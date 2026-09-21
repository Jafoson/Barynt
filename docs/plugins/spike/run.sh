#!/usr/bin/env bash
# Reproduces the BARY-50 experiments: can the built runner image load plugin code
# from a directory at runtime?
#
#   docker build --target runner -t barynt-spike:local .   # with the spike route in app/
#   docs/plugins/spike/run.sh
#
# Two layouts are compared: plugins mounted next to the app (/app/plugins, so
# bare imports can walk up to /app/node_modules) and away from it (/plugins).
set -euo pipefail

IMAGE="${IMAGE:-barynt-spike:local}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
WORK="$(mktemp -d)"
trap 'docker rm -f spike-app spike-out >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

cp -r "$HERE/fixtures" "$WORK/plugins"
chmod -R a+rX "$WORK"

# A plugin that carries its own dependencies: bundle src/ into server.js.
(cd "$ROOT" && bun build "$HERE/fixtures/bundled-dep/src/index.js" \
  --target=bun --outfile "$WORK/plugins/bundled-dep/server.js" >/dev/null)

start() { # $1 = mount point inside the container, $2 = host port, rest = command override
  local mount="$1" port="$2"; shift 2
  docker rm -f spike-app >/dev/null 2>&1 || true
  docker run -d --name spike-app -p "$port:3000" \
    -e PLUGINS_DIR="$mount" -e DATABASE_URL="postgresql://x:x@127.0.0.1:5432/x" \
    -e AUTH_SECRET="spike-only" -v "$WORK/plugins:$mount:ro" "$IMAGE" "$@" >/dev/null
  set -- "$port"
  for _ in $(seq 1 60); do
    curl -s -o /dev/null "http://127.0.0.1:$port/api/plugin-spike?id=missing" && return 0
    sleep 1
  done
  echo "server did not start"; docker logs spike-app | tail -20; exit 1
}

call() { # $1 = port, rest = query string
  local port="$1"; shift
  local out rc=0 query
  query="$(IFS='&'; echo "$*")"
  out="$(curl -s --max-time 30 "http://127.0.0.1:$port/api/plugin-spike?$query")" || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "REQUEST FAILED (curl exit $rc); container log:"
    docker logs --tail 12 spike-app 2>&1 | cut -c1-240
    # The server may have died; bring it back so the remaining cases still run.
    docker start spike-app >/dev/null 2>&1 || true
    sleep 3
    return 0
  fi
  echo "${out:0:360}"
}

# mount:port:extra-args ("noinstall" starts bun with --no-install)
for layout in "/app/plugins:3301:" "/plugins:3302:" "/plugins:3303:noinstall"; do
  IFS=: read -r mount port mode <<<"$layout"
  echo
  echo "=== plugins mounted at $mount ${mode:+(bun --no-install) }(image: $IMAGE) ==="
  if [ "$mode" = "noinstall" ]; then start "$mount" "$port" bun --no-install server.js
  else start "$mount" "$port"; fi

  echo "--- hello.js (plain ESM)";                     call "$port" id=hello
  echo "--- hello-ts (TypeScript from disk)";          call "$port" id=hello-ts file=server.ts
  echo "--- needs-zod (bare import of a host package)"; call "$port" id=needs-zod
  echo "--- needs-react (bare import of react)";       call "$port" id=needs-react
  echo "--- bundled-dep (dependency bundled in)";      call "$port" id=bundled-dep
  echo "--- imports-host (@/lib/db from a plugin)";    call "$port" id=imports-host
  echo "--- throws (error while loading)";             call "$port" id=throws
  echo "--- hello via absolute path instead of URL";   call "$port" id=hello mode=path

  echo "--- counter, first load";                      call "$port" id=counter
  sed -i 's/STAMP = "A"/STAMP = "B"/' "$WORK/plugins/counter/server.js"
  echo "--- counter after edit, plain re-import";      call "$port" id=counter
  echo "--- counter after edit, with cache-bust";      call "$port" id=counter bust=1
  sed -i 's/STAMP = "B"/STAMP = "A"/' "$WORK/plugins/counter/server.js"

  mkdir -p "$WORK/plugins/late"
  cp "$WORK/plugins/hello/server.js" "$WORK/plugins/late/server.js"
  echo "--- late (added while the server runs)";       call "$port" id=late

  echo "--- user / write access inside the container"
  docker exec spike-app sh -c 'id -u; touch /app/plugins-test 2>&1 | head -1; echo "PLUGINS_DIR=$PLUGINS_DIR"'
done

echo
echo "=== reloading a changed plugin (plugins at /plugins, writable mount) ==="
docker rm -f spike-app >/dev/null 2>&1 || true
docker run -d --name spike-app -p 3304:3000 -e PLUGINS_DIR=/plugins \
  -e DATABASE_URL="postgresql://x:x@127.0.0.1:5432/x" -e AUTH_SECRET="spike-only" \
  -v "$WORK/plugins:/plugins" "$IMAGE" bun --no-install server.js >/dev/null
for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:3304/api/plugin-spike?id=missing" && break; sleep 1; done
echo "1 first load:                 $(call 3304 id=counter | sed -E 's/.*"result":(\{[^}]*\}).*/\1/')"
docker exec spike-app sed -i 's/STAMP = "A"/STAMP = "B"/' /plugins/counter/server.js
echo "2 same import again:          $(call 3304 id=counter | sed -E 's/.*"result":(\{[^}]*\}).*/\1/')"
echo "3 file:// URL with ?v=1:      $(call 3304 id=counter bust=1 | sed -E 's/.*"result":(\{[^}]*\}).*/\1/')"
echo "4 absolute path with ?v=3:    $(call 3304 id=counter bust=3 mode=path | sed -E 's/.*"result":(\{[^}]*\}).*/\1/')"
mkdir -p "$WORK/plugins/counter-v2" && cp "$WORK/plugins/counter/server.js" "$WORK/plugins/counter-v2/server.js"
echo "5 copy in a new directory:    $(call 3304 id=counter-v2 | sed -E 's/.*"result":(\{[^}]*\}).*/\1/')"

echo
echo "=== Bun auto-install: what happens to a bare import when no node_modules is found? ==="
docker rm -f spike-app >/dev/null 2>&1 || true
docker run -d --name spike-app -p 3305:3000 -e PLUGINS_DIR=/plugins \
  -e DATABASE_URL="postgresql://x:x@127.0.0.1:5432/x" -e AUTH_SECRET="spike-only" \
  -v "$WORK/plugins:/plugins:ro" "$IMAGE" >/dev/null
for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:3305/api/plugin-spike?id=missing" && break; sleep 1; done
echo "before: $(docker exec spike-app sh -c 'ls /home/bun/.bun/install/cache 2>/dev/null | tr "\n" " "')"
call 3305 id=needs-zod | cut -c1-140
echo "after:  $(docker exec spike-app sh -c 'ls /home/bun/.bun/install/cache 2>/dev/null | tr "\n" " "')"
echo "host ships zod $(cd "$ROOT" && bun -e 'console.log(require("zod/package.json").version)')"

echo
echo "=== compiled route: is the dynamic import() left in place? ==="
docker run --rm --name spike-out "$IMAGE" sh -c '
  f=$(find /app/.next/server -path "*plugin-spike*" -name "*.js" | head -3)
  echo "files: $f"
  for x in $f; do grep -o "import([a-zA-Z_.$]\{1,30\})" "$x" | sort -u | head -3; done
  echo "--- traced size of standalone server dir:"; du -sh /app/.next/server /app/node_modules 2>/dev/null'
