---
title: "Comments"
description: "REST API: list, write, change and delete comments on an issue."
sidebar:
  order: 5
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

Comments and replies on an issue. Every call needs the scope shown and a key (or token) that belongs to someone who may do this in the app. See [Authentication and basics](../integrations/api.md).

## `GET /api/v1/issues/{id}/comments`

Scope: `comments:read`

List the comments on an issue, oldest first.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The issue's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/issues/$ISSUE_ID/comments" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": [
    {
      "id": "c_5m9p3q",
      "issueId": "i_4k2n1x",
      "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
      "parentId": null,
      "body": "Confirmed on Safari 17.",
      "created": "2026-03-02T10:05:00.000Z",
      "updated": null
    }
  ]
}
```

## `POST /api/v1/issues/{id}/comments`

Scope: `comments:write`

Create a comment on an issue. The author is always the token's owner, never a body field.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The issue's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `body` | `string` | yes | Markdown, converted server-side. `@handle` mentions a workspace member (notifies them, except on comment edits); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label\|https://...]` (or bare `[https://...]`) becomes a link chip. All resolve server-side; unresolved ones are left as plain text. |
| `parentId` | `string` |  | A comment id to reply to. Omit for a top-level comment. |

**Example**

```bash
curl -X POST "$BARYNT_URL/api/v1/issues/$ISSUE_ID/comments" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "body": "Confirmed on Safari 17.", "parentId": "c_1a2b3c" }'
```

**Request**

```json
{
  "body": "Confirmed on Safari 17.",
  "parentId": "c_1a2b3c"
}
```

**Response**

```jsonc
// 201 Created
{
  "data": {
    "id": "c_5m9p3q",
    "issueId": "i_4k2n1x",
    "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "parentId": null,
    "body": "Confirmed on Safari 17.",
    "created": "2026-03-04T15:40:00.000Z",
    "updated": null
  }
}
```

## `PATCH /api/v1/comments/{id}`

Scope: `comments:write`

Update a comment. You can always edit your own; editing someone else's additionally requires the comment.update.any permission on your role.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The comment's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `body` | `string` | yes | Markdown, converted server-side. `@handle` mentions a workspace member (notifies them, except on comment edits); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label\|https://...]` (or bare `[https://...]`) becomes a link chip. All resolve server-side; unresolved ones are left as plain text. |

**Example**

```bash
curl -X PATCH "$BARYNT_URL/api/v1/comments/$COMMENT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "body": "Confirmed on Safari 17 and 18." }'
```

**Request**

```json
{
  "body": "Confirmed on Safari 17 and 18."
}
```

**Response**

```json
{
  "data": { "id": "c_5m9p3q" }
}
```

## `DELETE /api/v1/comments/{id}`

Scope: `comments:write`

Delete a comment and its replies. You can always delete your own; deleting someone else's additionally requires the comment.delete.any permission on your role.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The comment's id. |

**Example**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/comments/$COMMENT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": { "id": "c_5m9p3q" }
}
```
