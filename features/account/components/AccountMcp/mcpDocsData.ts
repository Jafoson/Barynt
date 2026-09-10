import type { ApiScope } from "@/lib/api/scopes";

// Reference data for the MCP settings page (`AccountMcp.tsx`, `McpDocs.tsx`).
// Kept in English regardless of UI locale, same convention as
// `apiDocsData.ts`: this is the actual wire contract (tool names, CLI
// syntax), not chrome — only tab labels and headings go through next-intl.
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
  | "members";

export interface McpToolDoc {
  name: string;
  scope: ApiScope;
  desc: string;
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
        desc: "List every workspace the caller belongs to.",
      },
      {
        name: "create_workspace",
        scope: "workspaces:write",
        desc: "Create a new workspace, owned by the caller.",
      },
      {
        name: "update_workspace",
        scope: "workspaces:write",
        desc: "Update a workspace's name, color, or description.",
      },
      {
        name: "delete_workspace",
        scope: "workspaces:write",
        desc: "Permanently delete a workspace and all of its projects and issues.",
      },
    ],
  },
  {
    id: "projects",
    tools: [
      {
        name: "list_projects",
        scope: "projects:read",
        desc: "List the projects in a workspace visible to the caller.",
      },
      {
        name: "create_project",
        scope: "projects:write",
        desc: "Create a new project in a workspace.",
      },
      {
        name: "update_project",
        scope: "projects:write",
        desc: "Update a project's name, prefix, color, or visibility.",
      },
      {
        name: "delete_project",
        scope: "projects:write",
        desc: "Permanently delete a project and all of its issues.",
      },
    ],
  },
  {
    id: "issues",
    tools: [
      {
        name: "list_issues",
        scope: "issues:read",
        desc: "List issues in a project, optionally filtered by status, assignee, or a text search over title and description.",
      },
      {
        name: "create_issue",
        scope: "issues:write",
        desc: "Create a new issue in a project. The description can @mention a workspace member by handle, #link another issue by ref (PREFIX-123), //date a day (//2026-08-14 or //14.8.2026), and [label|https://...] a link — all resolve to real, clickable chips, and a mention notifies the person.",
      },
      {
        name: "get_issue",
        scope: "issues:read",
        desc: "Fetch a single issue by id.",
      },
      {
        name: "update_issue",
        scope: "issues:write",
        desc: "Update an issue's title, description, status, priority, assignee, labels, or type. The description supports the same @mention/#issue-link/date/link-chip syntax as create_issue.",
      },
    ],
  },
  {
    id: "comments",
    tools: [
      {
        name: "list_comments",
        scope: "comments:read",
        desc: "List every comment on an issue, oldest first.",
      },
      {
        name: "create_comment",
        scope: "comments:write",
        desc: "Post a comment on an issue, optionally as a reply. Supports @mention/#issue-link/date/link-chip syntax — see create_issue.",
      },
      {
        name: "update_comment",
        scope: "comments:write",
        desc: "Edit a comment's body. @mention/#issue-link/date/link-chip syntax still resolves to chips, but (like editing in the app) doesn't send a new mention notification.",
      },
      {
        name: "delete_comment",
        scope: "comments:write",
        desc: "Delete a comment (its replies cascade).",
      },
    ],
  },
  {
    id: "labels",
    tools: [
      {
        name: "list_labels",
        scope: "labels:read",
        desc: "List every label visible in a workspace — workspace-wide plus project-scoped ones the caller can see.",
      },
      {
        name: "create_label",
        scope: "labels:write",
        desc: "Create a label, either workspace-wide or scoped to a project.",
      },
      {
        name: "update_label",
        scope: "labels:write",
        desc: "Update a label's name or color.",
      },
      {
        name: "delete_label",
        scope: "labels:write",
        desc: "Delete a label and unassign it from every issue that carries it.",
      },
    ],
  },
  {
    id: "members",
    tools: [
      {
        name: "list_workspace_members",
        scope: "members:read",
        desc: "List every member of a workspace, with id, name, email, and handle (for @mentions).",
      },
      {
        name: "list_project_members",
        scope: "members:read",
        desc: "List every member of a project, with id, name, email, and handle (for @mentions).",
      },
    ],
  },
];

export type McpClientId = "claude-code" | "direct" | "desktop";

export interface McpClientGuide {
  id: McpClientId;
  snippetLang: "bash" | "json";
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
    snippetLang: "json",
    snippet: (mcpUrl) =>
      `{
  "mcpServers": {
    "barynt": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpUrl}",
        "--header",
        "Authorization:\${BARYNT_API_KEY}"
      ],
      "env": {
        "BARYNT_API_KEY": "Bearer <YOUR_API_KEY>"
      }
    }
  }
}`,
  },
];
