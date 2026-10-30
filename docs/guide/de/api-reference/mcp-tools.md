---
title: "MCP-Tools"
description: "Alle Tools des Barynt-MCP-Servers mit Scope und Argumenten."
sidebar:
  order: 12
---

<!-- Aus den Referenzdaten der API erzeugt. Nicht von Hand ändern. (scripts/docs-api/generate.ts) -->

Jedes Tool entspricht einem Aufruf der REST-API, mit denselben Scopes, Rechten und Antworten. Argumente sind eine flache Liste; ein `*` markiert Pflichtangaben. Wie du einen Client verbindest, steht unter [MCP-Server](../integrations/mcp.md).

## Workspaces

### `list_workspaces`

Scope: `workspaces:read`

Listet alle Workspaces, in denen du Mitglied bist.

### `create_workspace`

Scope: `workspaces:write`

Legt einen neuen Workspace an, du wirst sein Owner.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `name` \* | `string` | Display name. |
| `slug` \* | `string` | URL slug; also becomes the workspace id. |
| `color` | `string` | Hex color, e.g. #6e63e6. |

### `update_workspace`

Scope: `workspaces:write`

Ändert Name, Farbe oder Beschreibung eines Workspace.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |
| `name` | `string` |  |
| `color` | `string` |  |
| `desc` | `string` |  |

### `delete_workspace`

Scope: `workspaces:write`

Löscht einen Workspace endgültig, samt allen Projekten und Issues.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

## Projekte

### `list_projects`

Scope: `projects:read`

Listet die Projekte eines Workspace, die du sehen kannst.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

### `create_project`

Scope: `projects:write`

Legt ein neues Projekt in einem Workspace an.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |
| `name` \* | `string` |  |
| `desc` | `string` |  |
| `prefix` | `string` | Issue key prefix, e.g. "ENG" for ENG-123. Derived from the name if omitted. |
| `color` \* | `string` | Hex color, e.g. #6e63e6. |
| `visibility` | `"public" \| "private"` |  |

### `update_project`

Scope: `projects:write`

Ändert Name, Präfix, Farbe oder Sichtbarkeit eines Projekts.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `projectId` \* | `string` |  |
| `name` | `string` |  |
| `desc` | `string` |  |
| `prefix` | `string` |  |
| `color` | `string` |  |
| `visibility` | `"public" \| "private"` |  |

### `delete_project`

Scope: `projects:write`

Löscht ein Projekt endgültig, samt allen Issues.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `projectId` \* | `string` |  |

## Issues und Beziehungen

### `list_issues`

Scope: `issues:read`

Listet die Issues eines Projekts, wahlweise gefiltert nach Status, Zuständigem, Textsuche oder Filterbaum (`filter`). Mit `viewId` die Issues einer gespeicherten View (braucht zusätzlich views:read); `@me` bist du.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `projectId` | `string` | Required unless viewId is given. |
| `viewId` | `string` | A saved view's id (list_views) — its filter, project and fixed conditions apply. |
| `filter` | `any` | A filter tree, as views store it: { "op": "and"\|"or", "rules": [ { "field": "priority", "is": "gte", "value": 3 }, { "op": "or", "rules": [...] } ] }. Values like "@me" resolve to you; values are ids, not names. Fields: status, statusCategory, priority, type, assignee, reporter, label, project, storyPoints, estimate, dueDate, created, updated, parent, text. Ignored with viewId. |
| `status` | `string` |  |
| `assignee` | `string` | User id. |
| `q` | `string` | Case-insensitive substring match against title and description. |
| `cursor` | `string` | Opaque cursor from a previous call's `nextCursor`. |
| `limit` | `integer (1–100)` | Max rows to return (default 25, max 100). |
| `fields` | `string` | Comma-separated allowlist of fields to return, e.g. "id,title,status". |

### `create_issue`

Scope: `issues:write`

Legt ein neues Issue in einem Projekt an. In der Beschreibung kannst du ein Workspace-Mitglied per @handle erwähnen, ein anderes Issue per #PREFIX-123 verlinken, mit //2026-08-14 (oder //14.8.2026) ein Datum setzen und mit [label|https://...] einen Link — alles wird zu echten, klickbaren Chips, und eine Erwähnung benachrichtigt die Person.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `projectId` \* | `string` |  |
| `title` \* | `string` |  |
| `description` | `string` | Markdown. `@handle` mentions a workspace member (notifies them); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label\|https://...]` (or bare `[https://...]`) becomes a link chip. All resolved server-side; unresolved ones are left as plain text. |
| `status` | `string` | A status id — see list_statuses. |
| `priority` | `integer (-9007199254740991–9007199254740991)` | A priority id — see list_priorities. |
| `assignee` | `string \| null` | User id. |
| `labels` | `string[]` | Label ids. |
| `type` | `string` | An issue type id — see list_issue_types. |
| `parentId` | `string \| null` | Makes the new issue a sub-issue of this one right away. |
| `dueDate` | `string \| null` | ISO 8601 date, e.g. "2026-09-20". |
| `storyPoints` | `integer (-9007199254740991–9007199254740991)` | Typically a Fibonacci value (1/2/3/5/8/13). |
| `estimateHours` | `number \| null` | Normalized to hours, e.g. 2.5. |
| `estimateUnit` | `"hours" \| "days" \| "weeks" \| "months" \| "years"` | Which unit estimateHours was entered in. Defaults to hours. |

### `get_issue`

Scope: `issues:read`

Holt ein einzelnes Issue über ID oder Kennung. Enthält `commentCount`; ist es größer als 0, steht in der Antwort zusätzlich ein `hint`, der den Agenten anweist, vor dem Handeln `list_comments` aufzurufen. Anhänge kommen unter `attachments` mit, jeder mit einer `url` zum Ansehen.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `issueId` \* | `string` | Internal id, or a ref like "ENG-123". |
| `fields` | `string` | Comma-separated allowlist of fields to return, e.g. "id,title,status". |

### `update_issue`

Scope: `issues:write`

Ändert Titel, Beschreibung, Status, Priorität, Zuständigen, Labels oder Typ eines Issues. Die Beschreibung kennt dieselbe Syntax für Erwähnung, Issue-Link, Datum und Link-Chip wie create_issue.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `issueId` \* | `string` |  |
| `title` | `string` |  |
| `description` | `string` | Markdown. `@handle` mentions a workspace member (notifies them); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label\|https://...]` (or bare `[https://...]`) becomes a link chip. All resolved server-side; unresolved ones are left as plain text. |
| `status` | `string` | A status id — see list_statuses. |
| `priority` | `integer (-9007199254740991–9007199254740991)` | A priority id — see list_priorities. |
| `assignee` | `string \| null` | User id. |
| `labels` | `string[]` | Label ids. |
| `type` | `string` | An issue type id — see list_issue_types. |
| `parentId` | `string \| null` | Sets the issue's parent (sub-issue of); `null` clears it. |
| `dueDate` | `string \| null` | ISO 8601 date, e.g. "2026-09-20"; `null` clears it. |
| `storyPoints` | `integer (-9007199254740991–9007199254740991)` | Typically a Fibonacci value (1/2/3/5/8/13). |
| `estimateHours` | `number \| null` | Normalized to hours, e.g. 2.5. `null` clears it. |
| `estimateUnit` | `"hours" \| "days" \| "weeks" \| "months" \| "years"` | Relabels estimateHours's display unit. Defaults to hours when set alongside a new estimateHours. |

### `add_issue_relation`

Scope: `issues:write`

Verknüpft zwei Issues mit einer typisierten Beziehung: BLOCKS, RELATES_TO oder DUPLICATES. Aus Sicht von issueId: Bei BLOCKS und DUPLICATES blockiert bzw. dupliziert issueId das Issue relatedId.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `issueId` \* | `string` |  |
| `relatedId` \* | `string` |  |
| `type` \* | `"BLOCKS" \| "RELATES_TO" \| "DUPLICATES"` |  |

### `remove_issue_relation`

Scope: `issues:write`

Entfernt eine Beziehung über ihre eigene ID (aus den relations eines Issues). Geht von beiden verbundenen Issues aus.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `relationId` \* | `string` |  |

## Status, Prioritäten und Typen

### `list_statuses`

Scope: `workspaces:read`

Die Status eines Workspace in Board-Reihenfolge, jeweils mit Kategorie (backlog, unstarted, started, completed, canceled).

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

### `list_priorities`

Scope: `workspaces:read`

Die Prioritäten eines Workspace in Reihenfolge. Eine `id` dient als `priority` in create_issue / update_issue.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

### `list_issue_types`

Scope: `workspaces:read`

Die Issue-Typen eines Workspace in Reihenfolge. Eine `id` dient als `type` in create_issue / update_issue.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

## Kommentare

### `list_comments`

Scope: `comments:read`

Listet alle Kommentare eines Issues, älteste zuerst.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `issueId` \* | `string` |  |

### `create_comment`

Scope: `comments:write`

Schreibt einen Kommentar zu einem Issue, wahlweise als Antwort. Kennt dieselbe Syntax für Erwähnung, Issue-Link, Datum und Link-Chip — siehe create_issue.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `issueId` \* | `string` |  |
| `body` \* | `string` | Markdown. `@handle` mentions a workspace member (notifies them); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label\|https://...]` (or bare `[https://...]`) becomes a link chip. All resolved server-side; unresolved ones are left as plain text. |
| `parentId` | `string` | Id of the comment being replied to. |

### `update_comment`

Scope: `comments:write`

Ändert den Text eines Kommentars. Erwähnungen, Issue-Links, Daten und Links werden weiter zu Chips, eine neue Erwähnung benachrichtigt aber (wie in der App) niemanden.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `commentId` \* | `string` |  |
| `body` \* | `string` | Markdown. `@handle` mentions a workspace member (notifies them); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label\|https://...]` (or bare `[https://...]`) becomes a link chip. All resolved server-side; unresolved ones are left as plain text. |

### `delete_comment`

Scope: `comments:write`

Löscht einen Kommentar (seine Antworten mit).

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `commentId` \* | `string` |  |

## Anhänge

### `list_attachments`

Scope: `issues:read`

Listet die Anhänge eines Issues (Dateien und Links), jeder mit einer `url` zum Ansehen — bei einer Datei ein signierter Link, der ohne Token bis `urlExpiresAt` funktioniert.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `issueId` \* | `string` | Internal id, or a ref like "ENG-123". |

### `get_attachment`

Scope: `issues:read`

Holt einen Anhang mit frischer `url`. Mit includeContent bekommt der Agent auch die Datei selbst: Bilder (bis 5 MB) als Bild, Textdateien (bis 512 KB) als Text.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `attachmentId` \* | `string` |  |
| `includeContent` | `boolean` | Also return the file's content (see above). |

### `add_attachment`

Scope: `issues:write`

Hängt einen Link (`url`) oder eine Datei an — direkt als Base64 (`content`, bis 10 MB) oder vorher hochgeladen (`key`).

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `issueId` \* | `string` | Internal id, or a ref like "ENG-123". |
| `url` | `string` | An http(s) link to attach. |
| `content` | `string` | The file's bytes, base64-encoded (or a data: URL). |
| `key` | `string` | The `key` from request_attachment_upload, after the PUT. |
| `name` | `string` | File name, e.g. screenshot.png — required for a file. For a link it defaults to the host. |
| `mimeType` | `string` | e.g. image/png. Guessed from the file name if omitted. |

### `request_attachment_upload`

Scope: `issues:write`

Für eine Datei bis 100 MB: eine `uploadUrl`, an die die Bytes per PUT gehen, danach add_attachment mit dem zurückgegebenen `key`.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `issueId` \* | `string` | Internal id, or a ref like "ENG-123". |
| `fileName` \* | `string` |  |
| `contentType` | `string` | Guessed from the file name if omitted. |
| `contentLength` \* | `integer (0–9007199254740991)` | Size in bytes. |

### `delete_attachment`

Scope: `issues:write`

Entfernt einen Anhang; eine Datei wird auch aus dem Speicher gelöscht.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `attachmentId` \* | `string` |  |

## Labels

### `list_labels`

Scope: `labels:read`

Listet alle Labels, die in einem Workspace sichtbar sind — workspaceweite und projektbezogene, die du sehen kannst.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

### `create_label`

Scope: `labels:write`

Legt ein Label an, workspaceweit oder für ein Projekt.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |
| `name` \* | `string` |  |
| `color` \* | `string` | Hex color, e.g. #6e63e6. |
| `projectId` | `string` | Scope the label to this project; omit for workspace-wide. |

### `update_label`

Scope: `labels:write`

Ändert Name oder Farbe eines Labels.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `labelId` \* | `string` |  |
| `name` | `string` |  |
| `color` | `string` |  |

### `delete_label`

Scope: `labels:write`

Löscht ein Label und nimmt es von allen Issues, die es tragen.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `labelId` \* | `string` |  |

## Mitglieder

### `list_workspace_members`

Scope: `members:read`

Listet alle Mitglieder eines Workspace mit ID, Name, E-Mail und Handle (für @-Erwähnungen).

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

### `list_project_members`

Scope: `members:read`

Listet alle Mitglieder eines Projekts mit ID, Name, E-Mail und Handle (für @-Erwähnungen).

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `projectId` \* | `string` |  |

## Views

### `list_views`

Scope: `views:read`

Listet die gespeicherten Views, die du siehst — die eines Projekts (projectId) oder die projektübergreifenden eines Workspace (workspaceId), eingebaute inklusive.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `projectId` | `string` |  |
| `workspaceId` | `string` |  |

### `get_view`

Scope: `views:read`

Holt eine View: Filterbaum, Layout, Gruppierung, Sortierung. Ihre Issues bekommst du mit list_issues und viewId.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `viewId` \* | `string` |  |

### `create_view`

Scope: `views:write`

Speichert eine View in einem Projekt oder als projektübergreifende View. Privat, wenn visibility nichts anderes sagt.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `projectId` | `string` |  |
| `workspaceId` | `string` |  |
| `name` \* | `string` | Up to 80 characters. |
| `layout` \* | `"board" \| "list" \| "dashboard"` |  |
| `visibility` | `"PRIVATE" \| "PROJECT" \| "WORKSPACE"` | PRIVATE (default) for you only; PROJECT in a project, WORKSPACE for a cross-project view — sharing needs the view.share permission. |
| `filter` | `any` | A filter tree (see list_issues). |
| `groupBy` | `string \| null` |  |
| `sortBy` | `string` |  |
| `sortDir` | `"asc" \| "desc"` |  |
| `icon` | `string \| null` |  |
| `color` | `string \| null` | Hex color, e.g. #3b7bd5. |

### `update_view`

Scope: `views:write`

Ändert eine View — nur, was du mitgibst. Dieselben Rechte wie in der App.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `viewId` \* | `string` |  |
| `name` | `string` | Up to 80 characters. |
| `layout` | `"board" \| "list" \| "dashboard"` |  |
| `visibility` | `"PRIVATE" \| "PROJECT" \| "WORKSPACE"` | PRIVATE (default) for you only; PROJECT in a project, WORKSPACE for a cross-project view — sharing needs the view.share permission. |
| `filter` | `any` | A filter tree (see list_issues). |
| `groupBy` | `string \| null` |  |
| `sortBy` | `string` |  |
| `sortDir` | `"asc" \| "desc"` |  |
| `icon` | `string \| null` |  |
| `color` | `string \| null` | Hex color, e.g. #3b7bd5. |

### `delete_view`

Scope: `views:write`

Löscht eine View. Eingebaute Views lassen sich nicht löschen.

| Name | Typ | Beschreibung |
| --- | --- | --- |
| `viewId` \* | `string` |  |
