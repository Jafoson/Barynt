---
title: "Projects"
description: "REST API: list, create, change and delete projects."
sidebar:
  order: 2
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

Projects hold the issues. They belong to one workspace. Every call needs the scope shown and a key (or token) that belongs to someone who may do this in the app. See [Authentication and basics](../integrations/api.md).

## `GET /api/v1/workspaces/{id}/projects`

Scope: `projects:read`

List the projects in a workspace that you can see.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/projects" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

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

Create a project in a workspace.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | yes |  |
| `desc` | `string` |  | A one-sentence description. |
| `prefix` | `string` |  | Up to 4 letters, used in issue refs (e.g. "WEB"). Derived from the name if omitted, appended with a number if already taken. |
| `color` | `string` | yes | A hex color. |
| `visibility` | `"public" \| "private"` |  | A public project enrolls every workspace member. Default "public". |

**Example**

```bash
curl -X POST "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/projects" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Website Relaunch", "desc": "Marketing site rebuild for Q2.", "prefix": "WEB", "color": "#3b7bd5", "visibility": "public" }'
```

**Request**

```json
{
  "name": "Website Relaunch",
  "desc": "Marketing site rebuild for Q2.",
  "prefix": "WEB",
  "color": "#3b7bd5",
  "visibility": "public"
}
```

**Response**

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

Update a project. Every field is optional — send only what changes.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The project's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` |  |  |
| `desc` | `string` |  |  |
| `prefix` | `string` |  | Up to 4 letters. |
| `color` | `string` |  | A hex color. |
| `visibility` | `"public" \| "private"` |  |  |

**Example**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Website Relaunch 2.0", "desc": "Now with a checkout redesign.", "prefix": "WEB2", "color": "#3b7bd5", "visibility": "private" }'
```

**Request**

```json
{
  "name": "Website Relaunch 2.0",
  "desc": "Now with a checkout redesign.",
  "prefix": "WEB2",
  "color": "#3b7bd5",
  "visibility": "private"
}
```

**Response**

```json
{
  "data": { "id": "proj_9f8e7d" }
}
```

## `DELETE /api/v1/projects/{id}`

Scope: `projects:write`

Delete a project, along with every issue in it. This cannot be undone.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The project's id. |

**Example**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": { "id": "proj_9f8e7d" }
}
```
