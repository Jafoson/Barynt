---
title: "Webhook-Ereignisse"
description: "Alle Ereignisse, die Barynt per Webhook meldet, jeweils mit einer Beispiel-Nachricht."
sidebar:
  order: 11
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Jede Nachricht ist ein `POST` mit JSON-Body `{ event, timestamp, data }` und signiert, siehe [Webhooks](../integrations/webhooks.md). Hier steht, was in `data` steckt.

## `issue.created`

Ein Issue wurde angelegt, in der App oder über diese API.

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

Ein Issue hat sich geändert — das vollständige aktuelle Issue, kein Diff der Änderungen.

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

Ein Issue wurde gelöscht — eine knappe Momentaufnahme statt des vollen Objekts, weil das Issue nicht mehr existiert.

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

Ein Kommentar wurde zu einem Issue hinzugefügt, in der App oder über diese API.

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

Eine geteilte View (Projekt oder Workspace) wurde gespeichert. Private Views senden nie Events.

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

Eine geteilte View hat sich geändert — die vollständige gespeicherte View. Kommt auch, wenn eine geteilte View privat wird; visibility ist dann PRIVATE.

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

Eine geteilte View wurde gelöscht — eine knappe Momentaufnahme.

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
