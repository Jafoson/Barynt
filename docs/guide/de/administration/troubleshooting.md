---

title: "Fehlerbehebung"
description: "Häufige Fragen und was du dagegen tun kannst: Anmeldung, Zugriff, E-Mail, Dateien und der Server selbst."
sidebar:
order: 11
---

Die meisten Probleme haben eine kurze Antwort. Finde deines danach, was du siehst.

## Anmelden

### „No sign-in method is configured for this server.“

Passkeys sind abgeschaltet, und es gibt weder Firmen-Login noch E-Mail. Schalte mindestens einen Weg ein, siehe [Anmeldung und SSO](sso.md). Hast du Passkeys mit `AUTH_PASSKEY_LOGIN_ENABLED=false` abgeschaltet, entferne diese Einstellung.

### Die Passkey-Schaltfläche fehlt, oder „Passkey sign-in was cancelled or failed.“

- Passkeys brauchen eine **sichere Adresse**: `https://…` oder `localhost`. Schlichtes `http://` über eine IP-Adresse funktioniert nicht.
- Ein Passkey gehört zu einer **Domain**. Hat sich die Adresse von Barynt geändert, registriere einen neuen Passkey.
- Hat die Person die Abfrage am Gerät abgebrochen, versuche es erneut.

### „Access denied. Ask an administrator for an invitation.“

Entweder ist der Server **nur auf Einladung** (`AUTH_REGISTRATION_ENABLED=false`) und diese Adresse hat keine Einladung, oder das Konto wurde **deaktiviert**. Frag die Plattform-Administration, siehe [Plattform-Verwaltung](platform.md).

### Ein neuer Kollege kann seine Einladung nicht annehmen

Einladungen für neue Menschen werden über einen Anmelde-Link angenommen, der per E-Mail kommt. Hat der Server keine Mail-Einrichtung, kann das nicht funktionieren. Richte entweder [E-Mail](email.md) ein oder schicke stattdessen einen **Einladungslink** (_Workspace Einstellungen → Einladungen_), der mit einem Passkey oder einem Firmen-Login funktioniert.

### „Another account already exists with the same email address“

Typischerweise nach einem Wechsel des Identitätsanbieters. Siehe „Den Identitätsanbieter wechseln“ unter [Anmeldung und SSO](sso.md).

### Der Anmelde-Link kommt nicht an

Prüfe, ob [E-Mail](email.md) eingerichtet ist, schau im Spam-Ordner nach und probiere die Test-Mail unter **Admin → Mail-Vorlagen**.

## Zugriff und Berechtigungen

### „Ich sehe ein Projekt nicht, das meine Kollegin sieht.“

Das Projekt ist vermutlich **privat**, und du wurdest nicht hinzugefügt. Bitte eine Project-Admin, dich unter _Mitglieder_ des Projekts hinzuzufügen. Siehe [Projekte](../using-barynt/projects.md).

### „Diese Seite existiert nicht“, aber sie sollte

Barynt zeigt für „existiert nicht“ und „du darfst es nicht sehen“ absichtlich dieselbe Seite, damit niemand erfahren kann, dass etwas existiert. Prüfe bei einer Workspace-Admin, ob du Zugriff hast.

### Ich kann eine Aufgabe nicht bearbeiten oder löschen

Ein **Contributor** kann nur Aufgaben bearbeiten und löschen, die er erstellt hat oder die ihm zugewiesen sind. Für mehr kann eine Project-Admin deine Rolle ändern oder eine Rolle dafür anlegen, siehe [Rollen und Berechtigungen](roles.md).

### Das Dashboard zeigt nur meine eigenen Zahlen

Die Zahlen des ganzen Projekts zu sehen braucht eine Berechtigung, die Contributors standardmäßig nicht haben. Am Schalter **Meine / Alle** siehst du, was du hast, und bei Bedarf frag eine Project-Admin. Siehe [Dashboards](../using-barynt/dashboards.md).

### Ich kann keine Menschen einladen, kein Projekt anlegen und keine Einstellungen öffnen

Deine Rolle enthält es nicht. Die Tabellen unter [Rollen und Berechtigungen](roles.md) zeigen, wer es kann.

## E-Mail und Benachrichtigungen

### Es kommen keine E-Mails an

- Ist `SMTP_HOST` gesetzt? Ohne es verschickt Barynt keine E-Mails.
- Hat die Person E-Mail für dieses Ereignis eingeschaltet? Kommentare und Statusänderungen sind standardmäßig **aus**, siehe [Meine Aufgaben, Posteingang und Benachrichtigungen](../using-barynt/my-work.md).
- Niemand wird über die eigenen Aktionen benachrichtigt.
- Schau im Spam-Ordner nach und in `barynt logs app`.

## Dateien

### Anhänge oder Bilder lassen sich nicht hochladen

- Ist [Objektspeicher](storage.md) eingerichtet? Ohne ihn sind Anhänge abgeschaltet und Avatare zeigen Initialen.
- Ist die Upload-Domain (`files.<deine-domain>`) aus dem Browser erreichbar?
- Ist die Datei klein genug: 100 MB für Anhänge, 5 MB für Bilder?

## Der Server

### Ich erreiche Barynt nach der Installation nicht

Führe `barynt doctor` aus. Es prüft Docker, Speicher, Plattenplatz, ob deine Domain auf den Server zeigt, und den Zustand der App. Stelle sicher, dass die Ports 80 und 443 offen sind.

### Woran sehe ich, dass alles gesund ist?

Öffne `/api/health` auf deiner Domain. Es antwortet `{"status":"ok","version":"…"}`, wenn App und Datenbank in Ordnung sind. `/api/health/live` sagt nur, dass der App-Prozess läuft, was ein Container-Healthcheck braucht. Zu `barynt status` siehe [Der barynt-Befehl](../getting-started/manage.md).

### Nach einem Update sieht etwas falsch aus

Barynt aktualisiert das Datenbankschema beim Start selbst. Schau in `barynt logs app`, was es getan hat. Musst du zurück, holt `barynt restore` das Backup zurück, das `barynt upgrade` zuerst gemacht hat.

### Ich habe vergessen, ein Backup zu machen

`barynt backup` macht jetzt eines. Tu es vor jedem Upgrade und lege eine Kopie woanders ab als auf dem Server.

## Integrationen

### Die API antwortet mit 401, 403, 404 oder 429

- **401:** Schlüssel fehlt, ist falsch, widerrufen oder abgelaufen.
- **403:** Dem Schlüssel fehlt der Scope, den dieser Aufruf braucht.
- **404:** Die Sache existiert nicht, oder du darfst sie nicht sehen.
- **429:** Zu viele Anfragen: 120 pro Minute und Schlüssel. Warte die Sekunden aus dem Header `Retry-After`.

Mehr unter [REST-API](../integrations/api.md).

### Ein KI-Assistent kann sich nicht über MCP verbinden

Connector-basierte Assistenten wie Claude.ai rufen deinen Server **aus der Cloud des Anbieters** auf, Barynt muss also aus dem Internet über HTTPS erreichbar sein. Eine Adresse in deinem privaten Netz genügt nicht. Siehe [MCP-Server](../integrations/mcp.md).

### Ein Webhook kommt nicht an

Prüfe, ob die empfangende Adresse vom Server aus erreichbar ist und ob der Webhook das Ereignis abonniert hat, und schau auf den Status, den Barynt für die letzte Zustellung unter _Workspace Einstellungen → Webhooks_ zeigt. Barynt versucht es **einmal**. Es gibt keinen automatischen Wiederholungsversuch. Siehe [Webhooks](../integrations/webhooks.md).
