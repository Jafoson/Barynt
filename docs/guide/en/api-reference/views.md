---
title: "Views"
description: "REST API: saved views, and the issues a view shows."
sidebar:
  order: 9
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

A view stores a filter, grouping and sorting under a name. Its filter uses the [filter language](filters.md). Every call needs the scope shown and a key (or token) that belongs to someone who may do this in the app. See [Authentication and basics](../integrations/api.md).

## `GET /api/v1/projects/{id}/views`

Scope: `views:read`

List a project's saved views you can see — shared ones and your own private ones, in tab order.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The project's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/projects/$PROJECT_ID/views" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": [
    {
      "id": "v_3c9d1e",
      "name": "Urgent bugs",
      "slug": "urgent-bugs",
      "systemKey": null,
      "workspaceId": "ws_1a2b3c",
      "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
      "owner": { "id": "u_7h3j2k", "name": "Priya Shah", "handle": "priya" },
      "visibility": "PROJECT",
      "layout": "list",
      "icon": null,
      "color": "#e05252",
      "filter": {
        "op": "and",
        "rules": [
          { "field": "type", "is": "any", "value": ["bug"] },
          { "field": "priority", "is": "gte", "value": 3 },
          { "field": "assignee", "is": "any", "value": ["@me"] }
        ]
      },
      "groupBy": "status",
      "subGroupBy": null,
      "sortBy": "priority",
      "sortDir": "desc",
      "createdAt": "2026-10-01T09:00:00.000Z",
      "updatedAt": "2026-10-12T14:20:00.000Z",
      "canEdit": true
    }
  ]
}
```

## `GET /api/v1/workspaces/{id}/views`

Scope: `views:read`

List a workspace's cross-project views you can see, including the built-in "My issues" and "Created by me" (systemKey set; they can't be changed).

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/views" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": [
    {
      "id": "v_8a1b2c",
      "name": "My issues",
      "slug": "my-issues",
      "systemKey": "my-issues",
      "project": null,
      "owner": null,
      "visibility": "WORKSPACE",
      "layout": "list",
      "filter": { "op": "and", "rules": [] },
      "canEdit": false
    }
  ]
}
```

## `GET /api/v1/views/{id}`

Scope: `views:read`

Fetch one view: its filter tree, layout, grouping and sort. "@me" in the filter stays as written — it means whoever asks.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The view's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/views/$VIEW_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": {
    "id": "v_3c9d1e",
    "name": "Urgent bugs",
    "slug": "urgent-bugs",
    "systemKey": null,
    "workspaceId": "ws_1a2b3c",
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "owner": { "id": "u_7h3j2k", "name": "Priya Shah", "handle": "priya" },
    "visibility": "PROJECT",
    "layout": "list",
    "icon": null,
    "color": "#e05252",
    "filter": {
      "op": "and",
      "rules": [
        { "field": "type", "is": "any", "value": ["bug"] },
        { "field": "priority", "is": "gte", "value": 3 },
        { "field": "assignee", "is": "any", "value": ["@me"] }
      ]
    },
    "groupBy": "status",
    "subGroupBy": null,
    "sortBy": "priority",
    "sortDir": "desc",
    "createdAt": "2026-10-01T09:00:00.000Z",
    "updatedAt": "2026-10-12T14:20:00.000Z",
    "canEdit": true
  }
}
```

## `GET /api/v1/views/{id}/issues`

Scope: `views:read`

The issues a view shows, as you'd see them in the app: its filter with your @me, its project (or your visible projects for a cross-project view), and a built-in view's fixed condition. Newest first, cursor-paginated. Needs issues:read as well.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The view's id. |

**Query parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fields` | `string` |  | Comma-separated allowlist of fields to return. |
| `cursor` | `string` |  | From the previous page's `nextCursor`. |
| `limit` | `integer` |  | Page size, 1–100. Default 25. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/views/$VIEW_ID/issues" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": [
    { "id": "i_4k2n1x", "ref": "WEB-42", "title": "Fix broken checkout flow", "status": "in_progress", "statusCategory": "started" }
  ],
  "nextCursor": null
}
```

## `POST /api/v1/projects/{id}/views`

Scope: `views:write`

Save a view in a project. Private unless visibility says otherwise.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The project's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | yes | Up to 80 characters. |
| `layout` | `"board" \| "list" \| "dashboard"` | yes |  |
| `visibility` | `"PRIVATE" \| "PROJECT" \| "WORKSPACE"` |  | Default PRIVATE (only you). PROJECT for a project view, WORKSPACE for a cross-project view — sharing needs the view.share permission. |
| `filter` | `object` |  | A filter tree — see [Filters](filters.md). |
| `groupBy` | `string \| null` |  | status, priority, assignee, type, label, project … |
| `sortBy` | `string` |  | manual, priority, created, updated, dueDate … |
| `sortDir` | `"asc" \| "desc"` |  |  |
| `icon` | `string \| null` |  |  |
| `color` | `string \| null` |  | A hex color. |

**Example**

```bash
curl -X POST "$BARYNT_URL/api/v1/projects/$PROJECT_ID/views" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Urgent bugs", "layout": "list", "visibility": "PROJECT", "filter": { "op": "and", "rules": [{ "field": "priority", "is": "gte", "value": 3 }] }, "sortBy": "priority", "sortDir": "desc" }'
```

**Request**

```json
{
  "name": "Urgent bugs",
  "layout": "list",
  "visibility": "PROJECT",
  "filter": {
    "op": "and",
    "rules": [{ "field": "priority", "is": "gte", "value": 3 }]
  },
  "sortBy": "priority",
  "sortDir": "desc"
}
```

**Response**

```jsonc
// 201 Created
{
  "data": { "id": "v_3c9d1e", "name": "Urgent bugs", "…": "…" }
}
```

## `POST /api/v1/workspaces/{id}/views`

Scope: `views:write`

Save a cross-project view in a workspace. Same body as for a project; visibility is PRIVATE or WORKSPACE.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The workspace's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | yes | Up to 80 characters. |
| `layout` | `"board" \| "list" \| "dashboard"` | yes |  |
| `visibility` | `"PRIVATE" \| "PROJECT" \| "WORKSPACE"` |  | Default PRIVATE (only you). PROJECT for a project view, WORKSPACE for a cross-project view — sharing needs the view.share permission. |
| `filter` | `object` |  | A filter tree — see [Filters](filters.md). |
| `groupBy` | `string \| null` |  | status, priority, assignee, type, label, project … |
| `sortBy` | `string` |  | manual, priority, created, updated, dueDate … |
| `sortDir` | `"asc" \| "desc"` |  |  |
| `icon` | `string \| null` |  |  |
| `color` | `string \| null` |  | A hex color. |

**Example**

```bash
curl -X POST "$BARYNT_URL/api/v1/workspaces/$WORKSPACE_ID/views" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Urgent bugs", "layout": "list", "visibility": "WORKSPACE", "filter": { "op": "and", "rules": [{ "field": "priority", "is": "gte", "value": 3 }] }, "sortBy": "priority", "sortDir": "desc" }'
```

**Request**

```json
{
  "name": "Urgent bugs",
  "layout": "list",
  "visibility": "WORKSPACE",
  "filter": {
    "op": "and",
    "rules": [{ "field": "priority", "is": "gte", "value": 3 }]
  },
  "sortBy": "priority",
  "sortDir": "desc"
}
```

**Response**

```jsonc
// 201 Created
{
  "data": { "id": "v_5e7f8a", "name": "Urgent bugs", "…": "…" }
}
```

## `PATCH /api/v1/views/{id}`

Scope: `views:write`

Change a view — only the fields you send. Private views: their owner. Shared views: their creator while they hold view.share, or anyone with view.manage; otherwise 403. Only the creator can make a shared view private again.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The view's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` |  |  |
| `visibility` | `"PRIVATE" \| "PROJECT" \| "WORKSPACE"` |  |  |
| `filter` | `object` |  | Replaces the whole tree. |
| `layout` | `string` |  |  |
| `groupBy` | `string \| null` |  |  |
| `sortBy` | `string` |  |  |
| `sortDir` | `"asc" \| "desc"` |  |  |

**Example**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/views/$VIEW_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Urgent bugs (P1+)", "filter": { "op": "and", "rules": [{ "field": "priority", "is": "gte", "value": 4 }] } }'
```

**Request**

```json
{
  "name": "Urgent bugs (P1+)",
  "filter": {
    "op": "and",
    "rules": [{ "field": "priority", "is": "gte", "value": 4 }]
  }
}
```

**Response**

```json
{
  "data": { "id": "v_3c9d1e", "name": "Urgent bugs (P1+)", "…": "…" }
}
```

## `DELETE /api/v1/views/{id}`

Scope: `views:write`

Delete a view — same rights as changing it. Built-in views can't be deleted.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The view's id. |

**Example**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/views/$VIEW_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": { "id": "v_3c9d1e" }
}
```
