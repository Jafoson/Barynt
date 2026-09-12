import "server-only";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { resolveApiUser } from "@/lib/api-auth";
import { verifyOAuthAccessToken } from "@/lib/oauth/verify";

/**
 * `verifyToken` for `withMcpAuth` (`mcp-handler`) — the MCP-transport
 * counterpart to `resolveApiUser`, which every `app/api/v1` route already
 * uses. Deliberately calls it instead of duplicating the lookup: same
 * `bry_...` personal API keys, same hashing, same revoked/expired/
 * deactivated checks. `resolveApiUser` re-reads `Authorization` off `req`
 * itself, so the already-extracted `bearerToken` here only gates the
 * shortcut for "no token at all" before touching the database.
 *
 * Accepts a `bryat_...` OAuth access token (`lib/oauth/verify.ts`) the same
 * way — the two are tried by prefix, never both, since a token is only ever
 * one or the other. This is what lets an MCP client either paste a
 * personal API key or go through the full OAuth flow (`/oauth/authorize`)
 * and land at the exact same tool surface either way.
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

  const auth = bearerToken.startsWith("bryat_")
    ? await verifyOAuthAccessToken(bearerToken)
    : await resolveApiUser(req);
  if (!auth) return undefined;

  return {
    token: bearerToken,
    clientId: auth.userId,
    scopes: auth.scopes,
    extra: { userId: auth.userId, keyId: auth.keyId },
  };
}
