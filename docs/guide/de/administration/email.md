---
title: "E-Mail"
description: "Verbinde einen Mailserver, damit Barynt Einladungen und Benachrichtigungen verschicken kann. Ohne funktioniert in der App trotzdem alles."
sidebar:
  order: 7
---

Barynt kann E-Mails verschicken: Einladungen, Benachrichtigungen darüber, was an deinen Aufgaben passiert, und einen Hinweis, wenn jemand entfernt wird. Alles braucht eines: einen **Mailserver** (SMTP), über den Barynt senden darf. Diese Seite ist für die Person, die den Server betreibt.

## Brauchst du es?

E-Mail ist optional, ändert aber drei Dinge:

| | Ohne Mailserver | Mit Mailserver |
| --- | --- | --- |
| **Benachrichtigungen** | Nur im Posteingang in der App. | Auch per E-Mail, wenn Menschen das einschalten. |
| **Einladungen neuer Menschen** | Barynt zeigt einen Einladungs-**Link** zum Kopieren und Selbstversenden. Die neue Person **kann ihn nicht selbst annehmen**, weil das Annehmen einen Anmelde-Link per E-Mail braucht. Nimm stattdessen einen [Einladungslink](members.md). | Die neue Person bekommt die E-Mail und tritt mit einem Klick bei. |
| **Magic-Link-Anmeldung** | Nicht verfügbar. Menschen nutzen Passkeys oder den Firmen-Login. | Verfügbar, auch als Weg zurück hinein, wenn ein Passkey verloren geht. |

Ohne E-Mail geht nichts kaputt. Barynt verschickt einfach keine und sagt das überall, wo es zählt.

## Einrichten

Du brauchst die Angaben eines Mailservers: seine Adresse, den Port, einen Benutzernamen und ein Passwort sowie die Absenderadresse. Jeder normale Anbieter funktioniert: der Mailserver deiner Firma oder ein Dienst wie Postmark, Mailgun, SES, Brevo oder Gmail mit App-Passwort.

Am schnellsten geht es mit dem Befehl des Installers, der nach jedem Wert fragt:

```bash
barynt config
```

Oder setze die Werte direkt:

```bash
barynt config SMTP_HOST=smtp.example.com SMTP_PORT=587 \
  SMTP_USER=barynt@example.com SMTP_PASS=… \
  SMTP_FROM="Barynt <barynt@example.com>"
```

| Einstellung | Bedeutung |
| --- | --- |
| `SMTP_HOST` | Der Mailserver. Ihn zu setzen schaltet E-Mail ein. |
| `SMTP_PORT` | Meist `587` (STARTTLS) oder `465` (SSL). |
| `SMTP_SECURE` | `true` für Port 465, sonst `false`. `barynt config` setzt das für dich. |
| `SMTP_USER`, `SMTP_PASS` | Die Zugangsdaten. |
| `SMTP_FROM` | Der Absender, den Menschen sehen. Nimm eine Adresse, von der dein Server senden darf, sonst wird Post womöglich abgelehnt. |
| `MAIL_COMPANY_NAME`, `MAIL_COMPANY_ADDRESS` | Stehen im Fuß jeder E-Mail. Viele Anbieter erwarten in geschäftlicher Post eine echte Postadresse. Ohne sie entfällt die Zeile. |

Bei **Docker Compose** trägst du sie in die `.env` ein. Läuft dein Mailserver auf demselben Rechner wie Barynt, bedeutet `localhost` den Container selbst, nutze also `COMPOSE_SMTP_HOST`, wie in `example.env` beschrieben.

> [!TIP]
> Prüfe in Barynt selbst, ob es funktioniert: Öffne **Admin → Mail-Vorlagen**, wähle eine Vorlage, gib deine Adresse ein und klicke auf **Send test mail**. (Dieser Admin-Bereich ist bisher nur auf Englisch.)

## Was Barynt verschickt

| E-Mail | Wann |
| --- | --- |
| **Einladung** | Du lädst eine neue Person in einen Workspace oder ein Projekt ein. |
| **Benachrichtigungen** | Aufgabe zugewiesen, Erwähnung, neuer Kommentar, Antwort, Status geändert, zu einem Workspace oder Projekt hinzugefügt, Rolle geändert, Aufgabe geteilt. Jede nur, wenn die Person sie eingeschaltet hat, siehe [Meine Aufgaben, Posteingang und Benachrichtigungen](../using-barynt/my-work.md). |
| **Aus einem Workspace oder Projekt entfernt** | Du entfernst jemanden. |
| **Geteilte Aufgabe** | Jemand teilt eine Aufgabe per E-Mail. |

## Den Wortlaut ändern

Plattform-Administratoren können Betreff (_Subject_), Überschrift (_Heading_) und Einleitungstext (_Intro text_) jeder E-Mail unter **Admin → Mail-Vorlagen** anpassen. Eine Live-Vorschau mit Beispieldaten zeigt das Ergebnis. Lass ein Feld leer, um den Standard zu nutzen, oder nutze **Reset to default**. Platzhalter wie `{{workspaceName}}` oder `{{inviterName}}` werden beim Versand gefüllt. Die Liste der verfügbaren Platzhalter steht neben dem Editor.

Einige Vorlagen in der Liste sind für Funktionen vorbereitet, die noch nicht eingeschaltet sind, etwa eine Wochenzusammenfassung. Sie zu bearbeiten ist harmlos.

## Wenn keine Mail ankommt

- Prüfe, ob `SMTP_HOST`, Port und Zugangsdaten stimmen und ob die Absenderadresse auf deinem Mailserver erlaubt ist.
- Schau in die Logs: `barynt logs app`.
- Schau im Spam-Ordner nach. Post von einem neuen Server, der nicht für **SPF und DKIM** eingerichtet ist, landet dort oft.
- Probiere den oben beschriebenen Test-Knopf.
