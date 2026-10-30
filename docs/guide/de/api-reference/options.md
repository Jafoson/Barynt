---
title: "Status, Prioritäten und Typen"
description: "REST-API: Welche Werte Status, Priorität und Typ eines Issues annehmen können."
sidebar:
  order: 4
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Nur lesbare Listen. Hier findest du die IDs, die du in Issues und Filtern verwendest. Jeder Aufruf braucht den genannten Scope und einen Key (oder ein Token) von jemandem, der das in der App darf. Siehe [Anmeldung und Grundlagen](../integrations/api.md).

## `GET /api/v1/workspaces/{id}/statuses`

Scope: `workspaces:read`

Listet die Status eines Workspace in Board-Reihenfolge, jeweils mit Kategorie — backlog, unstarted, started, completed oder canceled. Die Kategorien sind in jedem Workspace gleich, Status-IDs und -Namen nicht.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/statuses" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    {
      "id": "todo",
      "name": "Todo",
      "short": "Todo",
      "color": "#b8bcc4",
      "category": "unstarted",
      "isColumn": true,
      "position": 1
    },
    {
      "id": "in_progress",
      "name": "In Progress",
      "short": "Doing",
      "color": "#e0992b",
      "category": "started",
      "isColumn": true,
      "position": 2
    }
  ]
}
```

## `GET /api/v1/workspaces/{id}/priorities`

Scope: `workspaces:read`

Listet die Prioritäten eines Workspace in Reihenfolge. Die `id` ist die Zahl, die `priority` beim Anlegen oder Ändern eines Issues erwartet.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/priorities" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    { "id": 0, "key": "none", "name": "No priority", "color": "#b8bcc4", "position": 0 },
    { "id": 3, "key": "high", "name": "High", "color": "#e0992b", "position": 3 }
  ]
}
```

## `GET /api/v1/workspaces/{id}/issue-types`

Scope: `workspaces:read`

Listet die Issue-Typen eines Workspace in Reihenfolge. Die `id` ist das, was `type` beim Anlegen oder Ändern eines Issues erwartet.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/issue-types" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    { "id": "feature", "name": "Feature", "color": "#4a9d6f", "position": 1 },
    { "id": "bug", "name": "Bug", "color": "#d1495b", "position": 2 }
  ]
}
```
