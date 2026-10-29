---
title: "Docker Compose (manuell)"
description: "Barynt kommt als eine docker-compose.yml für lokale Entwicklung und Produktion, aufgeteilt in Compose-Profile. Die Images sind fertig gebaut und multi-arch auf ghcr.io/jafoson/barynt."
sidebar:
  order: 4
---

## Voraussetzungen

- Ein Linux-Host mit Docker und dem Compose-Plugin
- Erreichbare Ports 80 und 443, wenn du automatisches HTTPS willst
- Eine Domain, deren DNS auf den Host zeigt

## Dateien herunterladen

Ein Deployment braucht genau drei Dateien. Das Repository musst du nicht klonen.

```bash
curl -O https://raw.githubusercontent.com/Jafoson/Barynt/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/Jafoson/Barynt/main/Caddyfile
curl -o .env https://raw.githubusercontent.com/Jafoson/Barynt/main/example.env
```

## .env einrichten

Erzeuge ein Secret und füge es ein in `AUTH_SECRET`. Für ein echtes Deployment setzt du außerdem:

| Variable | Zweck |
| --- | --- |
| `AUTH_SECRET` | Signiert Sitzungen. `bunx auth secret` erzeugt eins. |
| `POSTGRES_PASSWORD` | Passwort der mitgelieferten Datenbank. |
| `DOMAIN` | Caddy holt dafür ein Let's-Encrypt-Zertifikat. |
| `SMTP_HOST` | Optional. Ohne sendet Barynt keine Mails; Einladungslinks lassen sich trotzdem kopieren. |

## Stack starten

```bash
Docker Compose --profile app up -d
```

Das startet die App, den mitgelieferten RustFS-Objektspeicher und Caddy als Reverse Proxy. Bevor der Server startet, spielt die App ausstehende Migrationen ein und legt die Systemdaten an, die jeder Workspace braucht.

> [!WARNING]
> Jeder Dienst außer Caddy lauscht nur auf `127.0.0.1`. Öffentlich erreichbar sein sollten nur die Ports 80 und 443.

<!-- TODO Screenshot: erste Anmeldung mit Passkey (Anmeldeseite · 1280 × 800) -->

## Aktualisieren

Ändere den Image-Tag oder führe `docker compose pull`aus und starte neu. Migrationen laufen von selbst. Setze `MIGRATE_ON_START=false` , wenn deine Datenbank anderswo migriert wird.
