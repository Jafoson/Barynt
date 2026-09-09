import "server-only";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { resolveApiUser } from "@/lib/api-auth";

/**
 * `verifyToken` for `withMcpAuth` (`mcp-handler`) — the MCP-transport
 * counterpart to `resolveApiUser`, which every `app/api/v1` route already
 * uses. Deliberately calls it instead of duplicating the lookup: same
 * `bry_...` personal API keys, same hashing, same revoked/expired/
 * deactivated checks. `resolveApiUser` re-reads `Authorization` off `req`
 * itself, so the already-extracted `bearerToken` here only gates the
 * shortcut for "no token at all" before touching the database.
 *
 * `userId`/`keyId` ride along in `extra` — `AuthInfo.clientId` is a plain
 * string with no reserved meaning `can()`/`checkRateLimit()` could use
 * directly, so the tool layer (`lib/mcp/context.ts`) reads them back out of
 * `extra` rather than out of `clientId`/`scopes` positions that happen to
 * fit today.
 */
export async function verifyMcpToken(
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const auth = await resolveApiUser(req);
  if (!auth) return undefined;

  return {
    token: bearerToken,
    clientId: auth.userId,
    scopes: auth.scopes,
    extra: { userId: auth.userId, keyId: auth.keyId },
  };
}
