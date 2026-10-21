import type { GuideRow } from "./GuideParts";

// The two other "Basics" guides of the API docs (BARY-172) — signing in
// and paging. English like the rest of the docs content; numbers mirror
// `lib/api/rateLimit.ts` and `lib/api/cursor.ts`.

export const AUTH_DOC_INTRO = [
  "Every request carries one of your API keys in the Authorization header, as a Bearer token. Keys start with bry_.",
  "Create keys above. The full key is shown once — copy it then. Later you only see its first characters. A key can expire, and you can revoke it at any time.",
];

export const AUTH_DOC_EXAMPLE = `curl https://<your-barynt>/api/v1/workspaces \\
  -H "Authorization: Bearer bry_…"`;

export const AUTH_DOC_SCOPES = [
  "Each endpoint names the scope it needs, e.g. issues:read. A key reaches only the endpoints its scopes allow.",
  "A scope never grants more than you have: the key acts as you, with your roles. What you can't see in the app, the key can't see either.",
  "Missing scope: 403 with code insufficient_scope. Something you can't see: 404 — the API doesn't tell whether it exists.",
];

export const AUTH_DOC_RATE: GuideRow[] = [
  {
    name: "120 / minute",
    desc: "Requests per key. Every response says where you stand.",
  },
  { name: "X-RateLimit-Limit", desc: "The budget per minute." },
  { name: "X-RateLimit-Remaining", desc: "What's left of it." },
  {
    name: "X-RateLimit-Reset",
    desc: "When it refills, in milliseconds since 1970.",
  },
  {
    name: "429 rate_limited",
    desc: "Budget used up. Retry-After says how many seconds to wait.",
  },
];

export const AUTH_DOC_MCP =
  "The same keys work for the MCP server (Account → MCP), with the same scopes and the same budget.";

export const PAGING_DOC_INTRO = [
  "Lists that can grow long come in pages, newest first: a project's issues and a view's issues.",
  "Ask for up to limit items (1–100, default 25). If there's more, the response has a nextCursor — send it back as cursor for the next page. nextCursor null means you've seen everything.",
];

export const PAGING_DOC_EXAMPLE = `let cursor = null;
do {
  const url = new URL("https://<your-barynt>/api/v1/projects/proj_9f8e7d/issues");
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url, {
    headers: { Authorization: "Bearer bry_…" },
  });
  const { data, nextCursor } = await res.json();
  // … use data …
  cursor = nextCursor;
} while (cursor);`;

export const PAGING_DOC_PARAMS: GuideRow[] = [
  { name: "limit", type: "1–100", desc: "Items per page. Default 25." },
  {
    name: "cursor",
    type: "string",
    desc: "The previous page's nextCursor. Opaque — pass it on as it is.",
  },
  {
    name: "nextCursor",
    type: "string | null",
    desc: "In the response. null on the last page.",
  },
];

export const PAGING_DOC_FIELDS = [
  "On issue endpoints, fields trims each item to the keys you name — smaller responses, faster to read.",
  "fields=id,ref,title,status returns just those four. id is always included.",
];

export const PAGING_DOC_FIELDS_EXAMPLE = `GET /api/v1/projects/proj_9f8e7d/issues?fields=ref,title,statusCategory

{
  "data": [
    { "id": "i_4k2n1x", "ref": "WEB-42", "title": "Fix broken checkout flow", "statusCategory": "started" }
  ],
  "nextCursor": "aV80azJuMXg"
}`;
