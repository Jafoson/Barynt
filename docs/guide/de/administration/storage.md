---

title: "Objektspeicher"
description: "Wo Avatare und Anhänge liegen: mit dem Installer mitgeliefert oder in jedem S3-kompatiblen Speicher, den du schon hast."
sidebar:
order: 8
---

Bilder und Anhänge liegen nicht in der Datenbank. Sie kommen in einen **Objektspeicher**, eine Art Dateiserver mit S3-Schnittstelle. Diese Seite ist für die Person, die den Server betreibt.

## Wofür er gebraucht wird

| Nutzung                                                  | Grenze                         |
| -------------------------------------------------------- | ------------------------------ |
| **Avatare** von Menschen, Workspaces und Projekten       | 5 MB, PNG, JPEG, WebP oder GIF |
| **Anhänge** sowie Bilder, Videos und Dateien in Aufgaben | 100 MB pro Datei, jeder Typ    |

## Was du ohne ihn bekommst

Speicher ist optional. Ohne ihn arbeitet Barynt weiter: Avatare werden durch Initialen auf einer Farbe ersetzt, und der Anhangsbereich an Aufgaben ist abgeschaltet. Die beiden Nutzungen sind unabhängig voneinander. Du kannst Avatare ohne Anhänge haben oder umgekehrt, indem du nur einen Bucket einrichtest.

## Mit dem Installer

Du musst nichts tun. Der Installer startet neben Barynt **RustFS**, einen kleinen S3-kompatiblen Speicher, und verdrahtet ihn. Er fragt außerdem nach einer zweiten Domain, standardmäßig `files.<deine-domain>`, die auf denselben Server zeigt. Browser laden darüber direkt hoch und herunter, sie muss also genauso aus dem Internet erreichbar sein wie die Hauptdomain.

Alles ist enthalten, wenn du `barynt backup` ausführst, siehe [Der barynt-Befehl](../getting-started/manage.md).

## Mit eigenem Speicher

Jeder S3-kompatible Speicher funktioniert: AWS S3, MinIO, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces und andere. Lege **zwei private Buckets** an (zum Beispiel `avatars` und `issues`) und einen Schlüssel mit Lese- und Schreibzugriff, und sag es dann Barynt:

```bash
barynt config S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com \
  S3_REGION=eu-central-1 \
  S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… \
  S3_BUCKET_AVATARS=acme-barynt-avatars S3_BUCKET_ISSUES=acme-barynt-issues
```

| Einstellung                                | Bedeutung                                                          |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `S3_ENDPOINT`                              | Wo der Speicher liegt. Leer lassen schaltet beide Nutzungen ab.    |
| `S3_REGION`                                | Die Region. `us-east-1` passt bei den meisten Anbietern außer AWS. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Der Schlüssel.                                                     |
| `S3_BUCKET_AVATARS`, `S3_BUCKET_ISSUES`    | Die beiden Buckets.                                                |

Ein paar Hinweise:

- **Buckets müssen privat sein.** Barynt vergibt kurzlebige signierte Links zum Ansehen und Hochladen, sodass niemand eine Datei öffnen kann, ohne ihre Aufgabe sehen zu dürfen.
- Adressen sind immer im Pfadstil (`Endpunkt/Bucket/Schlüssel`), den alle genannten Anbieter unterstützen.
- Bei **Docker Compose** und dem **Helm-Chart** haben die Einstellungen eigene Namen für „die Adresse, die die App nutzt“ und „die Adresse, die der Browser nutzt“. Siehe `example.env` und die Werte des Charts.

## Backups

Dateien im Speicher liegen **nicht** in der Datenbank. Ein vollständiges Backup braucht beides. Mit dem mitgelieferten RustFS übernimmt `barynt backup` das. Mit eigenem Speicher sicherst du die Buckets mit den Werkzeugen deines Anbieters und die Datenbank mit `barynt backup` oder `pg_dump`.

## Wenn Uploads scheitern

- Ist die Upload-Adresse aus dem Browser der Nutzerin erreichbar? Prüfe beim Installer, ob das DNS für `files.<deine-domain>` auf den Server zeigt.
- Existieren die Buckets, und darf der Schlüssel sie lesen und beschreiben?
- Ist die Datei unter 100 MB (5 MB bei Bildern)?
- `barynt doctor` und `barynt logs app` zeigen, was serverseitig falsch ist.
