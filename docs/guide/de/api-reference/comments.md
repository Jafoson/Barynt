---
title: "Kommentare"
description: "REST-API: Kommentare eines Issues auflisten, schreiben, ändern und löschen."
sidebar:
  order: 5
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Kommentare und Antworten an einem Issue. Jeder Aufruf braucht den genannten Scope und einen Key (oder ein Token) von jemandem, der das in der App darf. Siehe [Anmeldung und Grundlagen](../integrations/api.md).

## `GET /api/v1/issues/{id}/comments`

Scope: `comments:read`

Listet die Kommentare eines Issues, älteste zuerst.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Issues. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/issues/$ISSUE_ID/comments" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    {
      "id": "c_5m9p3q",
      "issueId": "i_4k2n1x",
      "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
      "parentId": null,
      "body": "Confirmed on Safari 17.",
      "created": "2026-03-02T10:05:00.000Z",
      "updated": null
    }
  ]
}
```

## `POST /api/v1/issues/{id}/comments`

Scope: `comments:write`

Legt einen Kommentar an. Autor ist immer der Besitzer des Tokens, nie ein Feld im Body.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Issues. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `body` | `string` | ja | Markdown, wird auf dem Server umgewandelt. `@handle` erwähnt ein Workspace-Mitglied (benachrichtigt es, außer beim Bearbeiten von Kommentaren); `#PREFIX-123` verlinkt ein anderes Issue; `//2026-08-14` (oder `//14.8.2026`) wird zum Datums-Chip; `[label\|https://...]` (oder nur `[https://...]`) wird zum Link-Chip. Alles wird auf dem Server aufgelöst, was sich nicht auflösen lässt, bleibt Text. |
| `parentId` | `string` |  | Die ID des Kommentars, auf den du antwortest. Weglassen für einen Kommentar auf oberster Ebene. |

**Beispiel**

```bash
curl -X POST "$BARYNT_URL/api/v1/issues/$ISSUE_ID/comments" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "body": "Confirmed on Safari 17.", "parentId": "c_1a2b3c" }'
```

**Anfrage**

```json
{
  "body": "Confirmed on Safari 17.",
  "parentId": "c_1a2b3c"
}
```

**Antwort**

```jsonc
// 201 Created
{
  "data": {
    "id": "c_5m9p3q",
    "issueId": "i_4k2n1x",
    "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "parentId": null,
    "body": "Confirmed on Safari 17.",
    "created": "2026-03-04T15:40:00.000Z",
    "updated": null
  }
}
```

## `PATCH /api/v1/comments/{id}`

Scope: `comments:write`

Ändert einen Kommentar. Deine eigenen kannst du immer bearbeiten; fremde nur mit dem Recht comment.update.any in deiner Rolle.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Kommentars. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `body` | `string` | ja | Markdown, wird auf dem Server umgewandelt. `@handle` erwähnt ein Workspace-Mitglied (benachrichtigt es, außer beim Bearbeiten von Kommentaren); `#PREFIX-123` verlinkt ein anderes Issue; `//2026-08-14` (oder `//14.8.2026`) wird zum Datums-Chip; `[label\|https://...]` (oder nur `[https://...]`) wird zum Link-Chip. Alles wird auf dem Server aufgelöst, was sich nicht auflösen lässt, bleibt Text. |

**Beispiel**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/comments/$COMMENT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "body": "Confirmed on Safari 17 and 18." }'
```

**Anfrage**

```json
{
  "body": "Confirmed on Safari 17 and 18."
}
```

**Antwort**

```json
{
  "data": { "id": "c_5m9p3q" }
}
```

## `DELETE /api/v1/comments/{id}`

Scope: `comments:write`

Löscht einen Kommentar samt Antworten. Deine eigenen kannst du immer löschen; fremde nur mit dem Recht comment.delete.any in deiner Rolle.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Kommentars. |

**Beispiel**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/comments/$COMMENT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": { "id": "c_5m9p3q" }
}
```
