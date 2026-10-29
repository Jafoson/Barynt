---
title: "Members"
description: "REST API: the people of a workspace or a project."
sidebar:
  order: 8
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

Read-only. People are added and removed in the app. Every call needs the scope shown and a key (or token) that belongs to someone who may do this in the app. See [Authentication and basics](../integrations/api.md).

## `GET /api/v1/workspaces/{id}/members`

Scope: `members:read`

List every member of a workspace.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/members" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

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

List every member of a project — the project's own membership rows. A workspace owner/admin who can reach into a private project without being listed there explicitly won't appear here.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The project's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/projects/$PROJECT_ID/members" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

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
