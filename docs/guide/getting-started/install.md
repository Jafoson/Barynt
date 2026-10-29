---
title: "Install"
description: "One command installs Barynt on a Linux server: it checks Docker, asks for your domain, generates every secret and starts the stack with HTTPS."
sidebar:
  order: 2
  badge: New
---

## Requirements

- Linux on amd64 or arm64 (macOS works for trying it out)
- Docker with the Compose plugin. The installer offers to install it if it's missing.
- For HTTPS: a domain, plus a second one for uploaded files (`files.` by default), both pointing at the server, and ports 80 and 443 open

## Install

```bash
curl -fsSL https://github.com/Jafoson/Barynt/releases/latest/download/install.sh | sh
```

The installer asks for your domain and the one for uploaded files. Leave the domain empty to run Barynt locally on `http://localhost:3000`.

<!-- TODO Screenshot: installer in the terminal (the questions and the “Barynt is running.” summary · 1280 × 720) -->

> [!NOTE]
> Prefer to read it first? `curl -fsSLO …/install.sh && less install.sh && sh install.sh`. If the download breaks off halfway, nothing runs: the script only acts in its last line.

## Without questions

For cloud-init or a provisioning script, pass the answers as options:

```bash
curl -fsSL https://github.com/Jafoson/Barynt/releases/latest/download/install.sh \
  | sh -s -- --domain issues.example.com --yes
```

| Option | What it does |
| --- | --- |
| `--domain NAME` | Domain for HTTPS, e.g. issues.example.com |
| `--files-domain NAME` | Domain for uploaded files, `files.<domain>` by default |
| `--version X.Y.Z` | Install this release instead of the newest |
| `--dir DIR` | Installation directory, `/opt/barynt` by default |
| `--install-docker` | Install Docker if it's missing, without asking |
| `--yes` | Don't ask, take the defaults |
| `--dry-run` | Show what would happen, change nothing |

## What it sets up

In `/opt/barynt`: `docker-compose.yml`, `Caddyfile`, an `example.env` for reference and your `.env` (readable only by you) with a generated `AUTH_SECRET`, database password and storage key. The installer also puts itself on your path as `barynt`.

> [!WARNING]
> The database password in `.env` can't be changed after the first start: the database was created with it. Keep the file safe, `barynt backup` includes it.

## First sign-in

Open your domain and create the first account. It becomes the administrator. Then [the barynt command](manage.md) takes care of everything else.
