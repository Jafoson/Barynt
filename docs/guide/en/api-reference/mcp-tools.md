---
title: "MCP tools"
description: "Every tool of the Barynt MCP server, with its scope and arguments."
sidebar:
  order: 12
---

<!-- Generated from the API's reference data. Do not edit by hand. (scripts/docs-api/generate.ts) -->

Each tool matches a call of the REST API, with the same scopes, permissions and answers. Arguments are one flat list; a `*` marks required ones. How to connect a client is described in [MCP server](../integrations/mcp.md).

## Workspaces

### `list_workspaces`

Scope: `workspaces:read`

List every workspace the caller belongs to.

### `create_workspace`

Scope: `workspaces:write`

Create a new workspace, owned by the caller.

| Name | Type | Description |
| --- | --- | --- |
| `name` \* | `string` | Display name. |
| `slug` \* | `string` | URL slug; also becomes the workspace id. |
| `color` | `string` | Hex color, e.g. #6e63e6. |

### `update_workspace`

Scope: `workspaces:write`

Update a workspace's name, color, or description.

| Name | Type | Description |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |
| `name` | `string` |  |
| `color` | `string` |  |
| `desc` | `string` |  |

### `delete_workspace`

Scope: `workspaces:write`

Permanently delete a workspace and all of its projects and issues.

| Name | Type | Description |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

## Projects

### `list_projects`

Scope: `projects:read`

List the projects in a workspace visible to the caller.

| Name | Type | Description |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

### `create_project`

Scope: `projects:write`

Create a new project in a workspace.

| Name | Type | Description |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |
| `name` \* | `string` |  |
| `desc` | `string` |  |
| `prefix` | `string` | Issue key prefix, e.g. "ENG" for ENG-123. Derived from the name if omitted. |
| `color` \* | `string` | Hex color, e.g. #6e63e6. |
| `visibility` | `"public" \| "private"` |  |

### `update_project`

Scope: `projects:write`

Update a project's name, prefix, color, or visibility.

| Name | Type | Description |
| --- | --- | --- |
| `projectId` \* | `string` |  |
| `name` | `string` |  |
| `desc` | `string` |  |
| `prefix` | `string` |  |
| `color` | `string` |  |
| `visibility` | `"public" \| "private"` |  |

### `delete_project`

Scope: `projects:write`

Permanently delete a project and all of its issues.

| Name | Type | Description |
| --- | --- | --- |
| `projectId` \* | `string` |  |

## Issues and relations

### `list_issues`

Scope: `issues:read`

List issues in a project, optionally filtered by status, assignee, a text search or a filter tree (`filter`). With `viewId`, the issues a saved view shows (needs views:read too); `@me` means you.

| Name | Type | Description |
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

Create a new issue in a project. The description can @mention a workspace member by handle, #link another issue by ref (PREFIX-123), //date a day (//2026-08-14 or //14.8.2026), and [label|https://...] a link — all resolve to real, clickable chips, and a mention notifies the person.

| Name | Type | Description |
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

Fetch a single issue by id or ref. Includes `commentCount`; when it is above 0 the response also carries a `hint` telling the agent to call `list_comments` before acting. Attachments come along under `attachments`, each with a `url` to view it.

| Name | Type | Description |
| --- | --- | --- |
| `issueId` \* | `string` | Internal id, or a ref like "ENG-123". |
| `fields` | `string` | Comma-separated allowlist of fields to return, e.g. "id,title,status". |

### `update_issue`

Scope: `issues:write`

Update an issue's title, description, status, priority, assignee, labels, or type. The description supports the same @mention/#issue-link/date/link-chip syntax as create_issue.

| Name | Type | Description |
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

Link two issues with a typed edge: BLOCKS, RELATES_TO or DUPLICATES. Seen from issueId: for BLOCKS and DUPLICATES, issueId blocks / duplicates relatedId.

| Name | Type | Description |
| --- | --- | --- |
| `issueId` \* | `string` |  |
| `relatedId` \* | `string` |  |
| `type` \* | `"BLOCKS" \| "RELATES_TO" \| "DUPLICATES"` |  |

### `remove_issue_relation`

Scope: `issues:write`

Remove a relation by its own id (from an issue's relations). Works from either issue it connects.

| Name | Type | Description |
| --- | --- | --- |
| `relationId` \* | `string` |  |

## Statuses, priorities and types

### `list_statuses`

Scope: `workspaces:read`

A workspace's statuses in board order, each with its category (backlog, unstarted, started, completed, canceled).

| Name | Type | Description |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

### `list_priorities`

Scope: `workspaces:read`

A workspace's priorities in order. Use an `id` as `priority` in create_issue / update_issue.

| Name | Type | Description |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

### `list_issue_types`

Scope: `workspaces:read`

A workspace's issue types in order. Use an `id` as `type` in create_issue / update_issue.

| Name | Type | Description |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

## Comments

### `list_comments`

Scope: `comments:read`

List every comment on an issue, oldest first.

| Name | Type | Description |
| --- | --- | --- |
| `issueId` \* | `string` |  |

### `create_comment`

Scope: `comments:write`

Post a comment on an issue, optionally as a reply. Supports @mention/#issue-link/date/link-chip syntax — see create_issue.

| Name | Type | Description |
| --- | --- | --- |
| `issueId` \* | `string` |  |
| `body` \* | `string` | Markdown. `@handle` mentions a workspace member (notifies them); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label\|https://...]` (or bare `[https://...]`) becomes a link chip. All resolved server-side; unresolved ones are left as plain text. |
| `parentId` | `string` | Id of the comment being replied to. |

### `update_comment`

Scope: `comments:write`

Edit a comment's body. @mention/#issue-link/date/link-chip syntax still resolves to chips, but (like editing in the app) doesn't send a new mention notification.

| Name | Type | Description |
| --- | --- | --- |
| `commentId` \* | `string` |  |
| `body` \* | `string` | Markdown. `@handle` mentions a workspace member (notifies them); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label\|https://...]` (or bare `[https://...]`) becomes a link chip. All resolved server-side; unresolved ones are left as plain text. |

### `delete_comment`

Scope: `comments:write`

Delete a comment (its replies cascade).

| Name | Type | Description |
| --- | --- | --- |
| `commentId` \* | `string` |  |

## Attachments

### `list_attachments`

Scope: `issues:read`

List an issue's attachments (files and links), each with a `url` to view it — for a file a signed link that works without a token until `urlExpiresAt`.

| Name | Type | Description |
| --- | --- | --- |
| `issueId` \* | `string` | Internal id, or a ref like "ENG-123". |

### `get_attachment`

Scope: `issues:read`

Fetch one attachment with a fresh `url`. With includeContent the agent also gets the file itself: images (up to 5 MB) as an image, text files (up to 512 KB) as text.

| Name | Type | Description |
| --- | --- | --- |
| `attachmentId` \* | `string` |  |
| `includeContent` | `boolean` | Also return the file's content (see above). |

### `add_attachment`

Scope: `issues:write`

Attach a link (`url`) or a file — inline as base64 (`content`, up to 10 MB) or uploaded beforehand (`key`).

| Name | Type | Description |
| --- | --- | --- |
| `issueId` \* | `string` | Internal id, or a ref like "ENG-123". |
| `url` | `string` | An http(s) link to attach. |
| `content` | `string` | The file's bytes, base64-encoded (or a data: URL). |
| `key` | `string` | The `key` from request_attachment_upload, after the PUT. |
| `name` | `string` | File name, e.g. screenshot.png — required for a file. For a link it defaults to the host. |
| `mimeType` | `string` | e.g. image/png. Guessed from the file name if omitted. |

### `request_attachment_upload`

Scope: `issues:write`

For a file up to 100 MB: an `uploadUrl` to PUT the bytes to, then add_attachment with the returned `key`.

| Name | Type | Description |
| --- | --- | --- |
| `issueId` \* | `string` | Internal id, or a ref like "ENG-123". |
| `fileName` \* | `string` |  |
| `contentType` | `string` | Guessed from the file name if omitted. |
| `contentLength` \* | `integer (0–9007199254740991)` | Size in bytes. |

### `delete_attachment`

Scope: `issues:write`

Remove an attachment; a file is deleted from storage too.

| Name | Type | Description |
| --- | --- | --- |
| `attachmentId` \* | `string` |  |

## Labels

### `list_labels`

Scope: `labels:read`

List every label visible in a workspace — workspace-wide plus project-scoped ones the caller can see.

| Name | Type | Description |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

### `create_label`

Scope: `labels:write`

Create a label, either workspace-wide or scoped to a project.

| Name | Type | Description |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |
| `name` \* | `string` |  |
| `color` \* | `string` | Hex color, e.g. #6e63e6. |
| `projectId` | `string` | Scope the label to this project; omit for workspace-wide. |

### `update_label`

Scope: `labels:write`

Update a label's name or color.

| Name | Type | Description |
| --- | --- | --- |
| `labelId` \* | `string` |  |
| `name` | `string` |  |
| `color` | `string` |  |

### `delete_label`

Scope: `labels:write`

Delete a label and unassign it from every issue that carries it.

| Name | Type | Description |
| --- | --- | --- |
| `labelId` \* | `string` |  |

## Members

### `list_workspace_members`

Scope: `members:read`

List every member of a workspace, with id, name, email, and handle (for @mentions).

| Name | Type | Description |
| --- | --- | --- |
| `workspaceId` \* | `string` |  |

### `list_project_members`

Scope: `members:read`

List every member of a project, with id, name, email, and handle (for @mentions).

| Name | Type | Description |
| --- | --- | --- |
| `projectId` \* | `string` |  |

## Views

### `list_views`

Scope: `views:read`

List the saved views you can see — a project's (projectId) or a workspace's cross-project views (workspaceId), built-in ones included.

| Name | Type | Description |
| --- | --- | --- |
| `projectId` | `string` |  |
| `workspaceId` | `string` |  |

### `get_view`

Scope: `views:read`

Fetch one view: filter tree, layout, grouping, sort. Use list_issues with viewId for its issues.

| Name | Type | Description |
| --- | --- | --- |
| `viewId` \* | `string` |  |

### `create_view`

Scope: `views:write`

Save a view in a project or as a cross-project view. Private unless visibility says otherwise.

| Name | Type | Description |
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

Change a view — only what you pass. Same rights as in the app.

| Name | Type | Description |
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

Delete a view. Built-in views can't be deleted.

| Name | Type | Description |
| --- | --- | --- |
| `viewId` \* | `string` |  |
