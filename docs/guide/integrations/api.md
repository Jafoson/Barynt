---
title: "REST API and API keys"
description: "Connect scripts, reports and other tools to Barynt: personal API keys with exactly the scopes they need, and a documented JSON API."
sidebar:
  order: 2
---

The **REST API** lets other software read and change what is in Barynt: create an issue when a customer submits a form, pull numbers into a report, keep a spreadsheet in sync. It is the same data and the same rules as in the app. If you are not a developer, this page tells you what to ask them for, and how to hand them access safely.

![API keys in your personal settings](../assets/api-keys.webp)

## What it is good for

- **Create issues automatically**, from a support form, a monitoring alert or a chat command.
- **Reports and dashboards** outside Barynt: export open issues, count closed ones per week.
- **Sync** with other systems: CRM, spreadsheets, a company portal.
- **Scripts and CI:** comment on an issue when a deployment finishes.

For AI assistants, use [MCP](mcp.md) instead: it needs no key. To be told when something happens, use [webhooks](webhooks.md).

## API keys

An **API key** is a personal access token. It acts as **you**, so it can never do more than you can, and you can narrow it further with **scopes**.

1. Open your personal settings → **API keys** and click **New key**.
2. Give it a **name** that says what it is for ("Support form"), choose an **expiry** (never, or a number of days) and tick the **scopes** it needs.
3. Click **Create key**. Barynt shows the key **once**. Copy it now, because it cannot be shown again.
4. Give it to whoever needs it, through a safe channel, never in a chat or an email.

![The new key is shown once](../assets/api-key-created.webp)

The list shows each key's prefix, when it was created, when it was **last used** and whether it is active. **Revoke** a key at any moment: every tool that uses it loses access immediately, and this cannot be undone.

> [!WARNING]
> Treat a key like a password. Create **one key per tool**, give it the **fewest scopes** that work, and set an **expiry** where you can. If a key leaks, revoke it.

### Scopes

A scope is a pair of "what" and "read or write". A call needs the right scope **and** the permission that you have in the app.

| Scope | Allows |
| --- | --- |
| `issues:read` / `issues:write` | Read issues, relations and attachments. Create, change and move issues, add or remove relations and attachments. |
| `comments:read` / `comments:write` | Read and write comments. |
| `labels:read` / `labels:write` | Read, create, change and delete labels. |
| `projects:read` / `projects:write` | Read projects. Create, change and delete them. |
| `workspaces:read` / `workspaces:write` | Read the workspaces, statuses, priorities and types. Create, change and delete workspaces. |
| `members:read` | Read the members of workspaces and projects. There is no write scope: adding people is done in the app. |
| `views:read` / `views:write` | Read and manage saved views. A view's issues also need `issues:read`. |

## Making a request

Every address starts with your server, `/api/v1`. Send the key as a **Bearer token**:

```bash
curl https://issues.example.com/api/v1/workspaces \
  -H "Authorization: Bearer $BARYNT_API_KEY"
```

Answers are JSON, always `{ "data": … }`. To create an issue in a project:

```bash
curl -X POST https://issues.example.com/api/v1/projects/$PROJECT_ID/issues \
  -H "Authorization: Bearer $BARYNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Fix broken checkout", "priority": 2, "type": "bug" }'
```

The issue is created with **you** as the creator, and is marked as created through the API.

### Lists, pages and fields

- Lists come **newest first** and in **pages**. Use `limit` (1 to 100, default 25) and pass back the `nextCursor` of the last answer as `cursor` to get the next page.
- Add `fields=id,title,status` to receive only the fields you need.
- Issue lists can be filtered with `status`, `assignee`, a text search `q`, or a full **filter** as JSON, with the same rules as the filters in the app, including `@me`.

### Errors

The shape is always the same: `{ "error": { "code": "…", "message": "…" } }`.

| Status | Meaning |
| --- | --- |
| **401** | The key is missing, wrong, revoked or expired. |
| **403** | The key lacks the scope this call needs, or you may see the thing but not change it. |
| **404** | It does not exist, or you may not see it. Barynt does not say which, on purpose. |
| **422** | The request body is missing or wrong, or the filter is invalid. |
| **429** | Too many requests. |

### Limits

Each key may make **120 requests per minute**. When the budget is used up, the answer is 429 with a `Retry-After` header that says how many seconds to wait. Every answer also carries `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers. The counters live in Redis, see [Configuration](../getting-started/config.md).

## What you can do

| Area | Calls |
| --- | --- |
| **Workspaces** | list, create, change, delete; list statuses, priorities and issue types |
| **Projects** | list, create, change, delete; list members |
| **Issues** | list and read, create, change (including status, assignee, labels, dates, estimates, parent); relations |
| **Comments** | list, create, change, delete |
| **Attachments** | list, read, add a file or a link, delete |
| **Labels** | list, create, change, delete |
| **Members** | list the members of a workspace or project |
| **Views** | list, read, create, change, delete; list a view's issues |

The **complete reference** with every field and live examples is built into the app, right below your keys, on the **API keys** page: tabs per area, request and response examples, and the filter language. It always matches the version you run.

## Good to know

- **A key is a person.** Its actions show up as that person in the activity of issues. For an integration, create a dedicated account (for example "Support bot") and issue the key there.
- Nothing the API does skips permissions. A key of a Viewer cannot write, even with a write scope.
