---
title: "The barynt command"
description: "The installer puts itself on your server as barynt. It runs your upgrades, backups and checks."
sidebar:
  order: 3
  badge: New
---

## Commands

| Command | What it does |
| --- | --- |
| `barynt status` | Containers, version and health |
| `barynt upgrade` | The newest version (or `--version`), with a backup first |
| `barynt backup` | Database, uploaded files and `.env` in one archive |
| `barynt restore <archive>` | Replace the data with a backup |
| `barynt logs [service]` | Follow the logs of app, postgres, caddy … |
| `barynt config [K=V …]` | Change the domain or SMTP; interactive without arguments |
| `barynt doctor` | Checks Docker, memory, disk, DNS and health |
| `barynt start \| stop \| restart` | What it says |
| `barynt uninstall` | Removes the containers; `--purge` also deletes all data |

## Upgrading

```bash
barynt upgrade                   # backup, then the newest release
barynt upgrade --version {{version}}  # a specific one
```

The app applies database migrations itself when it starts. Use `--no-backup` to skip the backup and `--force` to reinstall the same version or go back to an older one.

## Backups

```bash
barynt backup --output /mnt/backups
barynt restore /mnt/backups/barynt-{{version}}-20261028-0300.tar.gz
```

<!-- TODO Screenshot: barynt status and barynt doctor (terminal output · 1280 × 720) -->
