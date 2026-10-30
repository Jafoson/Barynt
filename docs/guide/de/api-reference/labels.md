---
title: "Labels"
description: "REST-API: Labels auflisten, anlegen, ändern und löschen."
sidebar:
  order: 7
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Labels gehören zu einem Workspace und lassen sich an jedes Issue darin hängen. Jeder Aufruf braucht den genannten Scope und einen Key (oder ein Token) von jemandem, der das in der App darf. Siehe [Anmeldung und Grundlagen](../integrations/api.md).

## `GET /api/v1/workspaces/{id}/labels`

Scope: `labels:read`

Listet alle Labels, die in einem Workspace sichtbar sind — workspaceweite und die aller Projekte, die du sehen kannst.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/labels" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    {
      "id": "l_9f2a1b",
      "name": "frontend",
      "slug": "frontend",
      "color": "#3b7bd5",
      "projectId": null
    }
  ]
}
```

## `POST /api/v1/workspaces/{id}/labels`

Scope: `labels:write`

Legt ein Label an. Ohne projectId gilt es im ganzen Workspace.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | `string` | ja |  |
| `color` | `string` | ja | Eine Hex-Farbe. |
| `projectId` | `string` |  | Beschränkt das Label auf ein Projekt statt auf den ganzen Workspace. |

**Beispiel**

```bash
curl -X POST "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/labels" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "frontend", "color": "#3b7bd5", "projectId": "proj_9f8e7d" }'
```

**Anfrage**

```json
{
  "name": "frontend",
  "color": "#3b7bd5",
  "projectId": "proj_9f8e7d"
}
```

**Antwort**

```jsonc
// 201 Created
{
  "data": {
    "id": "l_9f2a1b",
    "name": "frontend",
    "slug": "frontend",
    "color": "#3b7bd5",
    "projectId": null
  }
}
```

## `PATCH /api/v1/labels/{id}`

Scope: `labels:write`

Ändert Name und/oder Farbe eines Labels. Jedes Feld ist optional — schick nur, was sich ändert.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Labels. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | `string` |  |  |
| `color` | `string` |  | Eine Hex-Farbe. |

**Beispiel**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/labels/$LABEL_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "frontend", "color": "#e0992b" }'
```

**Anfrage**

```json
{
  "name": "frontend",
  "color": "#e0992b"
}
```

**Antwort**

```json
{
  "data": { "id": "l_9f2a1b" }
}
```

## `DELETE /api/v1/labels/{id}`

Scope: `labels:write`

Löscht ein Label und entfernt es von allen Issues, an denen es hängt.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Labels. |

**Beispiel**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/labels/$LABEL_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": { "id": "l_9f2a1b" }
}
```
