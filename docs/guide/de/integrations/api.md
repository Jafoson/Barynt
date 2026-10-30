---

title: "REST-API: Anmeldung und Grundlagen"
description: "Verbinde Skripte, Berichte und andere Werkzeuge mit Barynt: API-Schlüssel und Scopes, wie Anfragen und Antworten aussehen, Fehler, Limits, Seiten, dazu Schnellstart und Rezepte."
sidebar:
order: 2
---

Die **REST-API** lässt andere Software lesen und ändern, was in Barynt steckt: eine Aufgabe anlegen, wenn ein Kunde ein Formular abschickt, Zahlen in einen Bericht ziehen, eine Tabelle synchron halten. Es sind dieselben Daten und dieselben Regeln wie in der App.

Diese Seite erklärt, wie es im Großen und Ganzen funktioniert: Schlüssel, Scopes, wie Anfragen und Antworten aussehen, Fehler, Limits und Seiten. Jeden einzelnen Aufruf mit allen Feldern und Beispielen findest du in der **[API-Referenz](../api-reference/workspaces.md)**. Bist du kein Entwickler, lies die ersten beiden Abschnitte und gib den Rest an jemanden weiter, der es ist.

![API-Schlüssel in deinen persönlichen Einstellungen](../../assets/de/api-keys.webp)

## Wofür sie gut ist

- **Issues automatisch anlegen**, aus einem Support-Formular, einem Monitoring-Alarm oder einem Chat-Befehl.
- **Berichte und Dashboards** außerhalb von Barynt: offene Issues exportieren, geschlossene pro Woche zählen.
- **Abgleich** mit anderen Systemen: CRM, Tabellen, ein Firmenportal.
- **Skripte und CI:** ein Issue kommentieren, wenn ein Deployment fertig ist.

Für KI-Assistenten nimmst du stattdessen [MCP](mcp.md): Dort brauchst du keinen Schlüssel. Um Bescheid zu bekommen, wenn etwas passiert, gibt es [Webhooks](webhooks.md).

## API-Schlüssel

Ein **API-Schlüssel** ist ein persönliches Zugriffstoken. Er handelt als **du**, kann also nie mehr, als du kannst, und du kannst ihn mit **Scopes** weiter einschränken.

1. Öffne deine persönlichen Einstellungen → **API-Schlüssel** und klicke auf **Neuer Schlüssel**.
2. Gib ihm einen **Namen**, der sagt, wofür er da ist („Support-Formular“), wähle ein **Ablaufdatum** (nie oder eine Anzahl Tage) und hake die nötigen **Scopes** an.
3. Klicke auf **Schlüssel erstellen**. Barynt zeigt den Schlüssel **ein einziges Mal**. Kopiere ihn jetzt, denn er lässt sich nicht erneut anzeigen.
4. Gib ihn über einen sicheren Weg an die weiter, die ihn brauchen, nie in einem Chat oder einer E-Mail.

![Der neue Schlüssel wird nur einmal gezeigt](../../assets/de/api-key-created.webp)

Ein Schlüssel beginnt mit `bry_`. Barynt speichert nur einen Fingerabdruck davon, sodass ihn auch ein Administrator nicht wieder auslesen kann. Die Liste zeigt für jeden Schlüssel sein Präfix, wann er erstellt und wann er **zuletzt benutzt** wurde (höchstens alle fünf Minuten aktualisiert) und ob er aktiv ist. **Widerrufe** einen Schlüssel jederzeit: Jedes Werkzeug, das ihn nutzt, verliert sofort den Zugriff, und das lässt sich nicht rückgängig machen. Ein Schlüssel hört auch auf zu funktionieren, wenn er abläuft oder das Konto seines Besitzers deaktiviert wird.

> [!WARNING]
> Behandle einen Schlüssel wie ein Passwort. Lege **einen Schlüssel pro Werkzeug** an, gib ihm die **wenigsten Scopes**, mit denen es funktioniert, und setze ein **Ablaufdatum**, wo du kannst. Ist ein Schlüssel durchgesickert, widerrufe ihn.

> [!NOTE]
> **Ein Schlüssel ist eine Person.** Seine Aktionen erscheinen als diese Person in der Aktivität der Issues. Lege für eine Integration ein eigenes Konto an (zum Beispiel „Support-Bot“), nimm es mit einer passenden Rolle in den Workspace auf und erstelle den Schlüssel dort.

### Scopes

Ein Scope ist ein Paar aus „was“ und „lesen oder schreiben“. Ein Aufruf braucht den richtigen Scope **und** die Berechtigung, die sein Besitzer in der App hat: Ein Scope gibt nie mehr, als du hast, er schränkt nur ein, was der Schlüssel darf.

| Scope                                  | Erlaubt                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `issues:read` / `issues:write`         | Issues, Beziehungen und Anhänge lesen. Issues anlegen, ändern und verschieben, Beziehungen und Anhänge hinzufügen oder entfernen. |
| `comments:read` / `comments:write`     | Kommentare lesen und schreiben.                                                                                                   |
| `labels:read` / `labels:write`         | Labels lesen, anlegen, ändern und löschen.                                                                                        |
| `projects:read` / `projects:write`     | Projekte lesen. Sie anlegen, ändern und löschen.                                                                                  |
| `workspaces:read` / `workspaces:write` | Die Workspaces, Status, Prioritäten und Typen lesen. Workspaces anlegen, ändern und löschen.                                      |
| `members:read`                         | Die Mitglieder von Workspaces und Projekten lesen. Es gibt keinen Schreib-Scope: Personen hinzuzufügen geht in der App.           |
| `views:read` / `views:write`           | Gespeicherte Views lesen und verwalten. Für die Issues einer View braucht es zusätzlich `issues:read`.                            |

Bei jedem Aufruf in der Referenz steht, welchen Scope er braucht. Ein paar typische Zusammenstellungen:

| Für                                | Scopes                                                          |
| ---------------------------------- | --------------------------------------------------------------- |
| Ein Formular, das Issues anlegt    | `issues:write` (und `projects:read`, um das Projekt zu finden)  |
| Ein reiner Lese-Bericht            | `issues:read`, `projects:read`, `workspaces:read`               |
| Ein Deploy-Skript, das kommentiert | `comments:write`                                                |
| Ein vollständiger Abgleich         | alle Lese-Scopes plus die Schreib-Scopes dessen, was du änderst |

## Schnellstart

Du brauchst nur die Adresse deines Servers und einen Schlüssel. Setze beides einmal:

```bash
export BARYNT_URL="https://issues.example.com"
export BARYNT_API_KEY="bry_…"
```

**1. Wo kann ich arbeiten?** Liste deine Workspaces. Die ID eines Workspace ist sein Kurzname in der Adresse (`acme` in `/acme/…`):

```bash
curl "$BARYNT_URL/api/v1/workspaces" -H "Authorization: Bearer $BARYNT_API_KEY"
```

```json
{
  "data": [
    { "id": "acme", "name": "Acme Inc", "color": "#6e63e6", "avatarUrl": null }
  ]
}
```

**2. Das Projekt finden:**

```bash
curl "$BARYNT_URL/api/v1/workspaces/acme/projects" -H "Authorization: Bearer $BARYNT_API_KEY"
```

Nimm die `id` des gewünschten Projekts, zum Beispiel `proj_9f8e7d`.

**3. Ein Issue anlegen:**

```bash
curl -X POST "$BARYNT_URL/api/v1/projects/proj_9f8e7d/issues" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Checkout kaputt", "priority": 2, "type": "bug" }'
```

Die Antwort ist das neue Issue mit Status `201 Created`. Du bist sein Melder, und es ist als „über die API angelegt“ markiert.

**4. Kommentieren** (nimm die `id` des Issues oder seine Kennung wie `WEB-42`):

```bash
curl -X POST "$BARYNT_URL/api/v1/issues/WEB-42/comments" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "body": "In Safari 17 nachgestellt." }'
```

Das ist schon die ganze Idee; alles andere funktioniert genauso. Dasselbe in JavaScript:

```js
const res = await fetch(
  `${process.env.BARYNT_URL}/api/v1/projects/proj_9f8e7d/issues`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.BARYNT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Checkout kaputt", priority: 2 }),
  },
);
if (!res.ok) throw new Error(`Barynt antwortete ${res.status}`);
const { data: issue } = await res.json();
console.log(issue.ref); // "WEB-42"
```

## Wie Anfragen und Antworten aussehen

- **Adresse:** dein Server, dann `/api/v1/…`. Alles ist JSON über HTTPS. Sende bei einem Body `Content-Type: application/json` mit.
- **Anmeldung:** der Header `Authorization: Bearer bry_…` bei jeder Anfrage. Es gibt keine Cookies und keine Sitzungen.
- **Erfolg:** Die Antwort ist immer `{ "data": … }`. Anlegen liefert `201`, alles andere `200`. Löschen liefert die ID dessen, was entfernt wurde.
- **IDs:** Jedes Objekt hat eine `id`. Die ID eines Workspace ist sein Kurzname (`acme`). Issues lassen sich überall, wo ein Aufruf die ID eines Issues nimmt, auch über ihre Kennung ansprechen, etwa `WEB-42`.
- **Datumsangaben** sind ISO 8601 in UTC, zum Beispiel `2026-03-04T15:40:00.000Z`. Ein Fälligkeitsdatum schickst du als ISO-8601-Datum wie `2026-03-10`.
- **Ändern:** `PATCH` nimmt nur die Felder, die sich ändern sollen. Alles, was du weglässt, bleibt, wie es ist.
- **Beschreibungen und Kommentare** schreibst du in **Markdown**. Barynt wandelt sie auf dem Server um und kennt dieselben Kürzel wie der Editor: `@handle` erwähnt ein Workspace-Mitglied (und benachrichtigt es), `#WEB-12` verlinkt ein anderes Issue, `//2026-08-14` wird zum Datum, `[Text|https://…]` zum Link. Beim Lesen bekommst du das Markdown zurück.

### Listen, Seiten und Felder

- Listen, die lang werden können, kommen **neueste zuerst** und **seitenweise**: die Issues eines Projekts und die Issues einer View. Frag mit `limit` nach bis zu so vielen Einträgen (1 bis 100, Standard 25). Gibt es mehr, enthält die Antwort einen `nextCursor`. Schick ihn als `cursor` zurück, um die nächste Seite zu holen; `nextCursor: null` heißt, du hast alles gesehen. Der Cursor ist undurchsichtig, gib ihn unverändert weiter.
- Mit `fields=id,title,status` bekommst du nur die Felder, die du brauchst. `id` ist immer dabei.
- Issue-Listen lassen sich mit `status`, `assignee`, einer Textsuche `q` oder einem vollständigen **Filter** als JSON eingrenzen, mit denselben Regeln wie die Filter in der App, einschließlich `@me`. Siehe [Filter](../api-reference/filters.md).

```js
// Alle Issues eines Projekts durchgehen
let cursor = null;
do {
  const url = new URL(`${BASE}/api/v1/projects/proj_9f8e7d/issues`);
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  const { data, nextCursor } = await res.json();
  // … data verwenden …
  cursor = nextCursor;
} while (cursor);
```

## Fehler

Fehler tragen den passenden HTTP-Status und meist einen kurzen, maschinenlesbaren Code:

```json
{ "error": { "code": "insufficient_scope" } }
```

| Status  | Code                          | Bedeutung                                                                                                                                                                   |
| ------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **401** | `unauthorized`                | Der Schlüssel fehlt, ist falsch, widerrufen oder abgelaufen, oder sein Besitzer ist deaktiviert.                                                                            |
| **403** | `insufficient_scope`          | Dem Schlüssel fehlt der Scope, den dieser Aufruf braucht.                                                                                                                   |
| **403** | `forbidden`                   | Du darfst das Ding sehen, aber nicht ändern (zum Beispiel eine geteilte View von jemand anderem).                                                                           |
| **403** | `workspace_creation_disabled` | Der Administrator hat das Anlegen von Workspaces abgeschaltet.                                                                                                              |
| **404** | keiner (der Body ist `null`)  | Es existiert nicht, **oder du darfst es nicht sehen**. Barynt sagt bewusst nicht, was von beidem.                                                                           |
| **422** | `invalid_body`                | Der Body fehlt, ist kein JSON, oder ein Feld ist falsch.                                                                                                                    |
| **422** | `invalid_filter`              | Der Parameter `filter` ist kein gültiger Filter.                                                                                                                            |
| **422** | ein genauer Code              | Manche Aufrufe nennen den Grund, mit einer `message`: Anhänge nutzen `invalid_source`, `invalid_url`, `invalid_name`, `invalid_content`, `too_large` und `upload_rejected`. |
| **429** | `rate_limited`                | Zu viele Anfragen, siehe unten.                                                                                                                                             |

Eine 5xx-Antwort heißt, auf dem Server ist etwas schiefgegangen: Versuche es später wieder und schau in die [Fehlersuche](../administration/troubleshooting.md), wenn es bleibt.

### Limits

Jeder Schlüssel darf **120 Anfragen pro Minute** stellen. Jede Antwort sagt, wo du stehst:

| Header                  | Bedeutung                                                 |
| ----------------------- | --------------------------------------------------------- |
| `X-RateLimit-Limit`     | Das Budget pro Minute: 120.                               |
| `X-RateLimit-Remaining` | Was davon übrig ist.                                      |
| `X-RateLimit-Reset`     | Wann es sich wieder auffüllt, in Millisekunden seit 1970. |
| `Retry-After`           | Nur bei `429`: wie viele Sekunden du warten musst.        |

Die Zähler liegen in Redis, siehe [Konfiguration](../getting-started/config.md). Abgewiesene Anfragen zählen trotzdem mit, ein Client, der `429` ignoriert, bekommt also keine Gratis-Versuche. Ein höflicher Client wartet `Retry-After` ab und holt Seiten mit `limit=100`, statt viele kleine Aufrufe zu machen.

## Rezepte

### Ein Issue aus einem Formular anlegen

Nimm einen Schlüssel mit `issues:write` eines eigenen „Support-Bot“-Kontos. Such die ID des Projekts einmal heraus und hinterlege sie in deiner Konfiguration. Die Nachricht des Kunden gehört in `description`. Ein Label zeigt, woher das Issue kommt, und die `id` des Issues in deinem eigenen System verlinkt zurück.

### Jede Nacht die offenen Issues exportieren

```bash
# Alle Issues eines Projekts, die nicht erledigt sind, 100 pro Seite
curl -G "$BARYNT_URL/api/v1/projects/$PROJECT_ID/issues" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  --data-urlencode 'limit=100' \
  --data-urlencode 'fields=ref,title,status,assignee' \
  --data-urlencode 'filter={"op":"and","rules":[{"field":"statusCategory","is":"none","value":["completed","canceled"]}]}'
```

Wiederhole mit `cursor=`, bis `nextCursor` `null` ist.

### Eine Datei anhängen

Bis 10 MB schickst du die Datei direkt als Base64. Alles Größere (bis 100 MB) lädst du in zwei Schritten hoch: eine Upload-Adresse anfordern, die Datei dorthin per `PUT` schicken, dann den Anhang mit dem erhaltenen Schlüssel anlegen. Siehe [Anhänge](../api-reference/attachments.md).

### Bescheid bekommen, statt zu fragen

Ständiges Nachfragen verbraucht dein Budget. Ein [Webhook](webhooks.md) meldet sich, wenn sich ein Issue oder ein Kommentar ändert.

## Gut zu wissen

- Nichts, was die API tut, umgeht Berechtigungen. Der Schlüssel eines Viewers kann nicht schreiben, auch nicht mit einem Schreib-Scope.
- Änderungen über die API erscheinen in der Aktivität des Issues und in Benachrichtigungen, genau wie Änderungen in der App, und sie lösen [Webhooks](webhooks.md) aus.
- Die Referenz in der App steht an derselben Stelle wie deine Schlüssel, auf der Seite **API-Schlüssel**, und passt immer zur Version, die du betreibst. Diese Dokumentation wird aus denselben Daten erzeugt.
- Dieselben Schlüssel funktionieren auch für den [MCP-Server](mcp.md), mit denselben Scopes und demselben Budget.

## Weiter

- [Die API-Referenz](../api-reference/workspaces.md), eine Seite pro Bereich
- [Filter](../api-reference/filters.md)
- [Webhooks](webhooks.md) und [Webhook-Ereignisse](../api-reference/webhook-events.md)
