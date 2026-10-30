---
title: "Workspaces"
description: "REST API: list, create, change and delete workspaces."
sidebar:
  order: 1
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

A workspace is the top level: it holds projects, members, labels and statuses. Every call needs the scope shown and a key (or token) that belongs to someone who may do this in the app. See [Authentication and basics](../integrations/api.md).

## `GET /api/v1/workspaces`

Scope: `workspaces:read`

List the workspaces you belong to.

**Example**

```bash
curl "$BARYNT_URL/api/v1/workspaces" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

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

Create a workspace. You become its owner. Unlike creating one in the app, this does not also create a first project — create one explicitly via the projects endpoint below.

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | yes |  |
| `slug` | `string` | yes | Lowercase letters, numbers, and hyphens. Appended with a number if already taken. |
| `color` | `string` |  | A hex color. Default "#6e63e6". |

**Example**

```bash
curl -X POST "$BARYNT_URL/api/v1/workspaces" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Inc", "slug": "acme", "color": "#6e63e6" }'
```

**Request**

```json
{
  "name": "Acme Inc",
  "slug": "acme",
  "color": "#6e63e6"
}
```

**Response**

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

Update a workspace. Every field is optional — send only what changes.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` |  |  |
| `color` | `string` |  | A hex color. |
| `desc` | `string` |  | A one-sentence description. |

**Example**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Corp", "color": "#3b7bd5", "desc": "Product and marketing, together." }'
```

**Request**

```json
{
  "name": "Acme Corp",
  "color": "#3b7bd5",
  "desc": "Product and marketing, together."
}
```

**Response**

```json
{
  "data": { "id": "acme" }
}
```

## `DELETE /api/v1/workspaces/{id}`

Scope: `workspaces:write`

Delete a workspace, along with every project and issue in it. This cannot be undone.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Example**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": { "id": "acme" }
}
```
