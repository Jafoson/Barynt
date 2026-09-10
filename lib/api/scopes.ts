// Scopes for personal API keys (`app/api/v1`) — granular, Jira-style
// "<resource>:<action>" strings instead of a blanket read/write toggle. One
// scope per route surface, so a key can be issued for exactly what an
// integration needs (e.g. only `issues:read`) instead of all-or-nothing.
//
// A key is a User Access Token, not a service account: scopes can only
// narrow what the owning user is already allowed to do — every route still
// runs the normal RBAC check (`can(userId, permission, ctx)`) on top. Never
// treat a granted scope as a grant of access by itself.
//
// Order matters here: the settings UI (`AccountApiKeys`) renders this list
// as a two-column grid in exactly this order — read/write pairs of the same
// resource stay next to each other. `members:read` has no write half: the
// public API has no endpoint that adds or removes a member, only invite
// flows already in the app.

export const API_SCOPES = [
  "issues:read",
  "issues:write",
  "comments:read",
  "comments:write",
  "labels:read",
  "labels:write",
  "projects:read",
  "projects:write",
  "workspaces:read",
  "workspaces:write",
  "members:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

const API_SCOPE_SET: ReadonlySet<string> = new Set(API_SCOPES);

export function isApiScope(value: string): value is ApiScope {
  return API_SCOPE_SET.has(value);
}
