---
title: "Statuses, priorities and types"
description: "REST API: the values an issue's status, priority and type can take."
sidebar:
  order: 4
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

Read-only lists. Use them to find the ids you put into issues and filters. Every call needs the scope shown and a key (or token) that belongs to someone who may do this in the app. See [Authentication and basics](../integrations/api.md).

## `GET /api/v1/workspaces/{id}/statuses`

Scope: `workspaces:read`

List a workspace's statuses in board order, each with its category — backlog, unstarted, started, completed or canceled. Categories are the same in every workspace; status ids and names are not.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/statuses" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

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

List a workspace's priorities in order. The `id` is the number `priority` takes when you create or update an issue.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/priorities" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

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

List a workspace's issue types in order. The `id` is what `type` takes when you create or update an issue.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/issue-types" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": [
    { "id": "feature", "name": "Feature", "color": "#4a9d6f", "position": 1 },
    { "id": "bug", "name": "Bug", "color": "#d1495b", "position": 2 }
  ]
}
```
