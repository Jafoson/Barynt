---
title: "MCP-Server"
description: "Barynt bringt einen Remote-Model-Context-Protocol-Server unter /api/mcp mit. Er stellt Workspaces, Projekte, Issues, Kommentare, Labels, Ansichten und Anhänge als Tools bereit."
sidebar:
  order: 1
---

## Authentifizierung

Nutze einen persönlichen API-Key (dieselben wie für die REST-API) oder OAuth 2.1. Connector-basierte Clients wie Claude.ai und Claude Desktop finden den OAuth-Ablauf allein über die Server-URL, inklusive dynamischer Client-Registrierung, es gibt also keinen Key zum Einfügen.

## Claude Code

```bash
claude mcp add --transport http barynt https://barynt.example.com/api/mcp
```

## Claude Desktop & Claude.ai

Füge einen eigenen Connector mit der URL `https://barynt.example.com/api/mcp` hinzu und melde dich an, wenn du gefragt wirst.

<!-- TODO Screenshot: Zustimmungsseite beim Connector-Login (OAuth-Zustimmung · 1200 × 800) -->

## Verfügbare Tools

| Bereich | Tools |
| --- | --- |
| Issues | `list_issues`, `get_issue`, `create_issue`, `update_issue` |
| Kommentare | `list_comments`, `create_comment`, `update_comment` |
| Anhänge | `list_attachments`, `add_attachment`, `delete_attachment` |
| Struktur | `list_projects`, `list_statuses`, `list_labels`, `list_views` |

> [!NOTE]
> Ein Agent hat dieselben Rechte wie die Person, deren Key oder Login er nutzt. Jede Änderung erscheint in der Aktivität des Issues.
