---
title: "Installation"
description: "Ein Befehl installiert Barynt auf einem Linux-Server: Er prüft Docker, fragt nach deiner Domain, erzeugt alle Secrets und startet den Stack mit HTTPS."
sidebar:
  order: 4
  badge: Neu
---

## Voraussetzungen

- Linux auf amd64 oder arm64 (macOS reicht zum Ausprobieren)
- Docker mit dem Compose-Plugin. Fehlt es, bietet der Installer an, es zu installieren.
- Für HTTPS: eine Domain und eine zweite für hochgeladene Dateien (`files.` als Standard), beide zeigen auf den Server, und offene Ports 80 und 443

## Installation

```bash
curl -fsSL https://github.com/Jafoson/Barynt/releases/latest/download/install.sh | sh
```

Der Installer fragt nach deiner Domain und der für hochgeladene Dateien. Lässt du die Domain leer, läuft Barynt lokal auf `http://localhost:3000`.

<!-- TODO Screenshot: Installer im Terminal (die Fragen und die Zusammenfassung „Barynt is running.“ · 1280 × 720) -->

> [!NOTE]
> Lieber erst lesen? `curl -fsSLO …/install.sh && less install.sh && sh install.sh`. Bricht der Download mittendrin ab, passiert nichts: Das Skript handelt erst in seiner letzten Zeile.

## Ohne Rückfragen

Für cloud-init oder ein Provisioning-Skript gibst du die Antworten als Optionen mit:

```bash
curl -fsSL https://github.com/Jafoson/Barynt/releases/latest/download/install.sh \
  | sh -s -- --domain issues.example.com --yes
```

| Option | Was sie macht |
| --- | --- |
| `--domain NAME` | Domain für HTTPS, z. B. issues.example.com |
| `--files-domain NAME` | Domain für hochgeladene Dateien, `files.<domain>` als Standard |
| `--version X.Y.Z` | Diese Version statt der neuesten installieren |
| `--dir DIR` | Installationsverzeichnis, `/opt/barynt` als Standard |
| `--install-docker` | Docker ohne Nachfrage installieren, falls es fehlt |
| `--yes` | Nicht fragen, Standardwerte nehmen |
| `--dry-run` | Zeigen, was passieren würde, nichts ändern |

## Was er einrichtet

In `/opt/barynt`: `docker-compose.yml`, `Caddyfile`, eine `example.env` zum Nachschlagen und deine `.env` (nur für dich lesbar) mit erzeugtem `AUTH_SECRET`, Datenbankpasswort und Speicherschlüssel. Danach steht der Installer auch als Befehl bereit: `barynt`.

> [!WARNING]
> Das Datenbankpasswort in `.env` lässt sich nach dem ersten Start nicht mehr ändern: Die Datenbank wurde damit angelegt. Bewahre die Datei sicher auf, `barynt backup` sichert sie mit.

## Erste Anmeldung

Öffne deine Domain und lege das erste Konto an. Es wird Administrator. Danach übernimmt [der barynt-Befehl](manage.md) alles Weitere.
