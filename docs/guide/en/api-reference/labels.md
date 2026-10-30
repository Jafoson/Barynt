---
title: "Labels"
description: "REST API: list, create, change and delete labels."
sidebar:
  order: 7
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

Labels belong to a workspace and can be put on any issue in it. Every call needs the scope shown and a key (or token) that belongs to someone who may do this in the app. See [Authentication and basics](../integrations/api.md).

## `GET /api/v1/workspaces/{id}/labels`

Scope: `labels:read`

List every label visible in a workspace — workspace-wide labels plus those of every project you can see.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/labels" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

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

Create a label. Omit projectId for a workspace-wide label that applies everywhere.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | yes |  |
| `color` | `string` | yes | A hex color. |
| `projectId` | `string` |  | Scope the label to a single project instead of the whole workspace. |

**Example**

```bash
curl -X POST "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/labels" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "frontend", "color": "#3b7bd5", "projectId": "proj_9f8e7d" }'
```

**Request**

```json
{
  "name": "frontend",
  "color": "#3b7bd5",
  "projectId": "proj_9f8e7d"
}
```

**Response**

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

Update a label's name and/or color. Every field is optional — send only what changes.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The label's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` |  |  |
| `color` | `string` |  | A hex color. |

**Example**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/labels/$LABEL_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "frontend", "color": "#e0992b" }'
```

**Request**

```json
{
  "name": "frontend",
  "color": "#e0992b"
}
```

**Response**

```json
{
  "data": { "id": "l_9f2a1b" }
}
```

## `DELETE /api/v1/labels/{id}`

Scope: `labels:write`

Delete a label and remove it from every issue it's attached to.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The label's id. |

**Example**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/labels/$LABEL_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": { "id": "l_9f2a1b" }
}
```
