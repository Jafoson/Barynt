#!/bin/sh
# Tests for install.sh's own logic — configuration, .env handling, versions,
# argument parsing. No Docker, no network: the functions are loaded with
# BARYNT_SOURCED=1 and called directly. The full install runs end-to-end in
# .github/workflows/installer.yml.
#
#   sh tests/installer/test.sh        (also: dash …, bash …)

# The globals below are read by the sourced install.sh, not by this file.
# shellcheck disable=SC2034
# shellcheck source-path=SCRIPTDIR

set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

FAILED=0
PASSED=0

pass() { PASSED=$((PASSED + 1)); }
fail() {
  FAILED=$((FAILED + 1))
  printf 'FAIL: %s\n' "$*" >&2
}
# eq NAME EXPECTED ACTUAL
eq() {
  if [ "$2" = "$3" ]; then pass; else fail "$1: expected [$2], got [$3]"; fi
}
# matches NAME REGEX VALUE
matches() {
  if printf '%s' "$3" | grep -Eq "$2"; then pass; else fail "$1: [$3] doesn't match $2"; fi
}

BARYNT_SOURCED=1
# shellcheck source=../../install.sh
. "$ROOT/install.sh"

# The defaults `main` would set.
reset() {
  COMMAND='' DIR="$WORK/$1" VERSION=1.0.0 DOMAIN='' FILES_DOMAIN='' SOURCE='' IMAGE='' OUTPUT=''
  ASSUME_YES=1 DRY_RUN=0 NO_START=0 NO_BACKUP=0 PURGE=0 FORCE=0 INSTALL_DOCKER=0
  DOCKER='' CLI=barynt OS='' ARCH='' TMP="$WORK/tmp-$1"
  mkdir -p "$DIR" "$TMP"
}

# ─── write_env: server ───────────────────────────────────────────────────────

reset server
DOMAIN="https://Issues.example.com/"
write_env >/dev/null
eq "domain is cleaned of scheme and path" "Issues.example.com" "$(env_get DOMAIN)"
eq "files domain defaults to files.<domain>" "files.Issues.example.com" "$(env_get FILES_DOMAIN)"
eq "AUTH_URL is https" "https://Issues.example.com" "$(env_get AUTH_URL)"
eq "S3 public endpoint is the files domain" "https://files.Issues.example.com" "$(env_get COMPOSE_S3_PUBLIC_ENDPOINT)"
eq "version pinned" "1.0.0" "$(env_get BARYNT_VERSION)"
matches "AUTH_SECRET is 64 hex" '^[0-9a-f]{64}$' "$(env_get AUTH_SECRET)"
matches "POSTGRES_PASSWORD is 64 hex" '^[0-9a-f]{64}$' "$(env_get POSTGRES_PASSWORD)"
matches "S3 secret is 64 hex" '^[0-9a-f]{64}$' "$(env_get S3_SECRET_ACCESS_KEY)"
if [ "$(env_get AUTH_SECRET)" != "$(env_get POSTGRES_PASSWORD)" ]; then pass; else fail "secrets must differ"; fi
eq ".env is private" "600" "$(stat -c %a "$DIR/.env" 2>/dev/null || stat -f %Lp "$DIR/.env")"

# ─── write_env: local ────────────────────────────────────────────────────────

reset local
write_env >/dev/null
eq "local AUTH_URL" "http://localhost:3000" "$(env_get AUTH_URL)"
eq "local S3 endpoint" "http://localhost:9000" "$(env_get COMPOSE_S3_PUBLIC_ENDPOINT)"
eq "local has no domain" "" "$(env_get DOMAIN)"

# ─── write_env: explicit files domain, test image ────────────────────────────

reset custom
DOMAIN=barynt.example.org FILES_DOMAIN=cdn.example.org IMAGE=barynt
write_env >/dev/null
eq "explicit files domain" "cdn.example.org" "$(env_get FILES_DOMAIN)"
eq "test image recorded" "barynt" "$(env_get BARYNT_IMAGE)"

# ─── env_set / env_get ───────────────────────────────────────────────────────

reset envset
printf '# comment\nA="1"\nB=plain\n' >"$DIR/.env"
env_set A 2
eq "replaces a quoted value" "2" "$(env_get A)"
env_set B "two words"
eq "replaces an unquoted value" "two words" "$(env_get B)"
env_set SMTP_FROM "Barynt <barynt@example.com>"
eq "appends with <> and spaces" "Barynt <barynt@example.com>" "$(env_get SMTP_FROM)"
env_set URL "https://a.example/x?y=1&z=2"
eq "keeps & and /" "https://a.example/x?y=1&z=2" "$(env_get URL)"
eq "comments survive" "# comment" "$(head -n 1 "$DIR/.env")"
eq "no duplicate keys" "1" "$(grep -c '^A=' "$DIR/.env")"
eq "missing key is empty" "" "$(env_get NOPE)"

# ─── versions ────────────────────────────────────────────────────────────────

if valid_version 1.0.0; then pass; else fail "1.0.0 is a version"; fi
if valid_version 1.0; then fail "1.0 isn't a version"; else pass; fi
if valid_version v1.0.0; then fail "v1.0.0 isn't (the v is stripped earlier)"; else pass; fi
if valid_version "1.0.0; rm -rf /"; then fail "injection isn't a version"; else pass; fi

# ─── fetch_release from a local source ───────────────────────────────────────

reset fetch
SOURCE=$ROOT
fetch_release 1.0.0 "$DIR" >/dev/null
for f in docker-compose.yml Caddyfile example.env install.sh; do
  if [ -f "$DIR/$f" ]; then pass; else fail "fetch_release copies $f"; fi
done

# ─── dry run changes nothing ─────────────────────────────────────────────────

reset dry
DRY_RUN=1 DOMAIN=example.org
rmdir "$DIR"
write_env >/dev/null
if [ -e "$DIR/.env" ]; then fail "dry run wrote .env"; else pass; fi

# ─── main: help and errors ───────────────────────────────────────────────────

out=$(main --help)
matches "help lists commands" 'upgrade' "$out"
if (main --bogus >/dev/null 2>&1); then fail "unknown option must fail"; else pass; fi
if (main frobnicate >/dev/null 2>&1); then fail "unknown command must fail"; else pass; fi

printf '%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" = 0 ]
