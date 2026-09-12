import { appUrl } from "@/lib/app-url";
import { mcpResourceUri } from "@/lib/oauth/resource";

// RFC 9728 — OAuth 2.0 Protected Resource Metadata. The MCP authorization
// spec requires exactly this: the 401 from `/api/mcp` points here
// (`WWW-Authenticate: ... resource_metadata=...`), and this document in
// turn points at the authorization server. Barynt plays both roles itself
// (`.well-known/oauth-authorization-server`), same as the spec's own
// "may be hosted with the resource server" allowance.
export function GET(): Response {
  return Response.json({
    resource: mcpResourceUri(),
    authorization_servers: [appUrl("")],
  });
}
