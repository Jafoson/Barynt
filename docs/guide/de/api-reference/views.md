---
title: "Views"
description: "REST-API: Gespeicherte Views und die Issues, die eine View zeigt."
sidebar:
  order: 9
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Eine View speichert Filter, Gruppierung und Sortierung unter einem Namen. Ihr Filter nutzt die [Filtersprache](filters.md). Jeder Aufruf braucht den genannten Scope und einen Key (oder ein Token) von jemandem, der das in der App darf. Siehe [Anmeldung und Grundlagen](../integrations/api.md).

## `GET /api/v1/projects/{id}/views`

Scope: `views:read`

Listet die gespeicherten Views eines Projekts, die du siehst — geteilte und deine eigenen privaten, in Tab-Reihenfolge.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Projekts. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/projects/$PROJECT_ID/views" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    {
      "id": "v_3c9d1e",
      "name": "Urgent bugs",
      "slug": "urgent-bugs",
      "systemKey": null,
      "workspaceId": "ws_1a2b3c",
      "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
      "owner": { "id": "u_7h3j2k", "name": "Priya Shah", "handle": "priya" },
      "visibility": "PROJECT",
      "layout": "list",
      "icon": null,
      "color": "#e05252",
      "filter": {
        "op": "and",
        "rules": [
          { "field": "type", "is": "any", "value": ["bug"] },
          { "field": "priority", "is": "gte", "value": 3 },
          { "field": "assignee", "is": "any", "value": ["@me"] }
        ]
      },
      "groupBy": "status",
      "subGroupBy": null,
      "sortBy": "priority",
      "sortDir": "desc",
      "createdAt": "2026-10-01T09:00:00.000Z",
      "updatedAt": "2026-10-12T14:20:00.000Z",
      "canEdit": true
    }
  ]
}
```

## `GET /api/v1/workspaces/{id}/views`

Scope: `views:read`

Listet die projektübergreifenden Views eines Workspace, die du siehst, samt den eingebauten "My issues" und "Created by me" (mit systemKey; sie lassen sich nicht ändern).

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/views" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    {
      "id": "v_8a1b2c",
      "name": "My issues",
      "slug": "my-issues",
      "systemKey": "my-issues",
      "project": null,
      "owner": null,
      "visibility": "WORKSPACE",
      "layout": "list",
      "filter": { "op": "and", "rules": [] },
      "canEdit": false
    }
  ]
}
```

## `GET /api/v1/views/{id}`

Scope: `views:read`

Holt eine View: Filterbaum, Layout, Gruppierung und Sortierung. "@me" bleibt im Filter so stehen — es meint, wer fragt.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID der View. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/views/$VIEW_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": {
    "id": "v_3c9d1e",
    "name": "Urgent bugs",
    "slug": "urgent-bugs",
    "systemKey": null,
    "workspaceId": "ws_1a2b3c",
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "owner": { "id": "u_7h3j2k", "name": "Priya Shah", "handle": "priya" },
    "visibility": "PROJECT",
    "layout": "list",
    "icon": null,
    "color": "#e05252",
    "filter": {
      "op": "and",
      "rules": [
        { "field": "type", "is": "any", "value": ["bug"] },
        { "field": "priority", "is": "gte", "value": 3 },
        { "field": "assignee", "is": "any", "value": ["@me"] }
      ]
    },
    "groupBy": "status",
    "subGroupBy": null,
    "sortBy": "priority",
    "sortDir": "desc",
    "createdAt": "2026-10-01T09:00:00.000Z",
    "updatedAt": "2026-10-12T14:20:00.000Z",
    "canEdit": true
  }
}
```

## `GET /api/v1/views/{id}/issues`

Scope: `views:read`

Die Issues einer View, so wie du sie in der App siehst: ihr Filter mit deinem @me, ihr Projekt (bei einer projektübergreifenden View deine sichtbaren Projekte) und die feste Bedingung einer eingebauten View. Neueste zuerst, seitenweise mit Cursor. Braucht zusätzlich issues:read.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID der View. |

**Query-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `fields` | `string` |  | Kommagetrennte Liste der Felder, die zurückkommen sollen. |
| `cursor` | `string` |  | Der `nextCursor` der vorigen Seite. |
| `limit` | `integer` |  | Seitengröße 1–100. Standard 25. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/views/$VIEW_ID/issues" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    { "id": "i_4k2n1x", "ref": "WEB-42", "title": "Fix broken checkout flow", "status": "in_progress", "statusCategory": "started" }
  ],
  "nextCursor": null
}
```

## `POST /api/v1/projects/{id}/views`

Scope: `views:write`

Speichert eine View in einem Projekt. Privat, wenn visibility nichts anderes sagt.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Projekts. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | `string` | ja | Bis zu 80 Zeichen. |
| `layout` | `"board" \| "list" \| "dashboard"` | ja |  |
| `visibility` | `"PRIVATE" \| "PROJECT" \| "WORKSPACE"` |  | Standard PRIVATE (nur du). PROJECT für eine Projekt-View, WORKSPACE für eine projektübergreifende — Teilen braucht das Recht view.share. |
| `filter` | `object` |  | Ein Filterbaum — siehe [Filter](filters.md). |
| `groupBy` | `string \| null` |  | status, priority, assignee, type, label, project … |
| `sortBy` | `string` |  | manual, priority, created, updated, dueDate … |
| `sortDir` | `"asc" \| "desc"` |  |  |
| `icon` | `string \| null` |  |  |
| `color` | `string \| null` |  | Eine Hex-Farbe. |

**Beispiel**

```bash
curl -X POST "$BARYNT_URL/api/v1/projects/$PROJECT_ID/views" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Urgent bugs", "layout": "list", "visibility": "PROJECT", "filter": { "op": "and", "rules": [{ "field": "priority", "is": "gte", "value": 3 }] }, "sortBy": "priority", "sortDir": "desc" }'
```

**Anfrage**

```json
{
  "name": "Urgent bugs",
  "layout": "list",
  "visibility": "PROJECT",
  "filter": {
    "op": "and",
    "rules": [{ "field": "priority", "is": "gte", "value": 3 }]
  },
  "sortBy": "priority",
  "sortDir": "desc"
}
```

**Antwort**

```jsonc
// 201 Created
{
  "data": { "id": "v_3c9d1e", "name": "Urgent bugs", "…": "…" }
}
```

## `POST /api/v1/workspaces/{id}/views`

Scope: `views:write`

Speichert eine projektübergreifende View in einem Workspace. Gleicher Body wie bei einem Projekt; visibility ist PRIVATE oder WORKSPACE.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | `string` | ja | Bis zu 80 Zeichen. |
| `layout` | `"board" \| "list" \| "dashboard"` | ja |  |
| `visibility` | `"PRIVATE" \| "PROJECT" \| "WORKSPACE"` |  | Standard PRIVATE (nur du). PROJECT für eine Projekt-View, WORKSPACE für eine projektübergreifende — Teilen braucht das Recht view.share. |
| `filter` | `object` |  | Ein Filterbaum — siehe [Filter](filters.md). |
| `groupBy` | `string \| null` |  | status, priority, assignee, type, label, project … |
| `sortBy` | `string` |  | manual, priority, created, updated, dueDate … |
| `sortDir` | `"asc" \| "desc"` |  |  |
| `icon` | `string \| null` |  |  |
| `color` | `string \| null` |  | Eine Hex-Farbe. |

**Beispiel**

```bash
curl -X POST "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/views" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Urgent bugs", "layout": "list", "visibility": "WORKSPACE", "filter": { "op": "and", "rules": [{ "field": "priority", "is": "gte", "value": 3 }] }, "sortBy": "priority", "sortDir": "desc" }'
```

**Anfrage**

```json
{
  "name": "Urgent bugs",
  "layout": "list",
  "visibility": "WORKSPACE",
  "filter": {
    "op": "and",
    "rules": [{ "field": "priority", "is": "gte", "value": 3 }]
  },
  "sortBy": "priority",
  "sortDir": "desc"
}
```

**Antwort**

```jsonc
// 201 Created
{
  "data": { "id": "v_5e7f8a", "name": "Urgent bugs", "…": "…" }
}
```

## `PATCH /api/v1/views/{id}`

Scope: `views:write`

Ändert eine View — nur die Felder, die du schickst. Private Views: ihr Besitzer. Geteilte Views: ihr Ersteller, solange er view.share hat, oder jeder mit view.manage; sonst 403. Nur der Ersteller kann eine geteilte View wieder privat machen.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID der View. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | `string` |  |  |
| `visibility` | `"PRIVATE" \| "PROJECT" \| "WORKSPACE"` |  |  |
| `filter` | `object` |  | Ersetzt den ganzen Baum. |
| `layout` | `string` |  |  |
| `groupBy` | `string \| null` |  |  |
| `sortBy` | `string` |  |  |
| `sortDir` | `"asc" \| "desc"` |  |  |

**Beispiel**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/views/$VIEW_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Urgent bugs (P1+)", "filter": { "op": "and", "rules": [{ "field": "priority", "is": "gte", "value": 4 }] } }'
```

**Anfrage**

```json
{
  "name": "Urgent bugs (P1+)",
  "filter": {
    "op": "and",
    "rules": [{ "field": "priority", "is": "gte", "value": 4 }]
  }
}
```

**Antwort**

```json
{
  "data": { "id": "v_3c9d1e", "name": "Urgent bugs (P1+)", "…": "…" }
}
```

## `DELETE /api/v1/views/{id}`

Scope: `views:write`

Löscht eine View — mit denselben Rechten wie beim Ändern. Eingebaute Views lassen sich nicht löschen.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID der View. |

**Beispiel**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/views/$VIEW_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": { "id": "v_3c9d1e" }
}
```
