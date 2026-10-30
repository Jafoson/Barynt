---
title: "Docker Compose (manual)"
description: "Barynt ships as one docker-compose.yml for local development and production, split by Compose profiles. The images are prebuilt and multi-arch on ghcr.io/barynt-dev/barynt."
sidebar:
  order: 6
---

## Requirements

- A Linux host with Docker and the Compose plugin
- Ports 80 and 443 reachable, if you want automatic HTTPS
- A domain whose DNS points at the host

## Download the files

A deployment needs exactly three files. You don't have to clone the repository.

```bash
curl -O https://raw.githubusercontent.com/barynt-dev/barynt-web/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/barynt-dev/barynt-web/main/Caddyfile
curl -o .env https://raw.githubusercontent.com/barynt-dev/barynt-web/main/example.env
```

## Configure .env

Generate a secret and paste it into `AUTH_SECRET`. For a real deployment also set these:

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Signs sessions. `bunx auth secret` creates one. |
| `POSTGRES_PASSWORD` | Password for the bundled database. |
| `DOMAIN` | Caddy requests a Let's Encrypt certificate for it. |
| `SMTP_HOST` | Optional. Without it Barynt sends no mail; invite links can still be copied. |

## Start the stack

```bash
docker compose --profile app up -d
```

This starts the app, bundled RustFS object storage and Caddy as a reverse proxy. Before the server starts, the app applies pending migrations and bootstraps the system data every workspace needs.

> [!WARNING]
> Every service except Caddy binds to `127.0.0.1`. Only expose ports 80 and 443 publicly.

<!-- TODO Screenshot: first sign-in with a passkey (login screen · 1280 × 800) -->

## Updating

Change the image tag, or run `docker compose pull`, and restart. Migrations run on their own. Set `MIGRATE_ON_START=false` if your database is migrated elsewhere.
