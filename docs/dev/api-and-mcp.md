# API and MCP internals

How the public REST API (`/api/v1`), the MCP server (`/api/mcp`) and the webhooks are
built, and the checklists for extending them. For *using* them, see the user guide's
[REST API](../guide/en/integrations/api.md), [MCP server](../guide/en/integrations/mcp.md),
[Webhooks](../guide/en/integrations/webhooks.md) and the generated
[API reference](../guide/en/api-reference/workspaces.md).

## One logic layer, two transports

```
 app/api/v1/**/route.ts ─┐
                         ├─► features/api-v1/{queries,mutations,options,views}.ts ─► db
 lib/mcp/tools.ts ───────┘
```

REST routes and MCP tools are thin shells. The behaviour (what a request *does*, which
fields mean what, which permission it needs) lives in `features/api-v1/`:

| File | Content |
| --- | --- |
| `queries.ts` | Reads, named `*ForUser(userId, …)`: lists, single objects, comments, attachments, members. |
| `mutations.ts` | Writes, also `*ForUser`, returning a `MutationResult<T>`: `{ ok: true, data }` or `{ ok: false, status: 403 \| 404 \| 422, error? }`. |
| `options.ts` | Statuses, priorities, issue types. |
| `views.ts` | Saved views, on top of `features/views`. |
| `richtext.ts` | Markdown in, ProseMirror out (and `@handle`, `#WEB-12`, `//date` chips). |

Because both transports call the same `*ForUser` function, they cannot drift apart on
behaviour; only the packaging differs.

## A REST route

Every route under `app/api/v1/` follows the same four steps. Copy a neighbour, for
example `app/api/v1/issues/[id]/route.ts`:

```ts
const auth = await resolveApiUser(req);                    // 1. who is asking (API key)
if (!auth) return unauthorized();                          //    401
const { ok, info } = await checkRateLimit(auth.keyId);     // 2. 120 requests per minute per key
if (!ok) return rateLimited(info);                         //    429
if (!hasScope(auth, "issues:write")) return insufficientScope();  // 3. the key's ceiling, 403
// 4. parse the body, call the *ForUser function, map its result with the helpers in lib/api/respond.ts
```

Rules that keep the API consistent:

- **Answers are `{ data }`** (and `nextCursor` for pages). Wrap every response with
  `withRateLimitHeaders` so the budget headers are always present.
- **Errors are `{ error: { code } }`.** `mutationJson()` maps a `MutationResult`:
  404 to a bare `null` body, 403 to `forbidden`, 422 to `invalid_body` or the mutation's own
  specific `{ code, message }`. A thing the caller may not see is a **404**, never a 403.
- **Scopes are a ceiling.** `hasScope` says whether the key may call the route; the
  `*ForUser` function still checks the owner's own permissions (`can(...)`).
- The public issue shape is `ApiIssue`; trim fields with `pickFields(item, request.fields)`;
  page with `parseLimit`/`parseCursor`/`encodeCursor` (`lib/api/cursor.ts`: an opaque
  base64url of the last id, limit 1 to 100, default 25).
- An issue can be addressed by id or by reference (`WEB-42`): resolve with `resolveIssueId`.
- Write descriptions and comments as Markdown through `richtext.ts`; never accept raw
  ProseMirror JSON from outside.

## An MCP tool

`lib/mcp/tools.ts` registers one tool per REST route with `server.registerTool(name,
{ title, description, inputSchema }, handler)`. The handler starts with
`authorize(ctx, scope)` (`lib/mcp/context.ts`), the analogue of the three-line route preamble:
token present, rate limit, scope. It returns a ready-made error result if any fails, otherwise
calls the same `*ForUser` function.

- The server is **stateless Streamable HTTP**: a fresh `McpServer` per request, no sessions.
- `lib/mcp/auth.ts` accepts an API key (`bry_`) **or** an OAuth access token (`bryat_`), picked
  by prefix, and passes `userId` and `keyId` along in `extra`.
- A 401 carries a `WWW-Authenticate` header pointing at the protected-resource metadata, which is
  how an app discovers the OAuth flow ([Authentication](authentication.md#oauth-for-mcp)).
- Results are JSON as text; errors are results marked `isError` with the text `code: message`.
  Use `jsonResult`, `mutationResult`, `notFoundResult`, `forbiddenResult` from `context.ts`.
- `get_attachment` can return an image (up to 5 MB) or a text file (up to 512 KB) as content, so
  an assistant can look at a screenshot; links are never fetched by the server.
- Tool input is a flat `z.object`. Path parameters are folded in (`issueId`), and optional
  patch fields stay optional.

## The in-app reference and the website

Three things describe the same API and must agree:

1. the real routes and tools (the truth),
2. the **reference data** the app shows on the *API keys* and *MCP* pages, written by hand in
   `features/account/components/AccountApiKeys/apiDocsData.ts` (REST endpoints and webhook
   events), `filterDocsData.ts` and `AccountMcp/mcpDocsData.ts` (tool descriptions), in both languages,
3. the **user guide's API reference**, `docs/guide/{en,de}/api-reference/`, **generated** from (2)
   and from the MCP tools' real input schemas by `bun run docs:api`
   ([`scripts/docs-api/generate.ts`](../../scripts/docs-api/generate.ts)).

(2) is hand-written, so it is the place where drift can sneak in. Two guards exist: the
generator **fails** if a registered MCP tool has no description in `mcpDocsData.ts` (or the
other way round), and a unit test fails while the generated pages are out of date. Nothing
checks that an endpoint's parameter table matches its route, so when you change a route, update
its entry by hand.

## Checklists

### Adding a REST endpoint

1. Put the logic in `features/api-v1/` as a `*ForUser` function (reuse an existing action's
   rules where you can, so the app and the API cannot disagree).
2. Add `app/api/v1/.../route.ts` following the four steps above. Pick an existing scope or add one
   (`lib/api/scopes.ts` → `API_SCOPES`; a new scope also needs its one-sentence description for the
   key dialog, the `scopeDesc` map is typed `Record<ApiScope, string>` and will not compile without it).
3. Add the matching **MCP tool** in `lib/mcp/tools.ts` (same scope, same function).
4. Document both in the in-app data: the endpoint in `apiDocsData.ts` (params, request and response
   example), the tool in `mcpDocsData.ts`.
5. Run `bun run docs:api` and commit the regenerated pages.
6. Tests: route behaviour in `tests/unit/api-keys/` (see `route.test.ts` for the pattern), the logic
   next to its domain.
7. If it changes what an integrator sees, adjust the guide pages
   (`docs/guide/*/integrations/api.md`).

### Adding a scope

Add it to `API_SCOPES` in `lib/api/scopes.ts` (order matters: the settings grid renders in that
order, read and write of one resource side by side). It is a free string in the database, so no
migration. Then use it in the routes and tools, and describe it in the user guide's scope table.

### Adding a webhook event

1. Add the name to `WEBHOOK_EVENTS` in `lib/webhooks/events.ts`.
2. Call `fireWebhookEvent(workspaceId, "<event>", data)` where the change happens, **after** it has
   succeeded, in **every** place that can cause it (a Server Function *and* the matching API/MCP
   mutation; issues fire from both `features/issues/actions.ts` and `features/api-v1/mutations.ts`).
   Do not `await` it, and never let it throw into the caller.
3. Use the public shape for `data` (`ApiIssue`, the comment shape, a view's stored shape) so
   receivers see what the REST API shows. A deleted object cannot be re-read, so send a small
   snapshot instead (id, reference, title).
4. Add the event to the new-webhook dialog (labels in `messages/*`, list in
   `features/webhooks/components`) and an example payload to `API_DOC_WEBHOOK_EVENTS` in
   `apiDocsData.ts`; run `bun run docs:api`.
5. Test delivery in `tests/unit/webhooks/`.

A view event is sent only for **shared** views; a private view is nobody else's news.

### Changing a response shape

Existing integrations depend on it. Prefer **adding** fields over renaming or removing. The path
carries a version (`/api/v1`); a breaking change belongs in a new version, not in v1.
