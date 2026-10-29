---
title: "Introduction"
description: "Barynt is an issue tracker you run yourself. Workspaces contain projects, projects contain issues, and statuses, priorities, issue types, labels and roles are configurable per workspace."
sidebar:
  order: 1
---

![Workspace overview](../assets/overview.webp)

## What you get

- Issues with rich text, sub-issues, relations and attachments
- Board, list and dashboard views, saved and shared
- Role-based access across platform, workspace and project
- An in-app inbox with optional email per event
- A REST API, webhooks and a remote MCP server

## How it runs

One Next.js app and PostgreSQL. Redis (rate limiting) and S3-compatible storage (avatars, attachments) are optional. The bundled compose file brings RustFS and Caddy along.

> [!NOTE]
> New here? [The installer](install.md) gets you a working instance on one server with a single command.

## Next steps

- [**Install**](install.md) — One line on a Linux server
- [**Connect AI**](../integrations/mcp.md) — MCP for Claude & co.
