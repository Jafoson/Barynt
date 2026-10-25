import type { ApiScope } from "@/lib/api/scopes";
import type { DocText } from "../AccountApiKeys/docText";

// Reference data for the MCP settings page (`AccountMcp.tsx`, `McpDocs.tsx`).
// Descriptions in both languages (`DocText`), like `apiDocsData.ts`; tool
// names and CLI syntax are the wire contract and stay as they are.
//
// Mirrors `lib/mcp/tools.ts` tool-for-tool — keep this in sync by hand when
// a tool's name, scope, or description changes there, same as
// `apiDocsData.ts` mirrors the REST routes.

export type McpToolGroupId =
  | "workspaces"
  | "projects"
  | "issues"
  | "options"
  | "comments"
  | "labels"
  | "members"
  | "views";

export interface McpToolDoc {
  name: string;
  scope: ApiScope;
  desc: DocText;
}

export interface McpToolGroup {
  id: McpToolGroupId;
  tools: McpToolDoc[];
}

export const MCP_TOOL_GROUPS: McpToolGroup[] = [
  {
    id: "workspaces",
    tools: [
      {
        name: "list_workspaces",
        scope: "workspaces:read",
        desc: {
          en: "List every workspace the caller belongs to.",
          de: "Listet alle Workspaces, in denen du Mitglied bist.",
        },
      },
      {
        name: "create_workspace",
        scope: "workspaces:write",
        desc: {
          en: "Create a new workspace, owned by the caller.",
          de: "Legt einen neuen Workspace an, du wirst sein Owner.",
        },
      },
      {
        name: "update_workspace",
        scope: "workspaces:write",
        desc: {
          en: "Update a workspace's name, color, or description.",
          de: "Ändert Name, Farbe oder Beschreibung eines Workspace.",
        },
      },
      {
        name: "delete_workspace",
        scope: "workspaces:write",
        desc: {
          en: "Permanently delete a workspace and all of its projects and issues.",
          de: "Löscht einen Workspace endgültig, samt allen Projekten und Issues.",
        },
      },
    ],
  },
  {
    id: "projects",
    tools: [
      {
        name: "list_projects",
        scope: "projects:read",
        desc: {
          en: "List the projects in a workspace visible to the caller.",
          de: "Listet die Projekte eines Workspace, die du sehen kannst.",
        },
      },
      {
        name: "create_project",
        scope: "projects:write",
        desc: {
          en: "Create a new project in a workspace.",
          de: "Legt ein neues Projekt in einem Workspace an.",
        },
      },
      {
        name: "update_project",
        scope: "projects:write",
        desc: {
          en: "Update a project's name, prefix, color, or visibility.",
          de: "Ändert Name, Präfix, Farbe oder Sichtbarkeit eines Projekts.",
        },
      },
      {
        name: "delete_project",
        scope: "projects:write",
        desc: {
          en: "Permanently delete a project and all of its issues.",
          de: "Löscht ein Projekt endgültig, samt allen Issues.",
        },
      },
    ],
  },
  {
    id: "issues",
    tools: [
      {
        name: "list_issues",
        scope: "issues:read",
        desc: {
          en: "List issues in a project, optionally filtered by status, assignee, a text search or a filter tree (`filter`). With `viewId`, the issues a saved view shows (needs views:read too); `@me` means you.",
          de: "Listet die Issues eines Projekts, wahlweise gefiltert nach Status, Zuständigem, Textsuche oder Filterbaum (`filter`). Mit `viewId` die Issues einer gespeicherten View (braucht zusätzlich views:read); `@me` bist du.",
        },
      },
      {
        name: "create_issue",
        scope: "issues:write",
        desc: {
          en: "Create a new issue in a project. The description can @mention a workspace member by handle, #link another issue by ref (PREFIX-123), //date a day (//2026-08-14 or //14.8.2026), and [label|https://...] a link — all resolve to real, clickable chips, and a mention notifies the person.",
          de: "Legt ein neues Issue in einem Projekt an. In der Beschreibung kannst du ein Workspace-Mitglied per @handle erwähnen, ein anderes Issue per #PREFIX-123 verlinken, mit //2026-08-14 (oder //14.8.2026) ein Datum setzen und mit [label|https://...] einen Link — alles wird zu echten, klickbaren Chips, und eine Erwähnung benachrichtigt die Person.",
        },
      },
      {
        name: "get_issue",
        scope: "issues:read",
        desc: {
          en: "Fetch a single issue by id.",
          de: "Holt ein einzelnes Issue über seine ID.",
        },
      },
      {
        name: "update_issue",
        scope: "issues:write",
        desc: {
          en: "Update an issue's title, description, status, priority, assignee, labels, or type. The description supports the same @mention/#issue-link/date/link-chip syntax as create_issue.",
          de: "Ändert Titel, Beschreibung, Status, Priorität, Zuständigen, Labels oder Typ eines Issues. Die Beschreibung kennt dieselbe Syntax für Erwähnung, Issue-Link, Datum und Link-Chip wie create_issue.",
        },
      },
    ],
  },
  {
    id: "options",
    tools: [
      {
        name: "list_statuses",
        scope: "workspaces:read",
        desc: {
          en: "A workspace's statuses in board order, each with its category (backlog, unstarted, started, completed, canceled).",
          de: "Die Status eines Workspace in Board-Reihenfolge, jeweils mit Kategorie (backlog, unstarted, started, completed, canceled).",
        },
      },
      {
        name: "list_priorities",
        scope: "workspaces:read",
        desc: {
          en: "A workspace's priorities in order. Use an `id` as `priority` in create_issue / update_issue.",
          de: "Die Prioritäten eines Workspace in Reihenfolge. Eine `id` dient als `priority` in create_issue / update_issue.",
        },
      },
      {
        name: "list_issue_types",
        scope: "workspaces:read",
        desc: {
          en: "A workspace's issue types in order. Use an `id` as `type` in create_issue / update_issue.",
          de: "Die Issue-Typen eines Workspace in Reihenfolge. Eine `id` dient als `type` in create_issue / update_issue.",
        },
      },
    ],
  },
  {
    id: "comments",
    tools: [
      {
        name: "list_comments",
        scope: "comments:read",
        desc: {
          en: "List every comment on an issue, oldest first.",
          de: "Listet alle Kommentare eines Issues, älteste zuerst.",
        },
      },
      {
        name: "create_comment",
        scope: "comments:write",
        desc: {
          en: "Post a comment on an issue, optionally as a reply. Supports @mention/#issue-link/date/link-chip syntax — see create_issue.",
          de: "Schreibt einen Kommentar zu einem Issue, wahlweise als Antwort. Kennt dieselbe Syntax für Erwähnung, Issue-Link, Datum und Link-Chip — siehe create_issue.",
        },
      },
      {
        name: "update_comment",
        scope: "comments:write",
        desc: {
          en: "Edit a comment's body. @mention/#issue-link/date/link-chip syntax still resolves to chips, but (like editing in the app) doesn't send a new mention notification.",
          de: "Ändert den Text eines Kommentars. Erwähnungen, Issue-Links, Daten und Links werden weiter zu Chips, eine neue Erwähnung benachrichtigt aber (wie in der App) niemanden.",
        },
      },
      {
        name: "delete_comment",
        scope: "comments:write",
        desc: {
          en: "Delete a comment (its replies cascade).",
          de: "Löscht einen Kommentar (seine Antworten mit).",
        },
      },
    ],
  },
  {
    id: "labels",
    tools: [
      {
        name: "list_labels",
        scope: "labels:read",
        desc: {
          en: "List every label visible in a workspace — workspace-wide plus project-scoped ones the caller can see.",
          de: "Listet alle Labels, die in einem Workspace sichtbar sind — workspaceweite und projektbezogene, die du sehen kannst.",
        },
      },
      {
        name: "create_label",
        scope: "labels:write",
        desc: {
          en: "Create a label, either workspace-wide or scoped to a project.",
          de: "Legt ein Label an, workspaceweit oder für ein Projekt.",
        },
      },
      {
        name: "update_label",
        scope: "labels:write",
        desc: {
          en: "Update a label's name or color.",
          de: "Ändert Name oder Farbe eines Labels.",
        },
      },
      {
        name: "delete_label",
        scope: "labels:write",
        desc: {
          en: "Delete a label and unassign it from every issue that carries it.",
          de: "Löscht ein Label und nimmt es von allen Issues, die es tragen.",
        },
      },
    ],
  },
  {
    id: "members",
    tools: [
      {
        name: "list_workspace_members",
        scope: "members:read",
        desc: {
          en: "List every member of a workspace, with id, name, email, and handle (for @mentions).",
          de: "Listet alle Mitglieder eines Workspace mit ID, Name, E-Mail und Handle (für @-Erwähnungen).",
        },
      },
      {
        name: "list_project_members",
        scope: "members:read",
        desc: {
          en: "List every member of a project, with id, name, email, and handle (for @mentions).",
          de: "Listet alle Mitglieder eines Projekts mit ID, Name, E-Mail und Handle (für @-Erwähnungen).",
        },
      },
    ],
  },
  {
    id: "views",
    tools: [
      {
        name: "list_views",
        scope: "views:read",
        desc: {
          en: "List the saved views you can see — a project's (projectId) or a workspace's cross-project views (workspaceId), built-in ones included.",
          de: "Listet die gespeicherten Views, die du siehst — die eines Projekts (projectId) oder die projektübergreifenden eines Workspace (workspaceId), eingebaute inklusive.",
        },
      },
      {
        name: "get_view",
        scope: "views:read",
        desc: {
          en: "Fetch one view: filter tree, layout, grouping, sort. Use list_issues with viewId for its issues.",
          de: "Holt eine View: Filterbaum, Layout, Gruppierung, Sortierung. Ihre Issues bekommst du mit list_issues und viewId.",
        },
      },
      {
        name: "create_view",
        scope: "views:write",
        desc: {
          en: "Save a view in a project or as a cross-project view. Private unless visibility says otherwise.",
          de: "Speichert eine View in einem Projekt oder als projektübergreifende View. Privat, wenn visibility nichts anderes sagt.",
        },
      },
      {
        name: "update_view",
        scope: "views:write",
        desc: {
          en: "Change a view — only what you pass. Same rights as in the app.",
          de: "Ändert eine View — nur, was du mitgibst. Dieselben Rechte wie in der App.",
        },
      },
      {
        name: "delete_view",
        scope: "views:write",
        desc: {
          en: "Delete a view. Built-in views can't be deleted.",
          de: "Löscht eine View. Eingebaute Views lassen sich nicht löschen.",
        },
      },
    ],
  },
];

export type McpClientId =
  | "claude"
  | "claude-code"
  | "chatgpt"
  | "cursor"
  | "vscode"
  | "api-key";

/** Where a step's link may point — built from this page's own URLs. */
export interface McpLinkContext {
  mcpUrl: string;
  /** The API keys page (it knows the workspace, this data doesn't). */
  apiKeysHref: string;
}

/** A shortcut from a step straight to where it happens. */
export interface McpStepLink {
  label: DocText;
  href: (ctx: McpLinkContext) => string;
  /** `web` opens a new tab; `app` hands over to an installed app
   *  (cursor:, vscode:); `internal` stays in Barynt. */
  kind: "web" | "app" | "internal";
}

/** One step of a client's setup — text, maybe a link, maybe something to
 *  copy. */
export interface McpSetupStep {
  text: DocText;
  link?: McpStepLink;
  /** Built from the page's own MCP URL (`appUrl("/api/mcp")`). */
  code?: (mcpUrl: string) => string;
}

export interface McpClientGuide {
  id: McpClientId;
  /** Product names stay as they are; "With an API key" is translated. */
  label: DocText;
  steps: McpSetupStep[];
  note?: DocText;
}

/** Cloud apps (Claude, ChatGPT) connect from their own servers. */
const PUBLIC_URL_NOTE: DocText = {
  en: "These apps connect from the provider's cloud, so Barynt must be reachable from the internet over HTTPS — a localhost address won't work.",
  de: "Diese Apps verbinden sich aus der Cloud des Anbieters. Barynt muss dafür über HTTPS aus dem Internet erreichbar sein — eine localhost-Adresse funktioniert nicht.",
};

/**
 * How to connect the common AI apps (BARY-172). OAuth first, as the MCP
 * authorization spec intends: the app gets only the URL, discovers the
 * sign-in itself (`/.well-known/oauth-protected-resource`,
 * `/.well-known/oauth-authorization-server`), registers itself
 * (`/api/oauth/register`) and opens Barynt's consent page. An API key is
 * the fallback for scripts, CI and apps without a browser sign-in.
 */
export const MCP_CLIENT_GUIDES: McpClientGuide[] = [
  {
    id: "claude",
    label: "Claude",
    steps: [
      {
        text: {
          en: "In Claude (web or desktop app), open Settings → Connectors and choose Add custom connector.",
          de: "In Claude (Web oder Desktop-App) Einstellungen → Connectors öffnen und „Add custom connector“ wählen.",
        },
        link: {
          label: {
            en: "Open Claude connectors",
            de: "Claude-Connectors öffnen",
          },
          href: () => "https://claude.ai/settings/connectors",
          kind: "web",
        },
      },
      {
        text: {
          en: "Paste the server URL and add the connector. Leave the advanced OAuth fields empty.",
          de: "Die Server-URL einfügen und den Connector hinzufügen. Die erweiterten OAuth-Felder leer lassen.",
        },
        code: (url) => url,
      },
      {
        text: {
          en: "Click Connect. Barynt opens in the browser — sign in and allow access.",
          de: "Auf „Connect“ klicken. Barynt öffnet sich im Browser — anmelden und den Zugriff erlauben.",
        },
      },
    ],
    note: {
      en: "On Team and Enterprise plans an owner adds the connector under Admin settings → Connectors; each member then clicks Connect and signs in as themselves. These apps connect from the provider's cloud, so Barynt must be reachable from the internet over HTTPS.",
      de: "Bei Team- und Enterprise-Plänen fügt ein Owner den Connector unter Admin-Einstellungen → Connectors hinzu; danach klickt jedes Mitglied auf „Connect“ und meldet sich selbst an. Diese Apps verbinden sich aus der Cloud des Anbieters, Barynt muss also über HTTPS aus dem Internet erreichbar sein.",
    },
  },
  {
    id: "claude-code",
    label: "Claude Code",
    steps: [
      {
        text: {
          en: "Add the server. With --scope user it's available in all your projects.",
          de: "Den Server hinzufügen. Mit --scope user steht er in all deinen Projekten bereit.",
        },
        code: (url) =>
          `claude mcp add --transport http --scope user barynt ${url}`,
      },
      {
        text: {
          en: "Sign in — a browser window opens. Or, inside a session, run /mcp and choose Authenticate.",
          de: "Anmelden — ein Browserfenster öffnet sich. Alternativ in einer Sitzung /mcp ausführen und „Authenticate“ wählen.",
        },
        code: () => "claude mcp login barynt",
      },
      {
        text: {
          en: "Check it: barynt should show as connected.",
          de: "Prüfen: barynt sollte als verbunden erscheinen.",
        },
        code: () => "claude mcp list",
        link: {
          label: {
            en: "Claude Code docs on MCP",
            de: "Claude-Code-Doku zu MCP",
          },
          href: () => "https://code.claude.com/docs/en/mcp",
          kind: "web",
        },
      },
    ],
    note: {
      en: "Tokens are stored by Claude Code and refreshed on their own. claude mcp logout barynt signs out again.",
      de: "Claude Code speichert die Tokens und erneuert sie selbst. Mit claude mcp logout barynt meldest du dich wieder ab.",
    },
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    steps: [
      {
        text: {
          en: "In ChatGPT, open Settings → Apps & Connectors → Advanced settings and turn on Developer mode.",
          de: "In ChatGPT Einstellungen → Apps & Connectors → Erweiterte Einstellungen öffnen und den Entwicklermodus einschalten.",
        },
        link: {
          label: {
            en: "Open ChatGPT settings",
            de: "ChatGPT-Einstellungen öffnen",
          },
          href: () => "https://chatgpt.com/#settings",
          kind: "web",
        },
      },
      {
        text: {
          en: "Create a new connector: paste the server URL and choose OAuth as authentication.",
          de: "Einen neuen Connector anlegen: die Server-URL einfügen und als Authentifizierung OAuth wählen.",
        },
        code: (url) => url,
      },
      {
        text: {
          en: "Sign in to Barynt in the window that opens and allow access.",
          de: "Im sich öffnenden Fenster bei Barynt anmelden und den Zugriff erlauben.",
        },
      },
    ],
    note: PUBLIC_URL_NOTE,
  },
  {
    id: "cursor",
    label: "Cursor",
    steps: [
      {
        text: {
          en: "Add the server with one click — Cursor opens and asks to install it. Or add it by hand under Cursor Settings → MCP in mcp.json — just the URL, no key.",
          de: "Den Server mit einem Klick hinzufügen — Cursor öffnet sich und fragt, ob er ihn installieren soll. Oder von Hand unter Cursor-Einstellungen → MCP in mcp.json eintragen — nur die URL, kein Schlüssel.",
        },
        link: {
          label: { en: "Add to Cursor", de: "Zu Cursor hinzufügen" },
          // Cursor's install link: the server object (without its name)
          // as base64-encoded JSON.
          href: ({ mcpUrl }) =>
            `cursor://anysphere.cursor-deeplink/mcp/install?name=barynt&config=${encodeURIComponent(btoa(JSON.stringify({ url: mcpUrl })))}`,
          kind: "app",
        },
        code: (url) => `{
  "mcpServers": {
    "barynt": {
      "url": "${url}"
    }
  }
}`,
      },
      {
        text: {
          en: "Back in the MCP settings, click the sign-in button next to barynt and allow access in the browser.",
          de: "Zurück in den MCP-Einstellungen neben barynt auf Anmelden klicken und im Browser den Zugriff erlauben.",
        },
      },
      {
        text: {
          en: "Start a new chat — tools added later don't show up in a running one.",
          de: "Einen neuen Chat beginnen — später hinzugefügte Tools erscheinen in einem laufenden Chat nicht.",
        },
      },
    ],
  },
  {
    id: "vscode",
    label: "VS Code",
    steps: [
      {
        text: {
          en: "Add the server with one click — VS Code opens and offers to install it. Or add it by hand to .vscode/mcp.json (this workspace) or your user's mcp.json (everywhere).",
          de: "Den Server mit einem Klick hinzufügen — VS Code öffnet sich und bietet die Installation an. Oder von Hand in .vscode/mcp.json (dieser Workspace) bzw. die mcp.json deines Benutzerprofils (überall) eintragen.",
        },
        link: {
          label: { en: "Add to VS Code", de: "Zu VS Code hinzufügen" },
          // VS Code's install link: the server as URL-encoded JSON.
          href: ({ mcpUrl }) =>
            `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "barynt", type: "http", url: mcpUrl }))}`,
          kind: "app",
        },
        code: (url) => `{
  "servers": {
    "barynt": {
      "type": "http",
      "url": "${url}"
    }
  }
}`,
      },
      {
        text: {
          en: "Start the server (Start above the entry, or MCP: List Servers). VS Code asks you to sign in — allow access in the browser.",
          de: "Den Server starten („Start“ über dem Eintrag oder „MCP: List Servers“). VS Code fragt nach der Anmeldung — im Browser den Zugriff erlauben.",
        },
      },
    ],
  },
  {
    id: "api-key",
    label: { en: "With an API key", de: "Mit API-Key" },
    steps: [
      {
        text: {
          en: "Only where a browser sign-in isn't possible — scripts, CI, or an app without OAuth. Create a key on the API keys page with just the scopes the tools need.",
          de: "Nur, wo keine Anmeldung im Browser möglich ist — Skripte, CI oder eine App ohne OAuth. Leg auf der Seite API-Schlüssel einen Key an, mit genau den Scopes, die die Tools brauchen.",
        },
        link: {
          label: { en: "Create an API key", de: "API-Schlüssel anlegen" },
          href: ({ apiKeysHref }) => apiKeysHref,
          kind: "internal",
        },
      },
      {
        text: {
          en: "Keep the key in an environment variable, not in a file you share or commit.",
          de: "Den Key in einer Umgebungsvariable halten, nicht in einer Datei, die du teilst oder committest.",
        },
        code: () => "export BARYNT_API_KEY=bry_…",
      },
      {
        text: {
          en: "Claude Code: send it as a header (then Claude Code won't try OAuth for this server).",
          de: "Claude Code: als Header mitschicken (Claude Code versucht dann für diesen Server kein OAuth).",
        },
        code: (url) =>
          `claude mcp add --transport http barynt ${url} \\\n  --header "Authorization: Bearer $BARYNT_API_KEY"`,
      },
      {
        text: {
          en: "Other apps: point at the URL with an Authorization header that reads the variable.",
          de: "Andere Apps: auf die URL zeigen, mit einem Authorization-Header, der die Variable liest.",
        },
        code: (url) => `{
  "mcpServers": {
    "barynt": {
      "type": "http",
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer \${BARYNT_API_KEY}"
      }
    }
  }
}`,
      },
    ],
  },
];

/** What happens when an app signs in with OAuth — in order. */
export const MCP_OAUTH_STEPS: DocText[] = [
  {
    en: "The app calls the server URL without a token and is told where to sign in (OAuth discovery).",
    de: "Die App ruft die Server-URL ohne Token auf und erfährt, wo die Anmeldung läuft (OAuth-Discovery).",
  },
  {
    en: "It registers itself with Barynt — nothing for you to set up — and opens Barynt's consent page in your browser.",
    de: "Sie registriert sich selbst bei Barynt — du musst nichts einrichten — und öffnet die Zustimmungsseite von Barynt im Browser.",
  },
  {
    en: "You sign in and see what the app may do. After Allow, it gets a short-lived token and renews it on its own.",
    de: "Du meldest dich an und siehst, was die App darf. Nach „Erlauben“ bekommt sie ein kurzlebiges Token und erneuert es selbst.",
  },
  {
    en: "The app acts as you: it can never do more than your roles allow — on top of the scopes it was granted.",
    de: "Die App handelt als du: Sie darf nie mehr, als deine Rollen erlauben — und nur im Rahmen der gewährten Scopes.",
  },
];
