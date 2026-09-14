import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  addIssueRelationForUser,
  createCommentForUser,
  createIssueForUser,
  createLabelForUser,
  createProjectForUser,
  createWorkspaceForUser,
  deleteCommentForUser,
  deleteLabelForUser,
  deleteProjectForUser,
  deleteWorkspaceForUser,
  removeIssueRelationForUser,
  updateCommentForUser,
  updateIssueForUser,
  updateLabelForUser,
  updateProjectForUser,
  updateWorkspaceForUser,
} from "@/features/api-v1/mutations";
import {
  getIssueForUser,
  listCommentsForUser,
  listIssuesForUser,
  listLabelsForUser,
  listProjectMembersForUser,
  listProjectsForUser,
  listWorkspaceMembersForUser,
  listWorkspacesForUser,
} from "@/features/api-v1/queries";
import { encodeCursor } from "@/lib/api/cursor";
import { pickFields } from "@/lib/api/fields";
import {
  authorize,
  jsonResult,
  mutationResult,
  notFoundResult,
} from "@/lib/mcp/context";

// One tool per `app/api/v1` route, same request/response shapes, same
// scopes — the MCP surface for the public API (`features/api-v1`). Calls
// the same `*ForUser` query/mutation functions the REST routes call, so the
// two surfaces can't drift on *what* a request does, only on transport.
// Deliberately not a loop-generated table: each tool's input schema differs
// enough (path params folded into the flat object, optional patch fields,
// list filters) that a table would just re-introduce the branching it's
// trying to avoid.

const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe("Max rows to return (default 25, max 100).");

export function registerBaryntTools(server: McpServer): void {
  // ─── Workspaces ────────────────────────────────────────────────────────

  server.registerTool(
    "list_workspaces",
    {
      title: "List workspaces",
      description: "List every workspace the caller belongs to.",
    },
    async (ctx) => {
      const auth = await authorize(ctx, "workspaces:read");
      if (!auth.ok) return auth.result;
      return jsonResult(await listWorkspacesForUser(auth.auth.userId));
    },
  );

  server.registerTool(
    "create_workspace",
    {
      title: "Create workspace",
      description: "Create a new workspace, owned by the caller.",
      inputSchema: z.object({
        name: z.string().describe("Display name."),
        slug: z.string().describe("URL slug; also becomes the workspace id."),
        color: z.string().optional().describe("Hex color, e.g. #6e63e6."),
      }),
    },
    async (input, ctx) => {
      const auth = await authorize(ctx, "workspaces:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await createWorkspaceForUser(auth.auth.userId, input),
      );
    },
  );

  server.registerTool(
    "update_workspace",
    {
      title: "Update workspace",
      description: "Update a workspace's name, color, or description.",
      inputSchema: z.object({
        workspaceId: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
        desc: z.string().optional(),
      }),
    },
    async ({ workspaceId, ...patch }, ctx) => {
      const auth = await authorize(ctx, "workspaces:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await updateWorkspaceForUser(auth.auth.userId, workspaceId, patch),
      );
    },
  );

  server.registerTool(
    "delete_workspace",
    {
      title: "Delete workspace",
      description:
        "Permanently delete a workspace and all of its projects and issues.",
      inputSchema: z.object({ workspaceId: z.string() }),
    },
    async ({ workspaceId }, ctx) => {
      const auth = await authorize(ctx, "workspaces:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await deleteWorkspaceForUser(auth.auth.userId, workspaceId),
      );
    },
  );

  // ─── Projects ──────────────────────────────────────────────────────────

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List the projects in a workspace visible to the caller.",
      inputSchema: z.object({ workspaceId: z.string() }),
    },
    async ({ workspaceId }, ctx) => {
      const auth = await authorize(ctx, "projects:read");
      if (!auth.ok) return auth.result;
      return jsonResult(
        await listProjectsForUser(auth.auth.userId, workspaceId),
      );
    },
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description: "Create a new project in a workspace.",
      inputSchema: z.object({
        workspaceId: z.string(),
        name: z.string(),
        desc: z.string().optional(),
        prefix: z
          .string()
          .optional()
          .describe(
            'Issue key prefix, e.g. "ENG" for ENG-123. Derived from the name if omitted.',
          ),
        color: z.string().describe("Hex color, e.g. #6e63e6."),
        visibility: z.enum(["public", "private"]).optional(),
      }),
    },
    async ({ workspaceId, ...input }, ctx) => {
      const auth = await authorize(ctx, "projects:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await createProjectForUser(auth.auth.userId, workspaceId, input),
      );
    },
  );

  server.registerTool(
    "update_project",
    {
      title: "Update project",
      description: "Update a project's name, prefix, color, or visibility.",
      inputSchema: z.object({
        projectId: z.string(),
        name: z.string().optional(),
        desc: z.string().optional(),
        prefix: z.string().optional(),
        color: z.string().optional(),
        visibility: z.enum(["public", "private"]).optional(),
      }),
    },
    async ({ projectId, ...patch }, ctx) => {
      const auth = await authorize(ctx, "projects:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await updateProjectForUser(auth.auth.userId, projectId, patch),
      );
    },
  );

  server.registerTool(
    "delete_project",
    {
      title: "Delete project",
      description: "Permanently delete a project and all of its issues.",
      inputSchema: z.object({ projectId: z.string() }),
    },
    async ({ projectId }, ctx) => {
      const auth = await authorize(ctx, "projects:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await deleteProjectForUser(auth.auth.userId, projectId),
      );
    },
  );

  // ─── Members ───────────────────────────────────────────────────────────

  server.registerTool(
    "list_workspace_members",
    {
      title: "List workspace members",
      description:
        "List every member of a workspace, with id, name, email, and handle (for @mentions).",
      inputSchema: z.object({ workspaceId: z.string() }),
    },
    async ({ workspaceId }, ctx) => {
      const auth = await authorize(ctx, "members:read");
      if (!auth.ok) return auth.result;
      const data = await listWorkspaceMembersForUser(
        auth.auth.userId,
        workspaceId,
      );
      return data ? jsonResult(data) : notFoundResult();
    },
  );

  server.registerTool(
    "list_project_members",
    {
      title: "List project members",
      description:
        "List every member of a project, with id, name, email, and handle (for @mentions).",
      inputSchema: z.object({ projectId: z.string() }),
    },
    async ({ projectId }, ctx) => {
      const auth = await authorize(ctx, "members:read");
      if (!auth.ok) return auth.result;
      const data = await listProjectMembersForUser(auth.auth.userId, projectId);
      return data ? jsonResult(data) : notFoundResult();
    },
  );

  // ─── Labels ────────────────────────────────────────────────────────────

  server.registerTool(
    "list_labels",
    {
      title: "List labels",
      description:
        "List every label visible in a workspace — workspace-wide plus project-scoped ones the caller can see.",
      inputSchema: z.object({ workspaceId: z.string() }),
    },
    async ({ workspaceId }, ctx) => {
      const auth = await authorize(ctx, "labels:read");
      if (!auth.ok) return auth.result;
      const data = await listLabelsForUser(auth.auth.userId, workspaceId);
      return data ? jsonResult(data) : notFoundResult();
    },
  );

  server.registerTool(
    "create_label",
    {
      title: "Create label",
      description:
        "Create a label, either workspace-wide or scoped to a project.",
      inputSchema: z.object({
        workspaceId: z.string(),
        name: z.string(),
        color: z.string().describe("Hex color, e.g. #6e63e6."),
        projectId: z
          .string()
          .optional()
          .describe(
            "Scope the label to this project; omit for workspace-wide.",
          ),
      }),
    },
    async ({ workspaceId, ...input }, ctx) => {
      const auth = await authorize(ctx, "labels:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await createLabelForUser(auth.auth.userId, workspaceId, input),
      );
    },
  );

  server.registerTool(
    "update_label",
    {
      title: "Update label",
      description: "Update a label's name or color.",
      inputSchema: z.object({
        labelId: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
      }),
    },
    async ({ labelId, ...patch }, ctx) => {
      const auth = await authorize(ctx, "labels:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await updateLabelForUser(auth.auth.userId, labelId, patch),
      );
    },
  );

  server.registerTool(
    "delete_label",
    {
      title: "Delete label",
      description:
        "Delete a label and unassign it from every issue that carries it.",
      inputSchema: z.object({ labelId: z.string() }),
    },
    async ({ labelId }, ctx) => {
      const auth = await authorize(ctx, "labels:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await deleteLabelForUser(auth.auth.userId, labelId),
      );
    },
  );

  // ─── Issues ────────────────────────────────────────────────────────────

  server.registerTool(
    "list_issues",
    {
      title: "List issues",
      description:
        "List issues in a project, optionally filtered by status, assignee, or a text search over title and description.",
      inputSchema: z.object({
        projectId: z.string(),
        status: z.string().optional(),
        assignee: z.string().optional().describe("User id."),
        q: z
          .string()
          .optional()
          .describe(
            "Case-insensitive substring match against title and description.",
          ),
        cursor: z
          .string()
          .optional()
          .describe("Opaque cursor from a previous call's `nextCursor`."),
        limit: limitSchema,
        fields: z
          .string()
          .optional()
          .describe(
            'Comma-separated allowlist of fields to return, e.g. "id,title,status".',
          ),
      }),
    },
    async ({ projectId, limit, fields, ...filters }, ctx) => {
      const auth = await authorize(ctx, "issues:read");
      if (!auth.ok) return auth.result;

      const page = await listIssuesForUser(auth.auth.userId, projectId, {
        ...filters,
        take: limit ?? 25,
      });
      if (!page) return notFoundResult();

      const last = page.rows.at(-1);
      return jsonResult({
        data: page.rows.map((row) => pickFields(row, fields ?? null)),
        nextCursor: page.hasMore && last ? encodeCursor(last.id) : null,
      });
    },
  );

  server.registerTool(
    "create_issue",
    {
      title: "Create issue",
      description: "Create a new issue in a project.",
      inputSchema: z.object({
        projectId: z.string(),
        title: z.string(),
        description: z
          .string()
          .optional()
          .describe(
            "Markdown. `@handle` mentions a workspace member (notifies them); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label|https://...]` (or bare `[https://...]`) becomes a link chip. All resolved server-side; unresolved ones are left as plain text.",
          ),
        status: z.string().optional(),
        priority: z.number().int().optional(),
        assignee: z.string().nullable().optional().describe("User id."),
        labels: z.array(z.string()).optional().describe("Label ids."),
        type: z.string().optional(),
        parentId: z
          .string()
          .nullable()
          .optional()
          .describe("Makes the new issue a sub-issue of this one right away."),
      }),
    },
    async ({ projectId, ...input }, ctx) => {
      const auth = await authorize(ctx, "issues:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await createIssueForUser(auth.auth.userId, projectId, input, "MCP"),
      );
    },
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get issue",
      description: 'Fetch a single issue by internal id or "PREFIX-123" ref.',
      inputSchema: z.object({
        issueId: z.string().describe('Internal id, or a ref like "ENG-123".'),
        fields: z
          .string()
          .optional()
          .describe(
            'Comma-separated allowlist of fields to return, e.g. "id,title,status".',
          ),
      }),
    },
    async ({ issueId, fields }, ctx) => {
      const auth = await authorize(ctx, "issues:read");
      if (!auth.ok) return auth.result;
      const issue = await getIssueForUser(auth.auth.userId, issueId);
      if (!issue) return notFoundResult();
      return jsonResult(pickFields(issue, fields ?? null));
    },
  );

  server.registerTool(
    "update_issue",
    {
      title: "Update issue",
      description:
        "Update an issue's title, description, status, priority, assignee, labels, type, or parent.",
      inputSchema: z.object({
        issueId: z.string(),
        title: z.string().optional(),
        description: z
          .string()
          .optional()
          .describe(
            "Markdown. `@handle` mentions a workspace member (notifies them); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label|https://...]` (or bare `[https://...]`) becomes a link chip. All resolved server-side; unresolved ones are left as plain text.",
          ),
        status: z.string().optional(),
        priority: z.number().int().optional(),
        assignee: z.string().nullable().optional().describe("User id."),
        labels: z.array(z.string()).optional().describe("Label ids."),
        type: z.string().optional(),
        parentId: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Sets the issue's parent (sub-issue of); `null` clears it.",
          ),
      }),
    },
    async ({ issueId, ...patch }, ctx) => {
      const auth = await authorize(ctx, "issues:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await updateIssueForUser(auth.auth.userId, issueId, patch),
      );
    },
  );

  server.registerTool(
    "add_issue_relation",
    {
      title: "Add issue relation",
      description:
        "Link two issues with a typed edge: BLOCKS, RELATES_TO, or DUPLICATES. The edge is added from `issueId`'s point of view — for BLOCKS/DUPLICATES that means `issueId` blocks/duplicates `relatedId`.",
      inputSchema: z.object({
        issueId: z.string(),
        relatedId: z.string(),
        type: z.enum(["BLOCKS", "RELATES_TO", "DUPLICATES"]),
      }),
    },
    async ({ issueId, ...input }, ctx) => {
      const auth = await authorize(ctx, "issues:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await addIssueRelationForUser(auth.auth.userId, issueId, input),
      );
    },
  );

  server.registerTool(
    "remove_issue_relation",
    {
      title: "Remove issue relation",
      description:
        "Remove a relation edge between two issues (the relation's own id, from `get_issue`'s `relations`).",
      inputSchema: z.object({ relationId: z.string() }),
    },
    async ({ relationId }, ctx) => {
      const auth = await authorize(ctx, "issues:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await removeIssueRelationForUser(auth.auth.userId, relationId),
      );
    },
  );

  // ─── Comments ──────────────────────────────────────────────────────────

  server.registerTool(
    "list_comments",
    {
      title: "List comments",
      description: "List every comment on an issue, oldest first.",
      inputSchema: z.object({ issueId: z.string() }),
    },
    async ({ issueId }, ctx) => {
      const auth = await authorize(ctx, "comments:read");
      if (!auth.ok) return auth.result;
      const data = await listCommentsForUser(auth.auth.userId, issueId);
      return data ? jsonResult(data) : notFoundResult();
    },
  );

  server.registerTool(
    "create_comment",
    {
      title: "Create comment",
      description: "Post a comment on an issue, optionally as a reply.",
      inputSchema: z.object({
        issueId: z.string(),
        body: z
          .string()
          .describe(
            "Markdown. `@handle` mentions a workspace member (notifies them); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label|https://...]` (or bare `[https://...]`) becomes a link chip. All resolved server-side; unresolved ones are left as plain text.",
          ),
        parentId: z
          .string()
          .optional()
          .describe("Id of the comment being replied to."),
      }),
    },
    async ({ issueId, ...input }, ctx) => {
      const auth = await authorize(ctx, "comments:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await createCommentForUser(auth.auth.userId, issueId, input, "MCP"),
      );
    },
  );

  server.registerTool(
    "update_comment",
    {
      title: "Update comment",
      description: "Edit a comment's body.",
      inputSchema: z.object({
        commentId: z.string(),
        body: z
          .string()
          .describe(
            "Markdown. `@handle` mentions a workspace member (notifies them); `#PREFIX-123` links another issue; `//2026-08-14` (or `//14.8.2026`) becomes a date chip; `[label|https://...]` (or bare `[https://...]`) becomes a link chip. All resolved server-side; unresolved ones are left as plain text.",
          ),
      }),
    },
    async ({ commentId, body }, ctx) => {
      const auth = await authorize(ctx, "comments:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await updateCommentForUser(auth.auth.userId, commentId, { body }),
      );
    },
  );

  server.registerTool(
    "delete_comment",
    {
      title: "Delete comment",
      description: "Delete a comment (its replies cascade).",
      inputSchema: z.object({ commentId: z.string() }),
    },
    async ({ commentId }, ctx) => {
      const auth = await authorize(ctx, "comments:write");
      if (!auth.ok) return auth.result;
      return mutationResult(
        await deleteCommentForUser(auth.auth.userId, commentId),
      );
    },
  );
}
