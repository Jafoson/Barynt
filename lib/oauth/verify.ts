import "server-only";
import type { ApiAuthResult } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { mcpResourceUri } from "@/lib/oauth/resource";
import { hashOAuthToken } from "@/lib/oauth/tokens";

/** The MCP route's counterpart to `resolveApiUser` — resolves a
 *  `bryat_...` OAuth access token instead of a `bry_...` API key to the
 *  same `{ userId, keyId, scopes }` shape everything downstream
 *  (`lib/mcp/context.ts#authorize`, rate limiting) already expects, so
 *  neither has to know or care which kind of token it's looking at.
 *
 * Validates the token audience (RFC 8707 / the MCP spec's own "MUST
 * validate tokens were issued specifically for them" requirement) against
 * this server's canonical resource URI — an access token minted with a
 * different (or no) `resource` bound at issuance never authenticates here,
 * even if otherwise valid. */
export async function verifyOAuthAccessToken(
  bearerToken: string,
): Promise<ApiAuthResult | null> {
  if (!bearerToken.startsWith("bryat_")) return null;

  const token = await db.oAuthAccessToken.findUnique({
    where: { tokenHash: hashOAuthToken(bearerToken) },
    select: {
      id: true,
      userId: true,
      scopes: true,
      resource: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { deactivatedAt: true } },
    },
  });
  if (!token || token.revokedAt) return null;
  if (token.expiresAt <= new Date()) return null;
  if (token.resource !== mcpResourceUri()) return null;
  if (token.user.deactivatedAt) return null;

  return {
    userId: token.userId,
    keyId: token.id,
    scopes: token.scopes as ApiAuthResult["scopes"],
  };
}
