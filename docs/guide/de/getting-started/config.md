---

title: "Konfiguration"
description: "Alles, was du an deinem Server einstellen kannst, an einem Ort: wo die Einstellungen liegen, wie du sie änderst und was die wichtigen bewirken."
sidebar:
order: 8
---

Diese Seite ist für die Person, die den Server betreibt. Alles, was Barynt über seine Umgebung wissen muss, wird aus **Umgebungsvariablen** gelesen, und nichts davon steckt versteckt in Konfigurationsdateien.

## Wo die Einstellungen liegen

- Mit dem Installer stehen sie in **`/opt/barynt/.env`**. Die Datei ist nur für dich lesbar.
- Mit Docker Compose von Hand ist es die `.env` neben deiner `docker-compose.yml`.
- Auf Kubernetes sind es die `values.yaml` des Charts.

Du musst die Datei nicht von Hand bearbeiten. `barynt config` ändert Werte und startet neu, was neu starten muss:

```bash
barynt config                                  # fragt nach Domain und E-Mail
barynt config SMTP_HOST=smtp.example.com UPDATE_CHECK=false
```

> [!NOTE]
> Die Datei `example.env` im Repository listet jede Einstellung mit einem Kommentar auf. Diese Seite ist der geführte Rundgang, jene Datei die vollständige Referenz.

## Die wichtigen

| Einstellung         | Was sie bewirkt                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SECRET`       | Signiert Sitzungen. Wird vom Installer erzeugt. Halte sie geheim und ändere sie nicht leichtfertig: Wenn sie sich ändert, sind alle abgemeldet.  |
| `AUTH_URL`          | Die öffentliche Adresse von Barynt, zum Beispiel `https://issues.example.com`. Einladungslinks und Anmelde-Rückrufe werden daraus gebaut.        |
| `DOMAIN`            | Die Domain, für die der mitgelieferte Webserver (Caddy) ein Zertifikat bekommt.                                                                  |
| `POSTGRES_PASSWORD` | Das Passwort der mitgelieferten Datenbank. Es wird beim ersten Start gesetzt und lässt sich danach nicht mehr ändern.                            |
| `UPDATE_CHECK`      | `false` hält Barynt davon ab, bei GitHub nachzufragen, ob es eine neuere Version gibt. Es ist der einzige Aufruf, den Barynt von sich aus macht. |

## Anmeldung

Standardmäßig melden sich Menschen mit **Passkeys** an. Alles andere kommt obendrauf:

| Einstellung                                                                            | Was sie bewirkt                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_<ANBIETER>_ID`, `AUTH_<ANBIETER>_SECRET`                                         | Schaltet einen Firmen-Login frei (GitHub, Google, GitLab, Microsoft, Discord, Keycloak, Okta und viele mehr). Siehe [Anmeldung und SSO](../administration/sso.md). |
| `AUTH_OIDC_ISSUER`, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`, `AUTH_OIDC_NAME` | Ein generisches Single Sign-on mit eigener Beschriftung der Schaltfläche.                                                                                          |
| `AUTH_REGISTRATION_ENABLED=false`                                                      | **Nur auf Einladung.** Niemand kann sich selbst ein neues Konto anlegen. Menschen mit offener Einladung kommen weiterhin hinein.                                   |
| `AUTH_PASSKEY_LOGIN_ENABLED=false`                                                     | Schaltet Passkeys komplett ab. Stelle vorher sicher, dass eine andere Anmeldung funktioniert.                                                                      |
| `AUTH_PASSKEY_REGISTRATION_ENABLED=false`                                              | Neue Konten lassen sich nicht mit einem Passkey anlegen. Bestehende behalten ihren.                                                                                |

## E-Mail

Ohne `SMTP_HOST` verschickt Barynt gar keine E-Mails. Alles funktioniert trotzdem: Einladungslinks lassen sich kopieren, und Benachrichtigungen erscheinen im Posteingang. Siehe [E-Mail](../administration/email.md).

| Einstellung                                                       | Was sie bewirkt                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Dein Mailserver.                                          |
| `SMTP_FROM`                                                       | Der Absender, zum Beispiel `Barynt <barynt@example.com>`. |
| `MAIL_COMPANY_NAME`, `MAIL_COMPANY_ADDRESS`                       | Stehen im Fuß jeder E-Mail.                               |

## Dateien

Avatare und Anhänge brauchen S3-kompatiblen Speicher. Der Installer bringt einen mit (RustFS). Siehe [Objektspeicher](../administration/storage.md).

| Einstellung                                | Was sie bewirkt                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `S3_ENDPOINT`                              | Wo der Speicher liegt. Leer heißt: Uploads sind abgeschaltet.                           |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Seine Zugangsdaten.                                                                     |
| `S3_BUCKET_AVATARS`, `S3_BUCKET_ISSUES`    | Die beiden Buckets. Avatare und Anhänge lassen sich unabhängig voneinander einschalten. |
| `S3_REGION`                                | Die Region, `us-east-1`, sofern dein Anbieter nichts anderes sagt.                      |

## Datenbanken und Updates

| Einstellung              | Was sie bewirkt                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | Die PostgreSQL-Verbindung. Mit dem Installer ist sie für dich eingerichtet.                                     |
| `REDIS_URL`              | Redis, zählt API-Anfragen pro Schlüssel. Optional.                                                              |
| `MIGRATE_ON_START=false` | Das Datenbankschema beim Start nicht aktualisieren. Nur für Umgebungen, in denen das ein eigener Job übernimmt. |

## Nach einer Änderung

Einstellungen werden beim Start gelesen. `barynt config` erledigt das für dich. Sonst führe `barynt restart` aus oder `docker compose --profile app up -d`.
