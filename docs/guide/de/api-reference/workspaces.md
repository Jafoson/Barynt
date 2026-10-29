---
title: "Workspaces"
description: "REST-API: Workspaces auflisten, anlegen, ändern und löschen."
sidebar:
  order: 1
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Ein Workspace ist die oberste Ebene: Er enthält Projekte, Mitglieder, Labels und Status. Jeder Aufruf braucht den genannten Scope und einen Key (oder ein Token) von jemandem, der das in der App darf. Siehe [Anmeldung und Grundlagen](../integrations/api.md).

## `GET /api/v1/workspaces`

Scope: `workspaces:read`

Listet die Workspaces, in denen du Mitglied bist.

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/workspaces" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    {
      "id": "ws_1a2b3c",
      "name": "Acme Inc",
      "color": "#6e63e6",
      "avatarUrl": null
    }
  ]
}
```

## `POST /api/v1/workspaces`

Scope: `workspaces:write`

Legt einen Workspace an, du wirst sein Owner. Anders als in der App entsteht dabei kein erstes Projekt — lege es ausdrücklich über den Projekt-Endpunkt unten an.

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | `string` | ja |  |
| `slug` | `string` | ja | Kleinbuchstaben, Ziffern und Bindestriche. Ist er vergeben, wird eine Zahl angehängt. |
| `color` | `string` |  | Eine Hex-Farbe. Standard "#6e63e6". |

**Beispiel**

```bash
curl -X POST "$BARYNT_URL/api/v1/workspaces" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Inc", "slug": "acme", "color": "#6e63e6" }'
```

**Anfrage**

```json
{
  "name": "Acme Inc",
  "slug": "acme",
  "color": "#6e63e6"
}
```

**Antwort**

```jsonc
// 201 Created
{
  "data": {
    "id": "acme",
    "name": "Acme Inc",
    "color": "#6e63e6",
    "avatarUrl": null
  }
}
```

## `PATCH /api/v1/workspaces/{id}`

Scope: `workspaces:write`

Ändert einen Workspace. Jedes Feld ist optional — schick nur, was sich ändert.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Body**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `name` | `string` |  |  |
| `color` | `string` |  | Eine Hex-Farbe. |
| `desc` | `string` |  | Eine Beschreibung in einem Satz. |

**Beispiel**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Corp", "color": "#3b7bd5", "desc": "Product and marketing, together." }'
```

**Anfrage**

```json
{
  "name": "Acme Corp",
  "color": "#3b7bd5",
  "desc": "Product and marketing, together."
}
```

**Antwort**

```json
{
  "data": { "id": "acme" }
}
```

## `DELETE /api/v1/workspaces/{id}`

Scope: `workspaces:write`

Löscht einen Workspace samt allen Projekten und Issues darin. Das lässt sich nicht rückgängig machen.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Beispiel**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": { "id": "acme" }
}
```
