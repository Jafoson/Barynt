#!/bin/sh
# Barynt installer and management CLI.
#
# Install (newest release):
#   curl -fsSL https://github.com/Jafoson/Barynt/releases/latest/download/install.sh | sh
#
# Without questions, e.g. from cloud-init:
#   curl -fsSL .../install.sh | sh -s -- --domain issues.example.com --yes
#
# Read it first, then run it:
#   curl -fsSLO .../install.sh && less install.sh && sh install.sh
#
# Afterwards the same script is installed as `barynt`:
#   barynt status | upgrade | backup | restore | logs | config | doctor | uninstall
#
# Run `sh install.sh help` for every command and option.
#
# The whole script is wrapped in functions and only `main` at the very end
# runs anything: if the download breaks off halfway through `curl | sh`, the
# shell gets no call to `main` and does nothing at all.

set -eu

REPO="Jafoson/Barynt"
# Every file a running installation needs. `barynt` is this script itself.
RELEASE_FILES="docker-compose.yml Caddyfile example.env install.sh"
HEALTH_TIMEOUT=300

# ─── Output ──────────────────────────────────────────────────────────────────

if [ -t 1 ]; then
  C_RESET=$(printf '\033[0m') C_BOLD=$(printf '\033[1m') C_DIM=$(printf '\033[2m')
  C_GREEN=$(printf '\033[32m') C_YELLOW=$(printf '\033[33m') C_RED=$(printf '\033[31m') C_CYAN=$(printf '\033[36m')
else
  C_RESET='' C_BOLD='' C_DIM='' C_GREEN='' C_YELLOW='' C_RED='' C_CYAN=''
fi

say() { printf '%s\n' "$*"; }
info() { printf '%s›%s %s\n' "$C_CYAN" "$C_RESET" "$*"; }
ok() { printf '%s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
# die MESSAGE [EXIT_CODE]
die() {
  printf '%s✗ %s%s\n' "$C_RED" "$1" "$C_RESET" >&2
  exit "${2:-1}"
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

has() { command -v "$1" >/dev/null 2>&1; }

# Runs a command, or only prints it with --dry-run.
run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '%s[dry-run]%s %s\n' "$C_DIM" "$C_RESET" "$*"
    return 0
  fi
  "$@"
}

# A terminal to ask on. With `curl | sh` standard input is the script itself,
# so questions go to /dev/tty — and without one (CI, cloud-init) nobody is
# asked anything.
can_ask() {
  [ "$ASSUME_YES" = 0 ] && [ -r /dev/tty ] && { : </dev/tty; } 2>/dev/null
}

# ask VAR "Question" [default]
ask() {
  ask_default=${3-}
  if ! can_ask; then
    eval "$1=\$ask_default"
    return 0
  fi
  if [ -n "$ask_default" ]; then
    printf '%s%s%s [%s]: ' "$C_BOLD" "$2" "$C_RESET" "$ask_default" >/dev/tty
  else
    printf '%s%s%s: ' "$C_BOLD" "$2" "$C_RESET" >/dev/tty
  fi
  ask_answer=''
  IFS= read -r ask_answer </dev/tty || true
  [ -n "$ask_answer" ] || ask_answer=$ask_default
  eval "$1=\$ask_answer"
}

# confirm "Question" — yes with --yes, no without a terminal.
confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  can_ask || return 1
  printf '%s%s%s [y/N]: ' "$C_BOLD" "$1" "$C_RESET" >/dev/tty
  confirm_answer=''
  IFS= read -r confirm_answer </dev/tty || true
  case "$confirm_answer" in y | Y | yes | YES | j | J | ja) return 0 ;; *) return 1 ;; esac
}

# 64 hex characters from a cryptographic source. Hex, not base64: no `/`,
# `+` or `=` that would need quoting in .env or break a connection URL.
random_hex() {
  if has openssl; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

sha256_of() {
  if has sha256sum; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Root for one command, when we aren't root ourselves.
as_root() {
  if [ "$(id -u)" = 0 ]; then
    run "$@"
  elif has sudo; then
    run sudo "$@"
  else
    die "This step needs root and sudo isn't available: $*"
  fi
}

# ─── Environment ─────────────────────────────────────────────────────────────

detect_platform() {
  case "$(uname -s)" in
    Linux) OS=linux ;;
    Darwin) OS=macos ;;
    *) die "Unsupported system: $(uname -s). Barynt installs on Linux (and macOS for testing)." 10 ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) ARCH=amd64 ;;
    aarch64 | arm64) ARCH=arm64 ;;
    *) die "Unsupported CPU: $(uname -m). The Barynt image exists for amd64 and arm64." 10 ;;
  esac
}

# Docker, with sudo when the current user can't reach the daemon directly
# (not in the docker group). DOCKER is "docker", "sudo docker", or empty.
dk() {
  if [ "$DOCKER" = "sudo docker" ]; then sudo docker "$@"; else docker "$@"; fi
}

# Sets DOCKER to how the Docker daemon is reached — with sudo, if the
# current user isn't in the docker group.
detect_docker() {
  DOCKER=''
  has docker || return 1
  if docker info >/dev/null 2>&1; then
    DOCKER=docker
  elif has sudo && sudo -n docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
  elif has sudo && [ "$ASSUME_YES" = 0 ] && can_ask && sudo docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
  else
    return 1
  fi
  dk compose version >/dev/null 2>&1 || die "Docker is installed, but the Compose plugin (docker compose) is missing. Install it: https://docs.docker.com/compose/install/linux/" 11
}

ensure_docker() {
  detect_docker && return 0
  if has docker; then
    die "Docker is installed but not reachable for $(id -un). Start the Docker service, or add yourself to the docker group: sudo usermod -aG docker $(id -un) (then log in again)." 11
  fi
  if [ "$OS" = macos ]; then
    die "Docker isn't installed. Install Docker Desktop (https://www.docker.com/products/docker-desktop/), start it and run this again." 11
  fi
  warn "Docker isn't installed."
  if [ "$INSTALL_DOCKER" = 0 ] && ! { can_ask && confirm "Install Docker now with the official script from get.docker.com?"; }; then
    die "Docker is required. Install it (https://docs.docker.com/engine/install/) or run again with --install-docker." 11
  fi
  info "Installing Docker (get.docker.com) …"
  if [ "$DRY_RUN" = 1 ]; then
    run sh -c "curl -fsSL https://get.docker.com | sh"
    DOCKER=docker
    return 0
  fi
  curl -fsSL https://get.docker.com -o "$TMP/get-docker.sh"
  as_root sh "$TMP/get-docker.sh"
  detect_docker || DOCKER="sudo docker"
  ok "Docker installed"
}

# ─── Install directory ───────────────────────────────────────────────────────

default_dir() {
  [ -n "$OS" ] || detect_platform
  if [ "$OS" = macos ]; then
    printf '%s/barynt' "$HOME"
  else
    printf '/opt/barynt'
  fi
}

# Where the installation lives: --dir, BARYNT_DIR, the directory this
# script sits in (the `barynt` CLI inside an installation), or the default.
resolve_dir() {
  [ -n "$DIR" ] && return 0
  self=$0
  if [ -L "$self" ]; then
    self=$(readlink -f "$self" 2>/dev/null || readlink "$self")
  fi
  self_dir=$(cd "$(dirname "$self")" 2>/dev/null && pwd) || self_dir=''
  if [ -n "$self_dir" ] && [ -f "$self_dir/docker-compose.yml" ] && [ -f "$self_dir/.env" ]; then
    DIR=$self_dir
  else
    DIR=$(default_dir)
  fi
}

require_installation() {
  [ -f "$DIR/.env" ] && [ -f "$DIR/docker-compose.yml" ] ||
    die "No Barynt installation in $DIR. Install it with: sh install.sh install (or pass --dir)." 12
}

compose() {
  (cd "$DIR" && dk compose --profile app "$@")
}

# env_get KEY — a value from the installation's .env (empty if unset).
env_get() {
  sed -n "s/^$1=//p" "$DIR/.env" | tail -n 1 | sed 's/^"\(.*\)"$/\1/'
}

# env_set KEY VALUE — replaces the line, or appends it.
env_set() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '%s[dry-run]%s set %s in .env\n' "$C_DIM" "$C_RESET" "$1"
    return 0
  fi
  env_tmp="$DIR/.env.tmp.$$"
  if grep -q "^$1=" "$DIR/.env"; then
    awk -v k="$1" -v v="$2" 'index($0, k "=") == 1 { print k "=\"" v "\""; next } { print }' "$DIR/.env" >"$env_tmp"
  else
    cp "$DIR/.env" "$env_tmp"
    printf '%s="%s"\n' "$1" "$2" >>"$env_tmp"
  fi
  chmod 600 "$env_tmp"
  mv "$env_tmp" "$DIR/.env"
}

# ─── Releases ────────────────────────────────────────────────────────────────

valid_version() {
  printf '%s' "$1" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'
}

# The newest release, from where github.com/…/releases/latest redirects to —
# no API call, so no API rate limit.
latest_version() {
  latest_url=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest") ||
    die "Couldn't reach GitHub to find the newest release. Check the connection, or pass --version." 13
  latest=${latest_url##*/v}
  valid_version "$latest" || die "Couldn't read the newest release from $latest_url. Pass --version." 13
  printf '%s' "$latest"
}

# fetch_release VERSION TARGET_DIR — the release's files, checked against
# its SHA256SUMS. BARYNT_SOURCE (a local directory) replaces the download,
# for testing a checkout.
fetch_release() {
  fr_version=$1 fr_target=$2
  run mkdir -p "$fr_target"
  if [ -n "$SOURCE" ]; then
    for f in $RELEASE_FILES; do
      run cp "$SOURCE/$f" "$fr_target/$f"
    done
    ok "Files copied from $SOURCE"
    return 0
  fi
  base="https://github.com/$REPO/releases/download/v$fr_version"
  if [ "$DRY_RUN" = 1 ]; then
    run curl -fsSL "$base/SHA256SUMS" "($RELEASE_FILES, each checked against it)"
    return 0
  fi
  curl -fsSL "$base/SHA256SUMS" -o "$TMP/SHA256SUMS" ||
    die "Release v$fr_version not found (or it has no installer files). See https://github.com/$REPO/releases" 13
  for f in $RELEASE_FILES; do
    curl -fsSL "$base/$f" -o "$TMP/$f" || die "Download failed: $base/$f" 13
    expected=$(awk -v f="$f" '$2 == f || $2 == "*" f { print $1 }' "$TMP/SHA256SUMS")
    [ -n "$expected" ] || die "$f is missing from the release's SHA256SUMS." 14
    [ "$(sha256_of "$TMP/$f")" = "$expected" ] || die "Checksum mismatch for $f — the download is damaged or was tampered with." 14
  done
  for f in $RELEASE_FILES; do
    mv "$TMP/$f" "$fr_target/$f"
  done
  ok "Files of v$fr_version downloaded and verified (SHA-256)"
}

# The installed copy of this script becomes the `barynt` command.
install_cli() {
  run mv "$DIR/install.sh" "$DIR/barynt"
  run chmod 755 "$DIR/barynt"
  if [ -w /usr/local/bin ] || [ "$(id -u)" = 0 ]; then
    run ln -sf "$DIR/barynt" /usr/local/bin/barynt && CLI=barynt
  elif has sudo && can_ask && as_root ln -sf "$DIR/barynt" /usr/local/bin/barynt; then
    CLI=barynt
  elif has sudo && sudo -n true 2>/dev/null && run sudo -n ln -sf "$DIR/barynt" /usr/local/bin/barynt; then
    # No terminal to ask for a password on (cloud-init, CI): only with
    # passwordless sudo, never a prompt that would hang.
    CLI=barynt
  else
    CLI="$DIR/barynt"
    warn "Couldn't link /usr/local/bin/barynt — use $CLI instead."
  fi
}

# ─── Health ──────────────────────────────────────────────────────────────────

app_url() {
  app_port=$(env_get APP_PORT)
  printf 'http://127.0.0.1:%s' "${app_port:-3000}"
}

health_ok() {
  curl -fsS --max-time 5 "$(app_url)/api/health" >/dev/null 2>&1
}

wait_healthy() {
  [ "$DRY_RUN" = 1 ] && return 0
  info "Waiting for Barynt to answer (first start migrates the database) …"
  waited=0
  while ! health_ok; do
    if [ "$waited" -ge "$HEALTH_TIMEOUT" ]; then
      warn "Barynt didn't become healthy within $HEALTH_TIMEOUT s. Last log lines:"
      compose logs --tail 40 app >&2 || true
      die "Start failed. Check the logs above, then: $CLI doctor" 15
    fi
    sleep 5
    waited=$((waited + 5))
  done
  ok "Barynt is up ($(curl -fsS "$(app_url)/api/health" | sed -n 's/.*"version":"\([^"]*\)".*/v\1/p'))"
}

public_url() {
  env_get AUTH_URL
}

# ─── Commands ────────────────────────────────────────────────────────────────

cmd_install() {
  detect_platform
  [ "$OS" = macos ] && warn "macOS is supported for trying Barynt out, not for production."
  has curl || die "curl is required." 10
  ensure_docker
  resolve_dir

  if [ -f "$DIR/.env" ]; then
    installed=$(env_get BARYNT_VERSION)
    if [ -n "$VERSION" ] && [ -n "$installed" ] && [ "$VERSION" != "$installed" ]; then
      die "Barynt $installed is already installed in $DIR. Change versions with: barynt upgrade --version $VERSION" 10
    fi
    info "Barynt is already installed in $DIR — keeping its configuration and starting it."
    VERSION=${installed:-$VERSION}
  fi
  if [ -z "$VERSION" ]; then
    VERSION=$(latest_version)
  fi
  [ -n "$SOURCE" ] || valid_version "$VERSION" || die "Not a version: $VERSION (expected e.g. 1.0.13)." 10

  say ""
  say "${C_BOLD}Barynt $VERSION${C_RESET} ${C_DIM}· $OS $ARCH · $(dk --version 2>/dev/null | sed 's/,.*//') · $DIR${C_RESET}"
  say ""

  if [ ! -d "$DIR" ]; then
    if [ "$DRY_RUN" = 1 ]; then
      run mkdir -p "$DIR"
    elif mkdir -p "$DIR" 2>/dev/null; then :; else
      as_root mkdir -p "$DIR"
      as_root chown "$(id -u):$(id -g)" "$DIR"
    fi
  fi
  [ -w "$DIR" ] || [ "$DRY_RUN" = 1 ] || die "Can't write to $DIR. Pick another one with --dir." 12

  fetch_release "$VERSION" "$DIR"

  if [ ! -f "$DIR/.env" ]; then
    write_env
  fi
  install_cli

  if [ "$NO_START" = 1 ]; then
    ok "Installed, not started (--no-start). Start it with: $CLI start"
    return 0
  fi
  info "Pulling images …"
  run compose pull --quiet --ignore-pull-failures
  run compose up -d --remove-orphans
  if [ "$DRY_RUN" = 1 ]; then
    ok "Dry run finished — nothing was changed."
    return 0
  fi
  wait_healthy
  print_done
}

# First-time configuration: asks for the domain (unless given), writes every
# secret. Never runs over an existing .env — that holds the database password
# the data was created with.
write_env() {
  if [ -z "$DOMAIN" ]; then
    say "Barynt needs a domain pointing at this server for HTTPS, e.g. issues.example.com."
    say "Leave it empty to run it locally on http://localhost:3000."
    ask DOMAIN "Domain" ""
  fi
  DOMAIN=$(printf '%s' "$DOMAIN" | sed 's#^https\{0,1\}://##; s#/.*$##')
  if [ -n "$DOMAIN" ]; then
    [ -n "$FILES_DOMAIN" ] || ask FILES_DOMAIN "Domain for uploaded files" "files.$DOMAIN"
    auth_url="https://$DOMAIN"
    s3_public="https://$FILES_DOMAIN"
  else
    auth_url="http://localhost:3000"
    s3_public="http://localhost:9000"
  fi

  if [ "$DRY_RUN" = 1 ]; then
    printf '%s[dry-run]%s write %s/.env (domain %s, generated secrets)\n' "$C_DIM" "$C_RESET" "$DIR" "${DOMAIN:-localhost}"
    return 0
  fi
  umask 077
  cat >"$DIR/.env" <<EOF
# Barynt — written by the installer on $(date -u +%Y-%m-%d).
# Change settings with \`barynt config\`, then they take effect right away.
# Every other option (sign-in providers, SMTP, external database/S3, …) is
# explained in example.env next to this file.

BARYNT_VERSION="$VERSION"
DOMAIN="$DOMAIN"
FILES_DOMAIN="$FILES_DOMAIN"
AUTH_URL="$auth_url"
COMPOSE_S3_PUBLIC_ENDPOINT="$s3_public"

# Generated — keep them secret. POSTGRES_PASSWORD can't be changed here
# after the first start: the database was created with it.
AUTH_SECRET="$(random_hex)"
POSTGRES_PASSWORD="$(random_hex)"
S3_ACCESS_KEY_ID="barynt"
S3_SECRET_ACCESS_KEY="$(random_hex)"
EOF
  [ -z "$IMAGE" ] || printf 'BARYNT_IMAGE="%s"\n' "$IMAGE" >>"$DIR/.env"
  chmod 600 "$DIR/.env"
  ok "Configuration written, secrets generated (.env, readable only by you)"
}

print_done() {
  url=$(public_url)
  domain=$(env_get DOMAIN)
  say ""
  say "${C_GREEN}${C_BOLD}Barynt is running.${C_RESET}"
  say ""
  say "  Open ${C_BOLD}$url${C_RESET} and create the first account — it becomes the administrator."
  if [ -n "$domain" ]; then
    say ""
    say "  DNS: point both names at this server (A/AAAA records), then HTTPS works by itself:"
    say "    $domain"
    say "    $(env_get FILES_DOMAIN)"
    say "  Ports 80 and 443 must be reachable from the internet."
  fi
  say ""
  say "  ${C_DIM}Manage it:${C_RESET} $CLI status · $CLI upgrade · $CLI backup · $CLI logs · $CLI help"
  say ""
}

cmd_start() {
  resolve_dir && require_installation && detect_docker_or_die
  run compose up -d --remove-orphans
  wait_healthy
}

cmd_stop() {
  resolve_dir && require_installation && detect_docker_or_die
  run compose stop
  ok "Stopped"
}

cmd_restart() {
  resolve_dir && require_installation && detect_docker_or_die
  run compose restart
  wait_healthy
}

cmd_status() {
  resolve_dir && require_installation && detect_docker_or_die
  say "${C_BOLD}Barynt $(env_get BARYNT_VERSION)${C_RESET} ${C_DIM}· $DIR${C_RESET}"
  say ""
  compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
  say ""
  if health_ok; then
    ok "Healthy — $(public_url)"
  else
    warn "Not answering on $(app_url)/api/health — see: $CLI logs app"
  fi
}

cmd_logs() {
  resolve_dir && require_installation && detect_docker_or_die
  compose logs -f --tail 200 "$@"
}

cmd_upgrade() {
  detect_platform
  resolve_dir && require_installation && detect_docker_or_die
  current=$(env_get BARYNT_VERSION)
  target=${VERSION:-$(latest_version)}
  [ -n "$SOURCE" ] || valid_version "$target" || die "Not a version: $target" 10
  if [ "$current" = "$target" ] && [ "$FORCE" = 0 ]; then
    ok "Already on $current. (--force reinstalls it.)"
    return 0
  fi
  if [ -n "$current" ] && valid_version "$current" && valid_version "$target" &&
    [ "$(printf '%s\n%s\n' "$current" "$target" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)" = "$target" ] && [ "$FORCE" = 0 ]; then
    die "$target is older than $current. Database migrations can't be undone — restore a backup instead, or pass --force." 16
  fi
  info "Upgrading $current → $target"
  if [ "$NO_BACKUP" = 0 ]; then
    cmd_backup
  fi
  fetch_release "$target" "$DIR"
  run mv "$DIR/install.sh" "$DIR/barynt"
  run chmod 755 "$DIR/barynt"
  env_set BARYNT_VERSION "$target"
  info "Pulling images …"
  run compose pull --quiet --ignore-pull-failures
  run compose up -d --remove-orphans
  CLI=barynt
  wait_healthy
  ok "Upgraded to $target"
}

# Backups need the bundled services; an external database or S3 is backed
# up where it lives.
cmd_backup() {
  resolve_dir && require_installation && detect_docker_or_die
  stamp=$(date -u +%Y%m%d-%H%M%S)
  name="barynt-$(env_get BARYNT_VERSION)-$stamp"
  out_dir=${OUTPUT:-$DIR/backups}
  work="$TMP/$name"
  run mkdir -p "$out_dir" "$work"

  if [ -n "$(env_get COMPOSE_DATABASE_URL)" ]; then
    warn "External database (COMPOSE_DATABASE_URL) — back it up where it runs. Skipped."
  else
    info "Dumping the database …"
    pg_user=$(env_get POSTGRES_USER) pg_db=$(env_get POSTGRES_DB)
    run compose exec -T postgres pg_dump -U "${pg_user:-postgres}" -d "${pg_db:-IssueTracker}" -Fc >"$work/database.dump" ||
      die "Database dump failed. Is the postgres container running? ($CLI status)" 17
  fi

  if [ -n "$(env_get COMPOSE_S3_ENDPOINT)" ]; then
    warn "External S3 storage (COMPOSE_S3_ENDPOINT) — back it up where it runs. Skipped."
  else
    info "Archiving uploaded files …"
    volume=$(dk inspect "$(compose ps -q rustfs)" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true)
    if [ -n "$volume" ]; then
      run dk run --rm -v "$volume:/data:ro" -v "$work:/backup" alpine:3.20 tar czf /backup/files.tar.gz -C /data .
    else
      warn "File storage isn't running — files skipped."
    fi
  fi

  run cp "$DIR/.env" "$work/env"
  run tar czf "$out_dir/$name.tar.gz" -C "$TMP" "$name"
  run chmod 600 "$out_dir/$name.tar.gz"
  ok "Backup: $out_dir/$name.tar.gz"
  say "  ${C_DIM}It contains your secrets (.env) — store it somewhere safe.${C_RESET}"
}

cmd_restore() {
  resolve_dir && require_installation && detect_docker_or_die
  archive=${1-}
  if [ -z "$archive" ] || [ ! -f "$archive" ]; then
    die "Usage: $CLI restore <backup.tar.gz>" 10
  fi
  warn "This replaces the current database and uploaded files with the backup."
  confirm "Restore $archive now?" || die "Cancelled." 0
  run tar xzf "$archive" -C "$TMP"
  work=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -name 'barynt-*' | head -n1)
  [ -n "$work" ] || die "Not a Barynt backup: $archive" 10

  run compose stop app
  if [ -f "$work/database.dump" ]; then
    info "Restoring the database …"
    pg_user=$(env_get POSTGRES_USER) pg_db=$(env_get POSTGRES_DB)
    run compose exec -T postgres pg_restore -U "${pg_user:-postgres}" -d "${pg_db:-IssueTracker}" --clean --if-exists --no-owner <"$work/database.dump"
  fi
  if [ -f "$work/files.tar.gz" ]; then
    info "Restoring uploaded files …"
    volume=$(dk inspect "$(compose ps -q rustfs)" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')
    run compose stop rustfs
    run dk run --rm -v "$volume:/data" -v "$work:/backup:ro" alpine:3.20 sh -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null; tar xzf /backup/files.tar.gz -C /data'
  fi
  if [ -f "$work/env" ] && ! cmp -s "$work/env" "$DIR/.env"; then
    run cp "$work/env" "$DIR/.env.from-backup"
    warn "The backup's .env differs from the current one — kept the current one, saved the backup's as .env.from-backup."
  fi
  run compose up -d
  wait_healthy
  ok "Restored from $archive"
}

cmd_config() {
  resolve_dir && require_installation && detect_docker_or_die
  if [ $# -gt 0 ]; then
    for pair in "$@"; do
      case "$pair" in
        *=*) env_set "${pair%%=*}" "${pair#*=}" ;;
        *) die "Expected KEY=VALUE, got: $pair" 10 ;;
      esac
    done
  else
    can_ask || die "Without a terminal, pass settings directly: $CLI config KEY=VALUE …" 10
    say "Press Enter to keep a value."
    # Set by `ask` (through eval) — declared here so they're never unset.
    new_domain='' new_files='' smtp_host='' smtp_user='' smtp_pass='' smtp_from=''
    ask new_domain "Domain" "$(env_get DOMAIN)"
    if [ "$new_domain" != "$(env_get DOMAIN)" ]; then
      ask new_files "Domain for uploaded files" "files.$new_domain"
      env_set DOMAIN "$new_domain"
      env_set FILES_DOMAIN "$new_files"
      env_set AUTH_URL "https://$new_domain"
      env_set COMPOSE_S3_PUBLIC_ENDPOINT "https://$new_files"
    fi
    if confirm "Set up email (SMTP) for invitations, sign-in links and notifications?"; then
      ask smtp_host "SMTP host" "$(env_get SMTP_HOST)"
      smtp_port=$(env_get SMTP_PORT)
      ask smtp_port "SMTP port" "${smtp_port:-587}"
      ask smtp_user "SMTP user" "$(env_get SMTP_USER)"
      ask smtp_pass "SMTP password" ""
      ask smtp_from "Sender, e.g. Barynt <barynt@example.com>" "$(env_get SMTP_FROM)"
      env_set SMTP_HOST "$smtp_host"
      env_set SMTP_PORT "$smtp_port"
      if [ "$smtp_port" = 465 ]; then env_set SMTP_SECURE true; else env_set SMTP_SECURE false; fi
      env_set SMTP_USER "$smtp_user"
      [ -z "$smtp_pass" ] || env_set SMTP_PASS "$smtp_pass"
      env_set SMTP_FROM "$smtp_from"
    fi
  fi
  info "Applying …"
  run compose up -d
  wait_healthy
}

cmd_doctor() {
  detect_platform
  resolve_dir
  problems=0
  say "${C_BOLD}Checking $DIR${C_RESET}"
  if detect_docker; then ok "Docker: $(dk --version | sed 's/,.*//'), $(dk compose version --short)"; else
    warn "Docker isn't installed or not reachable"
    problems=$((problems + 1))
  fi
  if [ -f "$DIR/.env" ]; then ok "Installation found (v$(env_get BARYNT_VERSION))"; else
    warn "No installation in $DIR"
    problems=$((problems + 1))
  fi
  if [ "$OS" = linux ] && [ -r /proc/meminfo ]; then
    mem_mb=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
    if [ "$mem_mb" -ge 2000 ]; then ok "Memory: $mem_mb MB"; else
      warn "Memory: $mem_mb MB — 2 GB or more is recommended"
      problems=$((problems + 1))
    fi
  fi
  free_mb=$(df -Pk "$(dirname "$DIR")" 2>/dev/null | awk 'NR == 2 { print int($4 / 1024) }')
  if [ -n "$free_mb" ] && [ "$free_mb" -ge 5000 ]; then ok "Disk: $free_mb MB free"; else
    warn "Disk: ${free_mb:-?} MB free — 5 GB or more is recommended"
    problems=$((problems + 1))
  fi
  if [ -f "$DIR/.env" ]; then
    for host in $(env_get DOMAIN) $(env_get FILES_DOMAIN); do
      [ -n "$host" ] || continue
      addr=$( (getent hosts "$host" 2>/dev/null || host "$host" 2>/dev/null || nslookup "$host" 2>/dev/null) | awk '/^[0-9a-f:.]+ / { print $1; exit } /has address/ { print $4; exit } /^Address: / { a = $2 } END { if (a) print a }')
      if [ -n "$addr" ]; then ok "DNS: $host → $addr"; else
        warn "DNS: $host doesn't resolve — create an A/AAAA record pointing at this server"
        problems=$((problems + 1))
      fi
    done
    if [ -n "$DOCKER" ]; then
      if health_ok; then ok "Barynt answers on $(app_url)/api/health"; else
        warn "Barynt doesn't answer on $(app_url)/api/health — see: barynt logs app"
        problems=$((problems + 1))
      fi
    fi
  fi
  say ""
  if [ "$problems" = 0 ]; then ok "No problems found"; else warn "$problems problem(s) found"; fi
}

cmd_uninstall() {
  resolve_dir && require_installation && detect_docker_or_die
  if [ "$PURGE" = 1 ]; then
    warn "This deletes Barynt AND all its data: database, uploaded files, configuration."
    confirm "Delete everything in $DIR for good?" || die "Cancelled." 0
    run compose down --volumes --remove-orphans
    run rm -rf "$DIR"
  else
    confirm "Stop and remove the Barynt containers? Data and configuration stay in $DIR." || die "Cancelled." 0
    run compose down --remove-orphans
  fi
  if [ -L /usr/local/bin/barynt ]; then
    if [ -w /usr/local/bin ]; then run rm -f /usr/local/bin/barynt; else as_root rm -f /usr/local/bin/barynt; fi
  fi
  ok "Barynt removed$([ "$PURGE" = 1 ] || printf ' (data kept — reinstall with the installer to use it again)')"
}

detect_docker_or_die() {
  detect_docker || die "Docker isn't reachable. Is it running?" 11
}

usage() {
  cat <<EOF
Barynt installer and management CLI

Usage: barynt <command> [options]
       curl -fsSL https://github.com/$REPO/releases/latest/download/install.sh | sh -s -- [options]

Commands:
  install            Install Barynt (the default when piped)
  status             Containers, version and health
  start | stop | restart
  upgrade            Newest version (or --version), with a backup first
  backup             Database, uploaded files and .env into one archive
  restore <archive>  Replace data with a backup
  logs [service]     Follow logs (app, postgres, caddy, …)
  config [K=V …]     Change domain or SMTP (interactive without arguments)
  doctor             Check Docker, memory, disk, DNS and health
  uninstall          Remove the containers (--purge: also all data)

Options:
  --dir DIR          Installation directory (default /opt/barynt, ~/barynt on macOS)
  --version X.Y.Z    Install or upgrade to this release instead of the newest
  --domain NAME      Domain for HTTPS, e.g. issues.example.com
  --files-domain N   Domain for uploaded files (default files.<domain>)
  --yes, -y          Don't ask; take defaults
  --install-docker   Install Docker if it's missing, without asking
  --no-start         Install, but don't start
  --no-backup        upgrade: skip the backup
  --output DIR       backup: where the archive goes (default <dir>/backups)
  --purge            uninstall: also delete all data
  --force            upgrade: reinstall the same version, or go back to an older one
  --dry-run          Show what would happen, change nothing
  --help, -h         This text
EOF
}

main() {
  COMMAND='' DIR=${BARYNT_DIR-} VERSION=${BARYNT_VERSION-} DOMAIN=${BARYNT_DOMAIN-} FILES_DOMAIN=''
  SOURCE=${BARYNT_SOURCE-} IMAGE=${BARYNT_IMAGE-} OUTPUT=''
  ASSUME_YES=0 DRY_RUN=0 NO_START=0 NO_BACKUP=0 PURGE=0 FORCE=0 INSTALL_DOCKER=0
  DOCKER='' CLI=barynt OS='' ARCH=''
  ARGS=''

  while [ $# -gt 0 ]; do
    case "$1" in
      --dir) DIR=${2:?--dir needs a directory}; shift ;;
      --dir=*) DIR=${1#*=} ;;
      --version) VERSION=${2:?--version needs a version}; shift ;;
      --version=*) VERSION=${1#*=} ;;
      --domain) DOMAIN=${2:?--domain needs a name}; shift ;;
      --domain=*) DOMAIN=${1#*=} ;;
      --files-domain) FILES_DOMAIN=${2:?--files-domain needs a name}; shift ;;
      --files-domain=*) FILES_DOMAIN=${1#*=} ;;
      --output) OUTPUT=${2:?--output needs a directory}; shift ;;
      --output=*) OUTPUT=${1#*=} ;;
      -y | --yes) ASSUME_YES=1 ;;
      --install-docker) INSTALL_DOCKER=1 ;;
      --no-start) NO_START=1 ;;
      --no-backup) NO_BACKUP=1 ;;
      --purge) PURGE=1 ;;
      --force) FORCE=1 ;;
      --dry-run) DRY_RUN=1 ;;
      -h | --help | help) usage; return 0 ;;
      -*) die "Unknown option: $1 (see --help)" 10 ;;
      *)
        # Kept quoted, so `config SMTP_FROM="Barynt <a@b>"` stays one argument.
        if [ -z "$COMMAND" ]; then COMMAND=$1; else ARGS="$ARGS '$(printf '%s' "$1" | sed "s/'/'\\\\''/g")'"; fi
        ;;
    esac
    shift
  done
  VERSION=${VERSION#v}
  [ -z "$DIR" ] || DIR=$(printf '%s' "$DIR" | sed 's#/*$##')

  TMP=$(mktemp -d 2>/dev/null || mktemp -d -t barynt)
  trap 'rm -rf "$TMP"' EXIT
  trap 'exit 130' INT TERM

  eval "set -- $ARGS"
  case "${COMMAND:-install}" in
    install) cmd_install ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    logs) cmd_logs "$@" ;;
    upgrade | update) cmd_upgrade ;;
    backup) cmd_backup ;;
    restore) cmd_restore "$@" ;;
    config) cmd_config "$@" ;;
    doctor) cmd_doctor ;;
    uninstall) cmd_uninstall ;;
    version)
      resolve_dir
      if [ -f "$DIR/.env" ]; then say "Barynt $(env_get BARYNT_VERSION) in $DIR"; else say "No installation in $DIR"; fi
      ;;
    *) die "Unknown command: $COMMAND (see --help)" 10 ;;
  esac
}

# BARYNT_SOURCED=1 loads the functions without running anything — for the
# installer's own tests (tests/installer).
[ -n "${BARYNT_SOURCED-}" ] || main "$@"
