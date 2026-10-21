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
      {
        name: "list_statuses",
        scope: "workspaces:read",
        desc: {
          en: "A workspace's statuses in board order, each with its category (backlog, unstarted, started, completed, canceled).",
          de: "Die Status eines Workspace in Board-Reihenfolge, jeweils mit Kategorie (backlog, unstarted, started, completed, canceled).",
        },
      },
    ],
  },
];

export type McpClientId = "claude-code" | "direct" | "desktop";

export interface McpClientGuide {
  id: McpClientId;
  snippetLang: "bash" | "json" | "text";
  /** Built lazily from the page's own origin (`appUrl("/api/mcp")`) — there's
   *  no fixed placeholder to bake in ahead of time. */
  snippet: (mcpUrl: string) => string;
}

export const MCP_CLIENT_GUIDES: McpClientGuide[] = [
  {
    id: "claude-code",
    snippetLang: "bash",
    snippet: (mcpUrl) =>
      `claude mcp add --transport http barynt ${mcpUrl} \\\n  --header "Authorization: Bearer <YOUR_API_KEY>"`,
  },
  {
    id: "direct",
    snippetLang: "json",
    snippet: (mcpUrl) =>
      `{
  "mcpServers": {
    "barynt": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer <YOUR_API_KEY>"
      }
    }
  }
}`,
  },
  {
    id: "desktop",
    snippetLang: "text",
    // No JSON, no bridge process, no key to paste — the connector picker
    // takes just this URL and drives the OAuth flow itself
    // (`/.well-known/oauth-authorization-server`, `/oauth/authorize`).
    snippet: (mcpUrl) => mcpUrl,
  },
];
