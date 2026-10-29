---
title: "MCP server"
description: "Barynt includes a remote Model Context Protocol server at /api/mcp. It exposes workspaces, projects, issues, comments, labels, views and attachments as tools."
sidebar:
  order: 1
---

## Authentication

Use a personal API key (the same keys as the REST API) or OAuth 2.1. Connector-based clients such as Claude.ai and Claude Desktop discover the OAuth flow from the server URL alone, including dynamic client registration, so there is no key to paste.

## Claude Code

```bash
claude mcp add --transport http barynt https://barynt.example.com/api/mcp
```

## Claude Desktop & Claude.ai

Add a custom connector with the URL `https://barynt.example.com/api/mcp` and sign in when asked.

<!-- TODO Screenshot: connector sign-in consent screen (OAuth consent · 1200 × 800) -->

## Available tools

| Area | Tools |
| --- | --- |
| Issues | `list_issues`, `get_issue`, `create_issue`, `update_issue` |
| Comments | `list_comments`, `create_comment`, `update_comment` |
| Attachments | `list_attachments`, `add_attachment`, `delete_attachment` |
| Structure | `list_projects`, `list_statuses`, `list_labels`, `list_views` |

> [!NOTE]
> An agent has the same rights as the person whose key or login it uses. Every change shows up in the issue's activity.
