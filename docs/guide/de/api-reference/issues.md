---
title: "Issues und Beziehungen"
description: "REST-API: Issues mit Filtern und Seiten auflisten, lesen, anlegen, ändern, löschen und miteinander verknüpfen."
sidebar:
  order: 3
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Die Issue-Liste kommt seitenweise und lässt sich filtern, siehe [Filter](filters.md). Jeder Aufruf braucht den genannten Scope und einen Key (oder ein Token) von jemandem, der das in der App darf. Siehe [Anmeldung und Grundlagen](../integrations/api.md).

## `GET /api/v1/projects/{id}/issues`

Scope: `issues:read`

Listet die Issues eines Projekts, neueste zuerst, seitenweise mit Cursor.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Projekts. |

**Query-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `status` | `string` |  | Nach Status-Key filtern. |
| `assignee` | `string` |  | Nach der User-ID des Zuständigen filtern. |
| `q` | `string` |  | Teilstring-Suche in Titel und Beschreibung, ohne Groß-/Kleinschreibung. |
| `filter` | `string (JSON)` |  | Ein Filterbaum als JSON, URL-kodiert — z. B. `{"op":"and","rules":[{"field":"priority","is":"gte","value":3}]}`. "@me" bist du. Wie das geht: [Filter](filters.md). 422 invalid_filter, wenn es kein gültiger Baum ist. |
| `fields` | `string` |  | Kommagetrennte Liste, z. B. "id,title,status" — die Antwort enthält nur diese Felder ("id" ist immer dabei). |
| `cursor` | `string` |  | Der `nextCursor` der vorigen Seite. |
| `limit` | `integer` |  | Seitengröße 1–100. Standard 25. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/projects/$PROJECT_ID/issues" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    {
      "id": "i_4k2n1x",
      "ref": "WEB-42",
      "title": "Fix broken checkout flow",
      "status": "in_progress",
      "statusCategory": "started",
      "priority": 2,
      "type": "bug",
      "labels": [
        { "id": "l_9f2a1b", "name": "frontend" }
      ],
      "assignee": { "id": "u_7h3j2k", "name": "Priya Shah" },
      "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
      "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
      "description": "Checkout fails on Safari when …",
      "created": "2026-03-01T09:12:00.000Z",
      "updated": "2026-03-04T15:40:00.000Z",
      "closedAt": null,
      "dueDate": "2026-03-10T00:00:00.000Z",
      "storyPoints": 5,
      "estimateHours": 8,
      "estimateUnit": "days",
      "commentCount": 0,
      "attachmentCount": 0,
      "parent": null,
      "children": [],
      "relations": []
    }
  ],
  "nextCursor": "eyJpZCI6ImlfNGsybjF4In0"
}
```

## `POST /api/v1/projects/{id}/issues`

Scope: `issues:write`

Legt ein Issue an. Ersteller ist immer der Besitzer des Tokens, nie ein Feld im Body.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Projekts. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `title` | `string` | ja |  |
| `description` | `string` |  | Markdown, wird auf dem Server umgewandelt. `@handle` erwähnt ein Workspace-Mitglied (benachrichtigt es, außer beim Bearbeiten von Kommentaren); `#PREFIX-123` verlinkt ein anderes Issue; `//2026-08-14` (oder `//14.8.2026`) wird zum Datums-Chip; `[label\|https://...]` (oder nur `[https://...]`) wird zum Link-Chip. Alles wird auf dem Server aufgelöst, was sich nicht auflösen lässt, bleibt Text. |
| `status` | `string` |  | Ein Status-Key des Projekts. Standard "backlog". |
| `priority` | `integer` |  | 0–4. Standard 0. |
| `assignee` | `string \| null` |  | Eine User-ID oder null. |
| `labels` | `string[]` |  | Label-IDs. |
| `type` | `string` |  | Ein Issue-Typ-Key. Standard "feature". |
| `parentId` | `string \| null` |  | Macht das neue Issue gleich zum Sub-Issue dieses Issues. |
| `dueDate` | `string \| null` |  | ISO-8601-Datum, z. B. "2026-09-20". |
| `storyPoints` | `integer \| null` |  | Meist ein Fibonacci-Wert (1/2/3/5/8/13), wird aber nicht erzwungen. |
| `estimateHours` | `number \| null` |  | In Stunden, z. B. 2.5. |
| `estimateUnit` | `"hours" \| "days" \| "weeks" \| "months" \| "years" \| null` |  | In welcher Einheit estimateHours eingegeben wurde. Standard "hours" — nur ein Anzeige-Hinweis, die Bedeutung von estimateHours ändert sich nicht. |

**Beispiel**

```bash
curl -X POST "$BARYNT_URL/api/v1/projects/$PROJECT_ID/issues" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Fix broken checkout flow", "description": "Checkout fails on Safari when the discount code field is empty.", "status": "todo", "priority": 2, "assignee": "u_7h3j2k", "labels": ["l_9f2a1b"], "type": "bug" }'
```

**Anfrage**

```json
{
  "title": "Fix broken checkout flow",
  "description": "Checkout fails on Safari when the discount code field is empty.",
  "status": "todo",
  "priority": 2,
  "assignee": "u_7h3j2k",
  "labels": ["l_9f2a1b"],
  "type": "bug"
}
```

**Antwort**

```jsonc
// 201 Created
{
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "backlog",
    "priority": 2,
    "type": "feature",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend" }
    ],
    "assignee": null,
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-04T15:40:00.000Z",
    "updated": "2026-03-04T15:40:00.000Z",
    "closedAt": null,
    "dueDate": null,
    "storyPoints": null,
    "estimateHours": null,
    "estimateUnit": null,
    "commentCount": 0,
    "attachmentCount": 0,
    "parent": null,
    "children": [],
    "relations": []
  }
}
```

## `GET /api/v1/issues/{id}`

Scope: `issues:read`

Holt ein einzelnes Issue über die interne ID oder die Kennung "PREFIX-123" (z. B. "WEB-42") — zuerst wird es als ID versucht, als Kennung nur, wenn keine ID passt. `description` ist Markdown, im selben Dialekt, in dem sie geschrieben wird. Kommentare sind nicht eingebettet: `commentCount` nennt ihre Anzahl (0 = keine) — ist sie größer als 0, hole sie über GET /api/v1/issues/{id}/comments. Anhänge dagegen schon: `attachments` listet jede Datei und jeden Link mit einer `url` zum Ansehen (bei einer Datei ein signierter Download-Link, gültig bis `urlExpiresAt`).

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Issues. |

**Query-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `fields` | `string` |  | Kommagetrennte Liste, z. B. "id,title,status" — die Antwort enthält nur diese Felder ("id" ist immer dabei). |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/issues/$ISSUE_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```jsonc
{
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "in_progress",
    "priority": 2,
    "type": "bug",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend" }
    ],
    "assignee": { "id": "u_7h3j2k", "name": "Priya Shah" },
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-01T09:12:00.000Z",
    "updated": "2026-03-04T15:40:00.000Z",
    "closedAt": null,
    "dueDate": "2026-03-10T00:00:00.000Z",
    "storyPoints": 5,
    "estimateHours": 8,
    "estimateUnit": "days",
    "commentCount": 1,
    "attachmentCount": 1,
    "attachments": [
      {
        "id": "att_3f9c1d",
        "issueId": "i_4k2n1x",
        "kind": "file",
        "name": "safari-checkout.png",
        "url": "https://files.example.com/issues/attachments/i_4k2n1x/…?X-Amz-Signature=…",
        "urlExpiresAt": "2026-03-04T16:40:00.000Z",
        "mimeType": "image/png",
        "size": 184213,
        "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
        "created": "2026-03-02T10:07:00.000Z"
      }
    ],
    "parent": null,
    "children": [
      { "id": "i_2b7c4d", "ref": "WEB-51", "title": "Safari-only regression", "status": "todo" }
    ],
    "relations": [
      {
        "id": "ir_8n3k2m",
        "type": "BLOCKS",
        "direction": "incoming",
        "issue": { "id": "i_9x1y2z", "ref": "WEB-40", "title": "Ship the discount banner", "status": "in_progress" }
      }
    ]
  }
}
```

## `PATCH /api/v1/issues/{id}`

Scope: `issues:write`

Ändert ein Issue. Jedes Feld ist optional — schick nur, was sich ändert. Neu zuweisen braucht zusätzlich das Recht `issue.assign` in deiner Rolle.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Issues. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `title` | `string` |  |  |
| `description` | `string` |  | Markdown, wird auf dem Server umgewandelt. `@handle` erwähnt ein Workspace-Mitglied (benachrichtigt es, außer beim Bearbeiten von Kommentaren); `#PREFIX-123` verlinkt ein anderes Issue; `//2026-08-14` (oder `//14.8.2026`) wird zum Datums-Chip; `[label\|https://...]` (oder nur `[https://...]`) wird zum Link-Chip. Alles wird auf dem Server aufgelöst, was sich nicht auflösen lässt, bleibt Text. |
| `status` | `string` |  | Ein Status-Key des Projekts. |
| `priority` | `integer` |  | 0–4. |
| `assignee` | `string \| null` |  | Eine User-ID, oder null, um die Zuweisung zu entfernen. |
| `labels` | `string[]` |  | Label-IDs. |
| `type` | `string` |  | Ein Issue-Typ-Key. |
| `parentId` | `string \| null` |  | Setzt das übergeordnete Issue (Sub-Issue von); null entfernt es. Abgelehnt (422), wenn dadurch ein Kreis entstünde. |
| `dueDate` | `string \| null` |  | ISO-8601-Datum, z. B. "2026-09-20"; null entfernt es. |
| `storyPoints` | `integer \| null` |  | Meist ein Fibonacci-Wert (1/2/3/5/8/13), wird aber nicht erzwungen. |
| `estimateHours` | `number \| null` |  | In Stunden, z. B. 2.5. null entfernt die Schätzung (und estimateUnit mit). |
| `estimateUnit` | `"hours" \| "days" \| "weeks" \| "months" \| "years" \| null` |  | Ändert nur die Anzeige-Einheit von estimateHours, unabhängig davon, ob sich estimateHours in derselben Anfrage ändert. Fehlt es bei einem neuen estimateHours, gilt "hours". |

**Beispiel**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/issues/$ISSUE_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Fix broken checkout flow", "description": "Checkout fails on Safari when the discount code field is empty.", "status": "in_progress", "statusCategory": "started", "priority": 2, "assignee": "u_7h3j2k", "labels": ["l_9f2a1b"], "type": "bug" }'
```

**Anfrage**

```json
{
  "title": "Fix broken checkout flow",
  "description": "Checkout fails on Safari when the discount code field is empty.",
  "status": "in_progress",
  "statusCategory": "started",
  "priority": 2,
  "assignee": "u_7h3j2k",
  "labels": ["l_9f2a1b"],
  "type": "bug"
}
```

**Antwort**

```json
{
  "data": { "id": "i_4k2n1x" }
}
```

## `POST /api/v1/issues/{id}/relations`

Scope: `issues:write`

Verbindet zwei Issues mit einer Beziehung: BLOCKS, RELATES_TO oder DUPLICATES. Sie gilt aus Sicht von {id} — bei BLOCKS/DUPLICATES blockiert bzw. dupliziert {id} also `relatedId`. RELATES_TO hat keine Richtung, beide Wege ergeben dieselbe Beziehung.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Issues. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `relatedId` | `string` | ja | Die ID des anderen Issues. |
| `type` | `"BLOCKS" \| "RELATES_TO" \| "DUPLICATES"` | ja |  |

**Beispiel**

```bash
curl -X POST "$BARYNT_URL/api/v1/issues/$ISSUE_ID/relations" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "relatedId": "i_9x1y2z", "type": "BLOCKS" }'
```

**Anfrage**

```json
{
  "relatedId": "i_9x1y2z",
  "type": "BLOCKS"
}
```

**Antwort**

```jsonc
// 201 Created
{
  "data": { "id": "ir_8n3k2m" }
}
```

## `DELETE /api/v1/relations/{id}`

Scope: `issues:write`

Entfernt eine Beziehung (über ihre eigene ID aus `relations` eines Issues) — von beiden verbundenen Issues aus möglich.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID der Beziehung. |

**Beispiel**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/relations/$RELATION_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": { "id": "ir_8n3k2m" }
}
```
