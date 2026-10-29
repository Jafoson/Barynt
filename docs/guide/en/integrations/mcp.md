---
title: "MCP server: connect an AI assistant"
description: "Let Claude, ChatGPT, Cursor and other AI assistants read and update your issues, signing in as you, with your permissions and no key to copy."
sidebar:
  order: 1
---

Barynt has a built-in **MCP server**. MCP, the _Model Context Protocol_, is the standard way for AI assistants to use other tools. Once connected, you can talk to your issue tracker in plain language, from inside the assistant you already use.

![The MCP page in your personal settings](../../assets/en/mcp-settings.webp)

## What it is good for

You ask, the assistant does it in Barynt:

- "**What is in progress** on the Web App project, and who is on it?"
- "**Create issues** for the action points from this meeting transcript, assigned as discussed."
- "**Summarize** all open bugs labelled `Customer` for my Monday update."
- "**Move** all issues I finished this week to _Done_, and comment on NIM-12 that it ships Friday."
- "**Find duplicates** of this bug report and link them."

Everything the assistant does is **visible in Barynt**: issues created through it say "Created via MCP", and every change appears in the issue's activity.

## Who is acting?

The assistant acts **as you**. It signs in through your browser and gets exactly the permissions **you** have: no more, no less. If you cannot delete a project, neither can the assistant. This is the safety net behind everything else on this page.

## Connecting

Open your personal settings, section **MCP**. It shows your server address and a step-by-step guide for each app, with copy buttons. The address looks like `https://issues.example.com/api/mcp`.

> [!WARNING]
> Apps like Claude and ChatGPT connect from the provider's **cloud**, not from your computer. Barynt therefore has to be reachable **from the internet over HTTPS**. A server that only exists inside your company network, or a `localhost` address, will not work for them. Tools that run on your own computer (Claude Code, Cursor, VS Code) do not have this limit.

### Claude (web and desktop)

1. Open **Settings → Connectors** and choose **Add custom connector**.
2. Paste your server address and add the connector. Leave the advanced fields empty.
3. Click **Connect**. Barynt opens in your browser: sign in and click **Allow**.

On Team and Enterprise plans, an owner adds the connector once under _Admin settings → Connectors_. Each member then clicks **Connect** and signs in as themselves.

### Claude Code

```bash
claude mcp add --transport http --scope user barynt https://issues.example.com/api/mcp
```

Then sign in: a browser window opens, or run `/mcp` inside a session and choose _Authenticate_. `claude mcp logout barynt` signs out again.

### ChatGPT

Open **Settings → Apps & Connectors → Advanced settings** and turn on _Developer mode_. Create a new connector, paste the server address and choose **OAuth**. Sign in to Barynt in the window that opens.

### Cursor and VS Code

The MCP settings page has an **Add to Cursor** and an **Add to VS Code** button that does the setup for you. Then sign in when the app asks. Start a **new chat** afterwards.

### With an API key (scripts and special cases)

Only where a browser sign-in is not possible, such as scripts or CI. Create a key under **API keys** with only the scopes you need, see [REST API](api.md), and send it as a header:

```bash
claude mcp add --transport http barynt https://issues.example.com/api/mcp \
  --header "Authorization: Bearer $BARYNT_API_KEY"
```

Keep the key in an environment variable, not in a file you share.

## What the assistant can do

37 tools, one for each thing you can do in the app. Each checks your permissions first.

| Area | Tools |
| --- | --- |
| **Workspaces** | list, create, update, delete |
| **Projects** | list, create, update, delete |
| **Members** | list the members of a workspace or a project |
| **Issues** | list (with filters, text search and saved views), read one, create, update (title, description, status, priority, type, assignee, labels, dates, estimates, parent) |
| **Relations** | add and remove (blocks, relates to, duplicate of) |
| **Comments** | list, create, update, delete |
| **Attachments** | list, read (images and text files directly), add files and links, delete |
| **Labels** | list, create, update, delete |
| **Views** | list, read, create, update, delete |
| **Options** | list statuses, priorities and issue types |

## Staying in control

- The assistant can only do what **you** may do, and only after you **allow** it on the consent page the first time.
- To cut it off, remove the connector in the assistant. For keys, **revoke** the key under _API keys_, and it is cut off immediately.
- You can see what happened in the **Activity** tab of each issue, and the [audit log](../administration/audit.md) records the bigger changes.
- Assistants can make mistakes. For work that matters, ask them to show what they plan to change, or limit the key's scopes to read-only.

## How the sign-in works (for the curious)

Barynt follows the MCP standard: OAuth 2.1 with PKCE. The assistant calls the server address without a token, learns where to sign in, registers itself and sends you to Barynt's consent page. After you allow, it gets a token that refreshes on its own. No key is ever copied around. This is why you only need the server address.
