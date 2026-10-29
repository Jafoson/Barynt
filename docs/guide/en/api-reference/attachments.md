---
title: "Attachments"
description: "REST API: list, add (file or link), read and remove attachments of an issue."
sidebar:
  order: 6
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

Files and links attached to an issue. Every call needs the scope shown and a key (or token) that belongs to someone who may do this in the app. See [Authentication and basics](../integrations/api.md).

## `GET /api/v1/issues/{id}/attachments`

Scope: `issues:read`

List an issue's attachments (files and links), oldest first. `url` is where to view each one: a link's own address, or for a file a signed download URL that needs no token and works until `urlExpiresAt` (one hour) — fetch again for a fresh one.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The issue's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/issues/$ISSUE_ID/attachments" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```jsonc
{
  "data": [
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
    },
    {
      "id": "att_8k2m4n",
      "issueId": "i_4k2n1x",
      "kind": "link",
      "name": "github.com",
      "url": "https://github.com/acme/web/pull/812",
      "urlExpiresAt": null,
      "mimeType": null,
      "size": null,
      "author": { "id": "u_7h3j2k", "name": "Priya Shah" },
      "created": "2026-03-03T08:30:00.000Z"
    }
  ]
}
```

## `POST /api/v1/issues/{id}/attachments`

Scope: `issues:write`

Attach a link or a file — exactly one of `url`, `content` or `key`. A file up to 10 MB can come inline as base64; a larger one (up to 100 MB) is uploaded first via POST /api/v1/issues/{id}/attachments/uploads and then created here with its `key`. Needs the right to edit the issue. Errors name the reason: invalid_source, invalid_url, invalid_name, invalid_content, too_large, upload_rejected.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The issue's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | `string` |  | A link attachment: an http(s) address. |
| `content` | `string` |  | A file inline: its bytes as base64, or a data: URL (which also sets `mimeType`). Up to 10 MB. |
| `key` | `string` |  | A file uploaded beforehand — the `key` from the uploads endpoint, after the PUT. |
| `name` | `string` |  | The file name, e.g. screenshot.png — required for a file. For a link it defaults to the host. |
| `mimeType` | `string` |  | e.g. image/png. Guessed from the file name if omitted. |

**Example**

```bash
curl -X POST "$BARYNT_URL/api/v1/issues/$ISSUE_ID/attachments" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "safari-checkout.png", "content": "iVBORw0KGgoAAAANSUhEUgAA…" }'
```

**Request**

```json
{
  "name": "safari-checkout.png",
  "content": "iVBORw0KGgoAAAANSUhEUgAA…"
}
```

**Response**

```jsonc
// 201 Created
{
  "data": {
    "id": "att_3f9c1d",
    "issueId": "i_4k2n1x",
    "kind": "file",
    "name": "safari-checkout.png",
    "url": "https://files.example.com/issues/attachments/i_4k2n1x/…?X-Amz-Signature=…",
    "urlExpiresAt": "2026-03-04T16:40:00.000Z",
    "mimeType": "image/png",
    "size": 184213,
    "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "created": "2026-03-04T15:40:00.000Z"
  }
}
```

## `POST /api/v1/issues/{id}/attachments/uploads`

Scope: `issues:write`

Step one for a large file (up to 100 MB): returns an `uploadUrl` to PUT the bytes to directly, with the given `headers`, within 2 minutes. Then create the attachment with POST /api/v1/issues/{id}/attachments and the returned `key`.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The issue's id. |

**Body**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fileName` | `string` | yes | The file's name. |
| `contentLength` | `number` | yes | Size in bytes. |
| `contentType` | `string` |  | MIME type. Guessed from the file name if omitted. |

**Example**

```bash
curl -X POST "$BARYNT_URL/api/v1/issues/$ISSUE_ID/attachments/uploads" \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "fileName": "screen-recording.mp4", "contentLength": 48213004 }'
```

**Request**

```json
{
  "fileName": "screen-recording.mp4",
  "contentLength": 48213004
}
```

**Response**

```jsonc
// 201 Created
{
  "data": {
    "key": "attachments/i_4k2n1x/6f1c…e2.mp4",
    "uploadUrl": "https://files.example.com/issues/attachments/i_4k2n1x/6f1c…e2.mp4?X-Amz-Signature=…",
    "method": "PUT",
    "headers": { "Content-Type": "video/mp4" },
    "expiresAt": "2026-03-04T15:42:00.000Z"
  }
}
```

## `GET /api/v1/attachments/{id}`

Scope: `issues:read`

Get one attachment with a freshly signed `url` — for when an earlier one has expired.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The attachment's id. |

**Example**

```bash
curl "$BARYNT_URL/api/v1/attachments/$ATTACHMENT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```jsonc
{
  "data": {
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
}
```

## `DELETE /api/v1/attachments/{id}`

Scope: `issues:write`

Remove an attachment; a file is deleted from storage too. Needs the right to edit the issue.

**Path parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | The attachment's id. |

**Example**

```bash
curl -X DELETE "$BARYNT_URL/api/v1/attachments/$ATTACHMENT_ID" \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

**Response**

```json
{
  "data": { "id": "att_3f9c1d" }
}
```
