---
title: "Issues and relations"
description: "REST API: list with filters and paging, read, create, change and delete issues, and link them to each other."
sidebar:
  order: 3
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

The issue list is paged and can be filtered, see [Filters](filters.md). Every call needs the scope shown and a key (or token) that belongs to someone who may do this in the app. See [Authentication and basics](../integrations/api.md).

## `GET /api/v1/projects/{id}/issues`

Scope: `issues:read`

List issues in a project, newest first, cursor-paginated.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The project's id. |

**Query parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | `string` |  | Filter by status key. |
| `assignee` | `string` |  | Filter by assignee user id. |
| `q` | `string` |  | Case-insensitive substring match against title and description. |
| `filter` | `string (JSON)` |  | A filter tree as JSON, URL-encoded — e.g. `{"op":"and","rules":[{"field":"priority","is":"gte","value":3}]}`. "@me" means you. How it works: [Filters](filters.md). 422 invalid_filter if it isn't a valid tree. |
| `fields` | `string` |  | Comma-separated allowlist, e.g. "id,title,status" — trims the response to just those keys ("id" always included). |
| `cursor` | `string` |  | From the previous page's `nextCursor`. |
| `limit` | `integer` |  | Page size, 1–100. Default 25. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/projects/$PROJECT_ID/issues" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": [
    {
      "id": "i_4k2n1x",
      "ref": "WEB-42",
      "title": "Fix broken checkout flow",
      "status": "in_progress",
      "statusCategory": "started",
      "priority": 2,
      "type": "bug",
      "labels": [
        { "id": "l_9f2a1b", "name": "frontend" }
      ],
      "assignee": { "id": "u_7h3j2k", "name": "Priya Shah" },
      "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
      "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
      "description": "Checkout fails on Safari when …",
      "created": "2026-03-01T09:12:00.000Z",
      "updated": "2026-03-04T15:40:00.000Z",
      "closedAt": null,
      "dueDate": "2026-03-10T00:00:00.000Z",
      "storyPoints": 5,
      "estimateHours": 8,
      "estimateUnit": "days",
      "commentCount": 0,
      "attachmentCount": 0,
      "parent": null,
      "children": [],
      "relations": []
    }
  ],
  "nextCursor": "eyJpZCI6ImlfNGsybjF4In0"
}
```

## `POST /api/v1/projects/{id}/issues`

Scope: `issues:write`

Create an issue. The reporter is always the token's owner, never a body field.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The project's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | `string` | yes |  |
| `description` | `string` |  | Markdown, converted server-side. `@handle` mentions a workspace member (notifies them, except on comment edits); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label\|https://...]` (or bare `[https://...]`) becomes a link chip. All resolve server-side; unresolved ones are left as plain text. |
| `status` | `string` |  | A status key of the project. Default "backlog". |
| `priority` | `integer` |  | 0–4. Default 0. |
| `assignee` | `string \| null` |  | A user id, or null. |
| `labels` | `string[]` |  | Label ids. |
| `type` | `string` |  | An issue type key. Default "feature". |
| `parentId` | `string \| null` |  | Makes the new issue a sub-issue of this one right away. |
| `dueDate` | `string \| null` |  | ISO 8601 date, e.g. "2026-09-20". |
| `storyPoints` | `integer \| null` |  | Typically a Fibonacci value (1/2/3/5/8/13), not enforced. |
| `estimateHours` | `number \| null` |  | Normalized to hours, e.g. 2.5. |
| `estimateUnit` | `"hours" \| "days" \| "weeks" \| "months" \| "years" \| null` |  | Which unit estimateHours was entered in. Default "hours" — a display hint only, doesn't change what estimateHours means. |

**Example**

```bash
curl -X POST "$BARYNT_URL/api/v1/projects/$PROJECT_ID/issues" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Fix broken checkout flow", "description": "Checkout fails on Safari when the discount code field is empty.", "status": "todo", "priority": 2, "assignee": "u_7h3j2k", "labels": ["l_9f2a1b"], "type": "bug" }'
```

**Request**

```json
{
  "title": "Fix broken checkout flow",
  "description": "Checkout fails on Safari when the discount code field is empty.",
  "status": "todo",
  "priority": 2,
  "assignee": "u_7h3j2k",
  "labels": ["l_9f2a1b"],
  "type": "bug"
}
```

**Response**

```jsonc
// 201 Created
{
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "backlog",
    "priority": 2,
    "type": "feature",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend" }
    ],
    "assignee": null,
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-04T15:40:00.000Z",
    "updated": "2026-03-04T15:40:00.000Z",
    "closedAt": null,
    "dueDate": null,
    "storyPoints": null,
    "estimateHours": null,
    "estimateUnit": null,
    "commentCount": 0,
    "attachmentCount": 0,
    "parent": null,
    "children": [],
    "relations": []
  }
}
```

## `GET /api/v1/issues/{id}`

Scope: `issues:read`

Get a single issue by internal id or "PREFIX-123" ref (e.g. "WEB-42") — tried as an id first, so a ref is only resolved once a matching id lookup misses. `description` is Markdown, the same dialect it's written in. Comments aren't embedded: `commentCount` says how many there are (0 = none) — when it's above 0, fetch them from GET /api/v1/issues/{id}/comments. Attachments are: `attachments` lists every file and link with a `url` to view it (for a file a signed download link, valid until `urlExpiresAt`).

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The issue's id. |

**Query parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fields` | `string` |  | Comma-separated allowlist, e.g. "id,title,status" — trims the response to just those keys ("id" always included). |

**Example**

```bash
curl "$BARYNT_URL/api/v1/issues/$ISSUE_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```jsonc
{
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "in_progress",
    "priority": 2,
    "type": "bug",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend" }
    ],
    "assignee": { "id": "u_7h3j2k", "name": "Priya Shah" },
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-01T09:12:00.000Z",
    "updated": "2026-03-04T15:40:00.000Z",
    "closedAt": null,
    "dueDate": "2026-03-10T00:00:00.000Z",
    "storyPoints": 5,
    "estimateHours": 8,
    "estimateUnit": "days",
    "commentCount": 1,
    "attachmentCount": 1,
    "attachments": [
      {
        "id": "att_3f9c1d",
        "issueId": "i_4k2n1x",
        "kind": "file",
        "name": "safari-checkout.png",
        "url": "https://files.example.com/issues/attachments/i_4k2n1x/…?X-Amz-Signature=…",
        "urlExpiresAt": "2026-03-04T16:40:00.000Z",
        "mimeType": "image/png",
        "size": 184213,
        "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
        "created": "2026-03-02T10:07:00.000Z"
      }
    ],
    "parent": null,
    "children": [
      { "id": "i_2b7c4d", "ref": "WEB-51", "title": "Safari-only regression", "status": "todo" }
    ],
    "relations": [
      {
        "id": "ir_8n3k2m",
        "type": "BLOCKS",
        "direction": "incoming",
        "issue": { "id": "i_9x1y2z", "ref": "WEB-40", "title": "Ship the discount banner", "status": "in_progress" }
      }
    ]
  }
}
```

## `PATCH /api/v1/issues/{id}`

Scope: `issues:write`

Update an issue. Every field is optional — send only what changes. Re-assigning also requires the `issue.assign` permission on your own role.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The issue's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | `string` |  |  |
| `description` | `string` |  | Markdown, converted server-side. `@handle` mentions a workspace member (notifies them, except on comment edits); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label\|https://...]` (or bare `[https://...]`) becomes a link chip. All resolve server-side; unresolved ones are left as plain text. |
| `status` | `string` |  | A status key of the project. |
| `priority` | `integer` |  | 0–4. |
| `assignee` | `string \| null` |  | A user id, or null to unassign. |
| `labels` | `string[]` |  | Label ids. |
| `type` | `string` |  | An issue type key. |
| `parentId` | `string \| null` |  | Sets the issue's parent (sub-issue of); null clears it. Rejected (422) if it would create a cycle. |
| `dueDate` | `string \| null` |  | ISO 8601 date, e.g. "2026-09-20"; null clears it. |
| `storyPoints` | `integer \| null` |  | Typically a Fibonacci value (1/2/3/5/8/13), not enforced. |
| `estimateHours` | `number \| null` |  | Normalized to hours, e.g. 2.5. null clears it (and estimateUnit with it). |
| `estimateUnit` | `"hours" \| "days" \| "weeks" \| "months" \| "years" \| null` |  | Relabels estimateHours's display unit, independent of whether estimateHours itself changes in the same request. Omitted alongside a new estimateHours defaults to "hours". |

**Example**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/issues/$ISSUE_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Fix broken checkout flow", "description": "Checkout fails on Safari when the discount code field is empty.", "status": "in_progress", "statusCategory": "started", "priority": 2, "assignee": "u_7h3j2k", "labels": ["l_9f2a1b"], "type": "bug" }'
```

**Request**

```json
{
  "title": "Fix broken checkout flow",
  "description": "Checkout fails on Safari when the discount code field is empty.",
  "status": "in_progress",
  "statusCategory": "started",
  "priority": 2,
  "assignee": "u_7h3j2k",
  "labels": ["l_9f2a1b"],
  "type": "bug"
}
```

**Response**

```json
{
  "data": { "id": "i_4k2n1x" }
}
```

## `POST /api/v1/issues/{id}/relations`

Scope: `issues:write`

Link two issues with a typed edge: BLOCKS, RELATES_TO, or DUPLICATES. The edge is added from {id}'s point of view — for BLOCKS/DUPLICATES that means {id} blocks/duplicates `relatedId`. RELATES_TO has no real direction; adding it either way produces the same edge.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The issue's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `relatedId` | `string` | yes | The other issue's id. |
| `type` | `"BLOCKS" \| "RELATES_TO" \| "DUPLICATES"` | yes |  |

**Example**

```bash
curl -X POST "$BARYNT_URL/api/v1/issues/$ISSUE_ID/relations" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "relatedId": "i_9x1y2z", "type": "BLOCKS" }'
```

**Request**

```json
{
  "relatedId": "i_9x1y2z",
  "type": "BLOCKS"
}
```

**Response**

```jsonc
// 201 Created
{
  "data": { "id": "ir_8n3k2m" }
}
```

## `DELETE /api/v1/relations/{id}`

Scope: `issues:write`

Remove a relation edge (its own id, from an issue's `relations`) — removable from either issue it connects.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The relation's id. |

**Example**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/relations/$RELATION_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": { "id": "ir_8n3k2m" }
}
```
