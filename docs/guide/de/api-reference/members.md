---
title: "Mitglieder"
description: "REST-API: Die Mitglieder eines Workspace oder Projekts."
sidebar:
  order: 8
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Nur lesbar. Personen werden in der App hinzugefügt und entfernt. Jeder Aufruf braucht den genannten Scope und einen Key (oder ein Token) von jemandem, der das in der App darf. Siehe [Anmeldung und Grundlagen](../integrations/api.md).

## `GET /api/v1/workspaces/{id}/members`

Scope: `members:read`

Listet alle Mitglieder eines Workspace.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Workspace. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/members" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    {
      "id": "u_7h3j2k",
      "name": "Priya Shah",
      "email": "priya@example.com",
      "handle": "priya",
      "role": "admin"
    }
  ]
}
```

## `GET /api/v1/projects/{id}/members`

Scope: `members:read`

Listet alle Mitglieder eines Projekts — die eigenen Mitgliedschaften des Projekts. Workspace-Owner/-Admins, die ein privates Projekt sehen, ohne dort eingetragen zu sein, erscheinen hier nicht.

**Pfad-Parameter**

| Name | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `id` | `string` | ja | Die ID des Projekts. |

**Beispiel**

```bash
curl "$BARYNT_URL/api/v1/projects/$PROJECT_ID/members" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Antwort**

```json
{
  "data": [
    {
      "id": "u_7h3j2k",
      "name": "Priya Shah",
      "email": "priya@example.com",
      "handle": "priya",
      "role": "contributor"
    }
  ]
}
```
