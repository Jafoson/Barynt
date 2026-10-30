---

title: "Der barynt-Befehl"
description: "Der Installer legt sich als barynt auf deinen Server. Er erledigt Upgrades, Backups und Prüfungen."
sidebar:
order: 5
badge: Neu
---

## Befehle

| Befehl                            | Was sie macht                                                  |
| --------------------------------- | -------------------------------------------------------------- |
| `barynt status`                   | Container, Version und Zustand                                 |
| `barynt upgrade`                  | Die neueste Version (oder `--version`), vorher mit Backup      |
| `barynt backup`                   | Datenbank, hochgeladene Dateien und `.env` in einem Archiv     |
| `barynt restore <archive>`        | Die Daten durch ein Backup ersetzen                            |
| `barynt logs [service]`           | Den Logs von app, postgres, caddy … folgen                     |
| `barynt config [K=V …]`           | Domain oder SMTP ändern; ohne Argumente interaktiv             |
| `barynt doctor`                   | Prüft Docker, Speicher, Platte, DNS und Zustand                |
| `barynt start \| stop \| restart` | Was draufsteht                                                 |
| `barynt uninstall`                | Entfernt die Container; `--purge` löscht zusätzlich alle Daten |

## Upgrades

```bash
barynt upgrade                   # Backup, dann neueste Version
barynt upgrade --version {{version}}  # eine bestimmte
```

Die App spielt Datenbank-Migrationen beim Start selbst ein. Mit `--no-backup` überspringst du das Backup, mit `--force` installierst du dieselbe Version neu oder gehst auf eine ältere zurück.

## Backups

```bash
barynt backup --output /mnt/backups
barynt restore /mnt/backups/barynt-{{version}}-20261028-0300.tar.gz
```

<!-- TODO Screenshot: barynt status und barynt doctor (Terminal-Ausgabe · 1280 × 720) -->
