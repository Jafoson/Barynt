import type { ApiScope } from "@/lib/api/scopes";

// Reference data for the API documentation panel below the key manager
// (`ApiDocs.tsx`). Kept in English regardless of UI locale — same
// convention as GitHub/Stripe/Jira: the wire format (field names, JSON) is
// the actual contract and stays in the language it's written in, only the
// surrounding chrome (tab labels, section headings) goes through next-intl.
//
// Mirrors the real route handlers under `app/api/v1` field-for-field —
// keep this in sync by hand when a route's shape changes, there's no
// generator wiring the two together.

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiDocParam {
  name: string;
  type: string;
  required?: boolean;
  desc: string;
}

export interface ApiDocEndpoint {
  method: HttpMethod;
  path: string;
  scope: ApiScope;
  desc: string;
  pathParams?: ApiDocParam[];
  queryParams?: ApiDocParam[];
  bodyParams?: ApiDocParam[];
  /** Pretty-printed JSON, exactly as the route returns it. */
  response: string;
}

export type ApiDocGroupId =
  | "workspaces"
  | "projects"
  | "issues"
  | "comments"
  | "labels";

export interface ApiDocGroup {
  id: ApiDocGroupId;
  endpoints: ApiDocEndpoint[];
}

const idParam = (resource: string): ApiDocParam => ({
  name: "id",
  type: "string",
  required: true,
  desc: `The ${resource}'s id.`,
});

export const API_DOC_GROUPS: ApiDocGroup[] = [
  {
    id: "workspaces",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/workspaces",
        scope: "workspaces:read",
        desc: "List the workspaces you belong to.",
        response: `{
  "data": [
    {
      "id": "ws_1a2b3c",
      "name": "Acme Inc",
      "color": "#6e63e6",
      "avatarUrl": null
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/v1/workspaces",
        scope: "workspaces:write",
        desc: "Create a workspace. You become its owner. Unlike creating one in the app, this does not also create a first project — create one explicitly via the projects endpoint below.",
        bodyParams: [
          { name: "name", type: "string", required: true, desc: "" },
          {
            name: "slug",
            type: "string",
            required: true,
            desc: "Lowercase letters, numbers, and hyphens. Appended with a number if already taken.",
          },
          {
            name: "color",
            type: "string",
            desc: 'A hex color. Default "#6e63e6".',
          },
        ],
        response: `// 201 Created
{
  "data": {
    "id": "acme",
    "name": "Acme Inc",
    "color": "#6e63e6",
    "avatarUrl": null
  }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/workspaces/{id}",
        scope: "workspaces:write",
        desc: "Update a workspace. Every field is optional — send only what changes.",
        pathParams: [idParam("workspace")],
        bodyParams: [
          { name: "name", type: "string", desc: "" },
          { name: "color", type: "string", desc: "A hex color." },
          { name: "desc", type: "string", desc: "A one-sentence description." },
        ],
        response: `{
  "data": { "id": "acme" }
}`,
      },
      {
        method: "DELETE",
        path: "/api/v1/workspaces/{id}",
        scope: "workspaces:write",
        desc: "Delete a workspace, along with every project and issue in it. This cannot be undone.",
        pathParams: [idParam("workspace")],
        response: `{
  "data": { "id": "acme" }
}`,
      },
    ],
  },
  {
    id: "projects",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/workspaces/{id}/projects",
        scope: "projects:read",
        desc: "List the projects in a workspace that you can see.",
        pathParams: [idParam("workspace")],
        response: `{
  "data": [
    {
      "id": "proj_9f8e7d",
      "name": "Website Relaunch",
      "slug": "website-relaunch",
      "prefix": "WEB",
      "color": "#3b7bd5"
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/v1/workspaces/{id}/projects",
        scope: "projects:write",
        desc: "Create a project in a workspace.",
        pathParams: [idParam("workspace")],
        bodyParams: [
          { name: "name", type: "string", required: true, desc: "" },
          { name: "desc", type: "string", desc: "A one-sentence description." },
          {
            name: "prefix",
            type: "string",
            desc: 'Up to 4 letters, used in issue refs (e.g. "WEB"). Derived from the name if omitted, appended with a number if already taken.',
          },
          {
            name: "color",
            type: "string",
            required: true,
            desc: "A hex color.",
          },
          {
            name: "visibility",
            type: '"public" | "private"',
            desc: 'A public project enrolls every workspace member. Default "public".',
          },
        ],
        response: `// 201 Created
{
  "data": {
    "id": "proj_9f8e7d",
    "name": "Website Relaunch",
    "slug": "website-relaunch",
    "prefix": "WEB",
    "color": "#3b7bd5"
  }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/projects/{id}",
        scope: "projects:write",
        desc: "Update a project. Every field is optional — send only what changes.",
        pathParams: [idParam("project")],
        bodyParams: [
          { name: "name", type: "string", desc: "" },
          { name: "desc", type: "string", desc: "" },
          { name: "prefix", type: "string", desc: "Up to 4 letters." },
          { name: "color", type: "string", desc: "A hex color." },
          { name: "visibility", type: '"public" | "private"', desc: "" },
        ],
        response: `{
  "data": { "id": "proj_9f8e7d" }
}`,
      },
      {
        method: "DELETE",
        path: "/api/v1/projects/{id}",
        scope: "projects:write",
        desc: "Delete a project, along with every issue in it. This cannot be undone.",
        pathParams: [idParam("project")],
        response: `{
  "data": { "id": "proj_9f8e7d" }
}`,
      },
    ],
  },
  {
    id: "issues",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/projects/{id}/issues",
        scope: "issues:read",
        desc: "List issues in a project, newest first, cursor-paginated.",
        pathParams: [idParam("project")],
        queryParams: [
          { name: "status", type: "string", desc: "Filter by status key." },
          {
            name: "assignee",
            type: "string",
            desc: "Filter by assignee user id.",
          },
          {
            name: "q",
            type: "string",
            desc: "Case-insensitive substring match against title and description.",
          },
          {
            name: "fields",
            type: "string",
            desc: 'Comma-separated allowlist, e.g. "id,title,status" — trims the response to just those keys ("id" always included).',
          },
          {
            name: "cursor",
            type: "string",
            desc: "From the previous page's `nextCursor`.",
          },
          {
            name: "limit",
            type: "integer",
            desc: "Page size, 1–100. Default 25.",
          },
        ],
        response: `{
  "data": [
    {
      "id": "i_4k2n1x",
      "ref": "WEB-42",
      "title": "Fix broken checkout flow",
      "status": "in_progress",
      "priority": 2,
      "type": "bug",
      "labels": [
        { "id": "l_9f2a1b", "name": "frontend", "color": "#3b7bd5" }
      ],
      "assignee": { "id": "u_7h3j2k", "name": "Priya Shah" },
      "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
      "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
      "description": "Checkout fails on Safari when …",
      "created": "2026-03-01T09:12:00.000Z",
      "updated": "2026-03-04T15:40:00.000Z",
      "closedAt": null
    }
  ],
  "nextCursor": "eyJpZCI6ImlfNGsybjF4In0"
}`,
      },
      {
        method: "POST",
        path: "/api/v1/projects/{id}/issues",
        scope: "issues:write",
        desc: "Create an issue. The reporter is always the token's owner, never a body field.",
        pathParams: [idParam("project")],
        bodyParams: [
          { name: "title", type: "string", required: true, desc: "" },
          {
            name: "description",
            type: "string",
            desc: "Markdown, converted server-side.",
          },
          {
            name: "status",
            type: "string",
            desc: 'A status key of the project. Default "backlog".',
          },
          { name: "priority", type: "integer", desc: "0–4. Default 0." },
          {
            name: "assignee",
            type: "string | null",
            desc: "A user id, or null.",
          },
          { name: "labels", type: "string[]", desc: "Label ids." },
          {
            name: "type",
            type: "string",
            desc: 'An issue type key. Default "feature".',
          },
        ],
        response: `// 201 Created
{
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "backlog",
    "priority": 2,
    "type": "feature",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend", "color": "#3b7bd5" }
    ],
    "assignee": null,
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-04T15:40:00.000Z",
    "updated": "2026-03-04T15:40:00.000Z",
    "closedAt": null
  }
}`,
      },
      {
        method: "GET",
        path: "/api/v1/issues/{id}",
        scope: "issues:read",
        desc: "Get a single issue by id.",
        pathParams: [idParam("issue")],
        queryParams: [
          {
            name: "fields",
            type: "string",
            desc: 'Comma-separated allowlist, e.g. "id,title,status" — trims the response to just those keys ("id" always included).',
          },
        ],
        response: `{
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "in_progress",
    "priority": 2,
    "type": "bug",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend", "color": "#3b7bd5" }
    ],
    "assignee": { "id": "u_7h3j2k", "name": "Priya Shah" },
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-01T09:12:00.000Z",
    "updated": "2026-03-04T15:40:00.000Z",
    "closedAt": null
  }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/issues/{id}",
        scope: "issues:write",
        desc: "Update an issue. Every field is optional — send only what changes. Re-assigning also requires the `issue.assign` permission on your own role.",
        pathParams: [idParam("issue")],
        bodyParams: [
          { name: "title", type: "string", desc: "" },
          {
            name: "description",
            type: "string",
            desc: "Markdown, converted server-side.",
          },
          {
            name: "status",
            type: "string",
            desc: "A status key of the project.",
          },
          { name: "priority", type: "integer", desc: "0–4." },
          {
            name: "assignee",
            type: "string | null",
            desc: "A user id, or null to unassign.",
          },
          { name: "labels", type: "string[]", desc: "Label ids." },
          { name: "type", type: "string", desc: "An issue type key." },
        ],
        response: `{
  "data": { "id": "i_4k2n1x" }
}`,
      },
    ],
  },
  {
    id: "comments",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/issues/{id}/comments",
        scope: "comments:read",
        desc: "List the comments on an issue, oldest first.",
        pathParams: [idParam("issue")],
        response: `{
  "data": [
    {
      "id": "c_5m9p3q",
      "issueId": "i_4k2n1x",
      "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
      "parentId": null,
      "body": "Confirmed on Safari 17.",
      "created": "2026-03-02T10:05:00.000Z",
      "updated": null
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/v1/issues/{id}/comments",
        scope: "comments:write",
        desc: "Create a comment on an issue. The author is always the token's owner, never a body field.",
        pathParams: [idParam("issue")],
        bodyParams: [
          {
            name: "body",
            type: "string",
            required: true,
            desc: "Markdown, converted server-side.",
          },
          {
            name: "parentId",
            type: "string",
            desc: "A comment id to reply to. Omit for a top-level comment.",
          },
        ],
        response: `// 201 Created
{
  "data": {
    "id": "c_5m9p3q",
    "issueId": "i_4k2n1x",
    "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "parentId": null,
    "body": "Confirmed on Safari 17.",
    "created": "2026-03-04T15:40:00.000Z",
    "updated": null
  }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/comments/{id}",
        scope: "comments:write",
        desc: "Update a comment. You can always edit your own; editing someone else's additionally requires the comment.update.any permission on your role.",
        pathParams: [idParam("comment")],
        bodyParams: [
          {
            name: "body",
            type: "string",
            required: true,
            desc: "Markdown, converted server-side.",
          },
        ],
        response: `{
  "data": { "id": "c_5m9p3q" }
}`,
      },
      {
        method: "DELETE",
        path: "/api/v1/comments/{id}",
        scope: "comments:write",
        desc: "Delete a comment and its replies. You can always delete your own; deleting someone else's additionally requires the comment.delete.any permission on your role.",
        pathParams: [idParam("comment")],
        response: `{
  "data": { "id": "c_5m9p3q" }
}`,
      },
    ],
  },
  {
    id: "labels",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/workspaces/{id}/labels",
        scope: "labels:read",
        desc: "List every label visible in a workspace — workspace-wide labels plus those of every project you can see.",
        pathParams: [idParam("workspace")],
        response: `{
  "data": [
    {
      "id": "l_9f2a1b",
      "name": "frontend",
      "slug": "frontend",
      "color": "#3b7bd5",
      "projectId": null
    }
  ]
}`,
      },
      {
        method: "POST",
        path: "/api/v1/workspaces/{id}/labels",
        scope: "labels:write",
        desc: "Create a label. Omit projectId for a workspace-wide label that applies everywhere.",
        pathParams: [idParam("workspace")],
        bodyParams: [
          { name: "name", type: "string", required: true, desc: "" },
          {
            name: "color",
            type: "string",
            required: true,
            desc: "A hex color.",
          },
          {
            name: "projectId",
            type: "string",
            desc: "Scope the label to a single project instead of the whole workspace.",
          },
        ],
        response: `// 201 Created
{
  "data": {
    "id": "l_9f2a1b",
    "name": "frontend",
    "slug": "frontend",
    "color": "#3b7bd5",
    "projectId": null
  }
}`,
      },
      {
        method: "PATCH",
        path: "/api/v1/labels/{id}",
        scope: "labels:write",
        desc: "Update a label's name and/or color. Every field is optional — send only what changes.",
        pathParams: [idParam("label")],
        bodyParams: [
          { name: "name", type: "string", desc: "" },
          { name: "color", type: "string", desc: "A hex color." },
        ],
        response: `{
  "data": { "id": "l_9f2a1b" }
}`,
      },
      {
        method: "DELETE",
        path: "/api/v1/labels/{id}",
        scope: "labels:write",
        desc: "Delete a label and remove it from every issue it's attached to.",
        pathParams: [idParam("label")],
        response: `{
  "data": { "id": "l_9f2a1b" }
}`,
      },
    ],
  },
];

export interface ApiDocError {
  status: number;
  code: string | null;
}

export const API_DOC_ERRORS: ApiDocError[] = [
  { status: 401, code: "unauthorized" },
  { status: 403, code: "insufficient_scope" },
  { status: 404, code: null },
  { status: 422, code: "invalid_body" },
  { status: 429, code: "rate_limited" },
];

// ─── Webhooks ────────────────────────────────────────────────────────────────
//
// Not a REST endpoint you call — an outbound push (`lib/webhooks/deliver.ts`)
// registered under Settings → Webhooks (`webhook.manage`). Documented
// separately from `API_DOC_GROUPS` because there's nothing to request/
// respond to: what matters here is the signature and the payload shape.

export interface ApiDocWebhookEvent {
  event: string;
  desc: string;
  /** Pretty-printed JSON, exactly as delivered in the request body. */
  payload: string;
}

export const API_DOC_WEBHOOK_EVENTS: ApiDocWebhookEvent[] = [
  {
    event: "issue.created",
    desc: "An issue was created, via the app or this API.",
    payload: `{
  "event": "issue.created",
  "timestamp": 1772870400000,
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "backlog",
    "priority": 2,
    "type": "feature",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend", "color": "#3b7bd5" }
    ],
    "assignee": null,
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-04T15:40:00.000Z",
    "updated": "2026-03-04T15:40:00.000Z",
    "closedAt": null
  }
}`,
  },
  {
    event: "issue.updated",
    desc: "An issue changed — the full current issue, not a diff of just what changed.",
    payload: `{
  "event": "issue.updated",
  "timestamp": 1772870400000,
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "title": "Fix broken checkout flow",
    "status": "done",
    "priority": 2,
    "type": "bug",
    "labels": [
      { "id": "l_9f2a1b", "name": "frontend", "color": "#3b7bd5" }
    ],
    "assignee": { "id": "u_7h3j2k", "name": "Priya Shah" },
    "reporter": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "project": { "id": "proj_9f8e7d", "name": "Website Relaunch" },
    "description": "Checkout fails on Safari when …",
    "created": "2026-03-01T09:12:00.000Z",
    "updated": "2026-03-05T11:02:00.000Z",
    "closedAt": "2026-03-05T11:02:00.000Z"
  }
}`,
  },
  {
    event: "issue.deleted",
    desc: "An issue was deleted — a minimal snapshot, not the full shape, since the issue no longer exists to look up.",
    payload: `{
  "event": "issue.deleted",
  "timestamp": 1772870400000,
  "data": {
    "id": "i_4k2n1x",
    "ref": "WEB-42",
    "projectId": "proj_9f8e7d",
    "title": "Fix broken checkout flow"
  }
}`,
  },
  {
    event: "comment.created",
    desc: "A comment was added to an issue, via the app or this API.",
    payload: `{
  "event": "comment.created",
  "timestamp": 1772870400000,
  "data": {
    "id": "c_5m9p3q",
    "issueId": "i_4k2n1x",
    "author": { "id": "u_1a2b3c", "name": "Alex Kim" },
    "parentId": null,
    "body": "Confirmed on Safari 17.",
    "created": "2026-03-02T10:05:00.000Z",
    "updated": null
  }
}`,
  },
];

export const API_DOC_WEBHOOK_SIGNATURE = {
  headers: [
    {
      name: "X-Barynt-Signature",
      desc: 'Hex-encoded HMAC-SHA256, no prefix (unlike GitHub\'s "sha256=").',
    },
    {
      name: "X-Barynt-Timestamp",
      desc: "Unix milliseconds — include it in the signed string to reject replayed deliveries.",
    },
  ],
  formula: `signature = hex(HMAC_SHA256(secret, timestamp + "." + rawRequestBody))`,
  verify: `// Node.js
import { createHmac, timingSafeEqual } from "node:crypto";

function isValid(secret, timestamp, rawBody, signature) {
  const expected = createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}`,
};
