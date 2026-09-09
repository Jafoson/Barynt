import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { verifyMcpToken } from "@/lib/mcp/auth";
import { registerBaryntTools } from "@/lib/mcp/tools";

// Remote MCP server for the public API (`features/api-v1`) — same
// `bry_...` personal API keys as `app/api/v1` (`lib/mcp/auth.ts` wraps
// `resolveApiUser`), same scopes, same per-key rate limit
// (`lib/mcp/context.ts`'s `authorize()`). Point an MCP client (Claude
// Desktop/Code, ...) at this route's URL with `Authorization: Bearer
// <key>` and it gets the workspace/project/issue/comment/label tools
// registered in `lib/mcp/tools.ts`.
//
// Auth is done by hand here rather than via `mcp-handler`'s `withMcpAuth`:
// that helper hands the verified token to the SDK by setting `req.auth`,
// which requires a global `declare global { interface Request { auth?:
// AuthInfo } }` augmentation — one that collides with next-auth's own
// `NextRequest.auth: Session | null` (`proxy.ts`) on the same property
// name. Calling `@modelcontextprotocol/server`'s `createMcpHandler(...)
// .fetch(request, { authInfo })` directly sidesteps that: `authInfo` is
// passed as a plain argument, never mutated onto the request object, and
// flows through to every tool callback as `ctx.http.authInfo`
// (`lib/mcp/context.ts`'s `authorize()` reads it from there).
//
// Stateless Streamable HTTP (no sessions, no SSE resumption) — every tool
// call is a self-contained request against the database, same as a REST
// call would be, so there's nothing to keep alive between requests. A
// fresh `McpServer` per request matches that: cheap (`registerTool` just
// populates a couple of `Map`s), and it keeps a request's tool set
// independent of any other in-flight request.
const mcp = createMcpHandler(async () => {
  const server = new McpServer({ name: "barynt", version: "1.0.0" });
  registerBaryntTools(server);
  return server;
});

const BEARER = /^Bearer\s+(\S+)$/i;

function unauthorized(): Response {
  return Response.json(
    { error: { code: "unauthorized" } },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="barynt"' } },
  );
}

async function handle(request: Request): Promise<Response> {
  const bearerToken = request.headers.get("authorization")?.match(BEARER)?.[1];
  const authInfo = await verifyMcpToken(request, bearerToken);
  if (!authInfo) return unauthorized();

  return mcp.fetch(request, { authInfo });
}

export { handle as GET, handle as POST };
