---
title: "Webhook events"
description: "Every event Barynt sends to a webhook, each with an example message."
sidebar:
  order: 11
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

Every message is a `POST` with the JSON body `{ event, timestamp, data }`, signed as described in [Webhooks](../integrations/webhooks.md). This page shows what is in `data`.

## `issue.created`

An issue was created, via the app or this API.

```json
{
  "event": "issue.created",
  "timestamp": 1772870400000,
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
    "closedAt": null
  }
}
```

## `issue.updated`

An issue changed — the full current issue, not a diff of just what changed.

```json
{
  "event": "issue.updated",
  "timestamp": 1772870400000,
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "done",
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
    "updated": "2026-03-05T11:02:00.000Z",
    "closedAt": "2026-03-05T11:02:00.000Z"
  }
}
```

## `issue.deleted`

An issue was deleted — a minimal snapshot, not the full shape, since the issue no longer exists to look up.

```json
{
  "event": "issue.deleted",
  "timestamp": 1772870400000,
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "projectId": "proj_9f8e7d",
    "title": "Fix broken checkout flow"
  }
}
```

## `comment.created`

A comment was added to an issue, via the app or this API.

```json
{
  "event": "comment.created",
  "timestamp": 1772870400000,
  "data": {
    "id": "c_5m9p3q",
    "issueId": "i_4k2n1x",
    "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "parentId": null,
    "body": "Confirmed on Safari 17.",
    "created": "2026-03-02T10:05:00.000Z",
    "updated": null
  }
}
```

## `view.created`

A shared view (project or workspace) was saved. Private views never send events.

```json
{
  "event": "view.created",
  "timestamp": 1772870400000,
  "data": {
    "id": "v_3c9d1e",
    "name": "Urgent bugs",
    "slug": "urgent-bugs",
    "workspaceId": "ws_1a2b3c",
    "projectId": "proj_9f8e7d",
    "ownerId": "u_7h3j2k",
    "visibility": "PROJECT",
    "layout": "list",
    "filter": {
      "op": "and",
      "rules": [{ "field": "priority", "is": "gte", "value": 3 }]
    },
    "groupBy": "status",
    "sortBy": "priority",
    "sortDir": "desc",
    "updatedAt": "2026-10-12T14:20:00.000Z"
  }
}
```

## `view.updated`

A shared view changed — the full stored view. Also sent when a shared view goes private; visibility then says PRIVATE.

```json
{
  "event": "view.updated",
  "timestamp": 1772870400000,
  "data": {
    "id": "v_3c9d1e",
    "name": "Urgent bugs (P1+)",
    "slug": "urgent-bugs",
    "workspaceId": "ws_1a2b3c",
    "projectId": "proj_9f8e7d",
    "ownerId": "u_7h3j2k",
    "visibility": "PROJECT",
    "layout": "list",
    "filter": {
      "op": "and",
      "rules": [{ "field": "priority", "is": "gte", "value": 3 }]
    },
    "groupBy": "status",
    "sortBy": "priority",
    "sortDir": "desc",
    "updatedAt": "2026-10-12T14:20:00.000Z"
  }
}
```

## `view.deleted`

A shared view was deleted — a minimal snapshot.

```json
{
  "event": "view.deleted",
  "timestamp": 1772870400000,
  "data": {
    "id": "v_3c9d1e",
    "name": "Urgent bugs",
    "workspaceId": "ws_1a2b3c",
    "projectId": "proj_9f8e7d"
  }
}
```
