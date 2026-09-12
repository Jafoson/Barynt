import "server-only";
import { appUrl } from "@/lib/app-url";

/** The canonical MCP server URI (RFC 8707) every OAuth token in this app is
 *  bound to — the one resource this authorization server ever issues
 *  tokens for. Shared between the discovery metadata, the token endpoint's
 *  `resource` validation, and `lib/mcp/auth.ts`'s audience check. */
export function mcpResourceUri(): string {
  return appUrl("/api/mcp");
}
