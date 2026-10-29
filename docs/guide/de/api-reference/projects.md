---
title: "Projekte"
description: "REST-API: Projekte auflisten, anlegen, ändern und löschen."
sidebar:
  order: 2
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Projekte enthalten die Issues. Sie gehören zu genau einem Workspace. Jeder Aufruf braucht den genannten Scope und einen Key (oder ein Token) von jemandem, der das in der App darf. Siehe [Anmeldung und Grundlagen](../integrations/api.md).

## `GET /api/v1/workspaces/{id}/projects`

Scope: `projects:read`

Listet die Projekte eines Workspace, die du sehen kannst.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/projects" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    {
      "id": "proj_9f8e7d",
      "name": "Website Relaunch",
      "slug": "website-relaunch",
      "prefix": "WEB",
      "color": "#3b7bd5"
    }
  ]
}
```

## `POST /api/v1/workspaces/{id}/projects`

Scope: `projects:write`

Legt ein Projekt in einem Workspace an.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | `string` | ja |  |
| `desc` | `string` |  | Eine Beschreibung in einem Satz. |
| `prefix` | `string` |  | Bis zu 4 Buchstaben, Teil der Issue-Kennung (z. B. "WEB"). Fehlt es, wird es aus dem Namen gebildet; ist es vergeben, wird eine Zahl angehängt. |
| `color` | `string` | ja | Eine Hex-Farbe. |
| `visibility` | `"public" \| "private"` |  | Ein öffentliches Projekt nimmt jedes Workspace-Mitglied auf. Standard "public". |

**Beispiel**

```bash
curl -X POST "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/projects" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Website Relaunch", "desc": "Marketing site rebuild for Q2.", "prefix": "WEB", "color": "#3b7bd5", "visibility": "public" }'
```

**Anfrage**

```json
{
  "name": "Website Relaunch",
  "desc": "Marketing site rebuild for Q2.",
  "prefix": "WEB",
  "color": "#3b7bd5",
  "visibility": "public"
}
```

**Antwort**

```jsonc
// 201 Created
{
  "data": {
    "id": "proj_9f8e7d",
    "name": "Website Relaunch",
    "slug": "website-relaunch",
    "prefix": "WEB",
    "color": "#3b7bd5"
  }
}
```

## `PATCH /api/v1/projects/{id}`

Scope: `projects:write`

Ändert ein Projekt. Jedes Feld ist optional — schick nur, was sich ändert.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Projekts. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | `string` |  |  |
| `desc` | `string` |  |  |
| `prefix` | `string` |  | Bis zu 4 Buchstaben. |
| `color` | `string` |  | Eine Hex-Farbe. |
| `visibility` | `"public" \| "private"` |  |  |

**Beispiel**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Website Relaunch 2.0", "desc": "Now with a checkout redesign.", "prefix": "WEB2", "color": "#3b7bd5", "visibility": "private" }'
```

**Anfrage**

```json
{
  "name": "Website Relaunch 2.0",
  "desc": "Now with a checkout redesign.",
  "prefix": "WEB2",
  "color": "#3b7bd5",
  "visibility": "private"
}
```

**Antwort**

```json
{
  "data": { "id": "proj_9f8e7d" }
}
```

## `DELETE /api/v1/projects/{id}`

Scope: `projects:write`

Löscht ein Projekt samt allen Issues darin. Das lässt sich nicht rückgängig machen.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Projekts. |

**Beispiel**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": { "id": "proj_9f8e7d" }
}
```
