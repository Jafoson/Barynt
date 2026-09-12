import "server-only";
import type { ApiScope } from "@/lib/api/scopes";
import { db } from "@/lib/db";
import { verifyPkce } from "@/lib/oauth/pkce";
import { mcpResourceUri } from "@/lib/oauth/resource";
import {
  generateAccessToken,
  generateRefreshToken,
  hashOAuthToken,
} from "@/lib/oauth/tokens";

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — short-lived per spec's own recommendation
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d

export interface TokenIssueResult {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type TokenError =
  | "invalid_grant"
  | "invalid_client"
  | "invalid_target"
  | "invalid_request";

function issued(
  accessToken: string,
  refreshToken: string,
  scopes: ApiScope[],
): TokenIssueResult {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  };
}

function validateResource(
  resource: string | undefined,
): { ok: true } | { ok: false } {
  // Absent is allowed — not every client sends it — but a *mismatched*
  // resource means the caller thinks it's talking to a different MCP
  // server than this one, which must never mint a token that would work
  // here (RFC 8707 audience binding).
  if (resource !== undefined && resource !== mcpResourceUri()) {
    return { ok: false };
  }
  return { ok: true };
}

/** Redeems a one-time authorization code — `POST /oauth/token` with
 *  `grant_type=authorization_code`. Every check the code carries from
 *  `/oauth/authorize` gets re-verified here: it hasn't already been used
 *  (single use, replay defense), hasn't expired, the calling client and
 *  redirect_uri match exactly what it was issued for, the PKCE verifier
 *  hashes to the stored challenge, and (if present) the resource matches
 *  this server. */
export async function exchangeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<
  { ok: true; tokens: TokenIssueResult } | { ok: false; error: TokenError }
> {
  const row = await db.oAuthAuthorizationCode.findUnique({
    where: { codeHash: hashOAuthToken(params.code) },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    return { ok: false, error: "invalid_grant" };
  }
  if (
    row.clientId !== params.clientId ||
    row.redirectUri !== params.redirectUri
  ) {
    return { ok: false, error: "invalid_grant" };
  }
  if (
    !verifyPkce(params.codeVerifier, row.codeChallenge, row.codeChallengeMethod)
  ) {
    return { ok: false, error: "invalid_grant" };
  }
  if (!validateResource(params.resource ?? row.resource ?? undefined).ok) {
    return { ok: false, error: "invalid_target" };
  }

  // Marking the code used and minting the token pair happen together in
  // one transaction — a code that's consumed but produced nothing (crash
  // in between) would strand the client with no way to retry the exchange.
  const scopes = row.scopes as ApiScope[];
  const resource = params.resource ?? row.resource ?? mcpResourceUri();
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();

  const redeemed = await db.$transaction(async (tx) => {
    const usedNow = await tx.oAuthAuthorizationCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (usedNow.count === 0) {
      // Lost a race with a concurrent redemption of the same code.
      return false;
    }

    const accessRow = await tx.oAuthAccessToken.create({
      data: {
        tokenHash: hashOAuthToken(accessToken),
        clientId: row.clientId,
        userId: row.userId,
        scopes,
        resource,
        expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
      },
    });
    await tx.oAuthRefreshToken.create({
      data: {
        tokenHash: hashOAuthToken(refreshToken),
        clientId: row.clientId,
        userId: row.userId,
        scopes,
        resource,
        accessTokenId: accessRow.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return true;
  });

  if (!redeemed) return { ok: false, error: "invalid_grant" };

  return { ok: true, tokens: issued(accessToken, refreshToken, scopes) };
}

/** `POST /oauth/token` with `grant_type=refresh_token` — OAuth 2.1 requires
 *  rotation for public clients: every use retires the presented refresh
 *  token and its paired access token, and mints a brand new pair. Reusing
 *  an already-retired refresh token is exactly the "was this token
 *  stolen?" signal OAuth 2.1 calls out — treated here as a compromise of
 *  that whole grant, so every other still-live token from the same
 *  original grant (any access/refresh token this client holds for this
 *  user) is revoked too, not just the replayed one. */
export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  resource?: string;
}): Promise<
  { ok: true; tokens: TokenIssueResult } | { ok: false; error: TokenError }
> {
  const row = await db.oAuthRefreshToken.findUnique({
    where: { tokenHash: hashOAuthToken(params.refreshToken) },
  });
  if (!row || row.clientId !== params.clientId) {
    return { ok: false, error: "invalid_grant" };
  }
  if (row.revokedAt) {
    // Replay of a token already retired by an earlier refresh — revoke the
    // rest of this user+client's live grants as a precaution.
    await db.$transaction([
      db.oAuthAccessToken.updateMany({
        where: { userId: row.userId, clientId: row.clientId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      db.oAuthRefreshToken.updateMany({
        where: { userId: row.userId, clientId: row.clientId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: false, error: "invalid_grant" };
  }
  if (row.expiresAt <= new Date()) {
    return { ok: false, error: "invalid_grant" };
  }
  if (!validateResource(params.resource ?? row.resource ?? undefined).ok) {
    return { ok: false, error: "invalid_target" };
  }

  const scopes = row.scopes as ApiScope[];
  const resource = params.resource ?? row.resource ?? mcpResourceUri();
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();

  await db.$transaction(async (tx) => {
    await tx.oAuthRefreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    if (row.accessTokenId) {
      await tx.oAuthAccessToken.update({
        where: { id: row.accessTokenId },
        data: { revokedAt: new Date() },
      });
    }

    const accessRow = await tx.oAuthAccessToken.create({
      data: {
        tokenHash: hashOAuthToken(accessToken),
        clientId: row.clientId,
        userId: row.userId,
        scopes,
        resource,
        expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
      },
    });
    await tx.oAuthRefreshToken.create({
      data: {
        tokenHash: hashOAuthToken(refreshToken),
        clientId: row.clientId,
        userId: row.userId,
        scopes,
        resource,
        accessTokenId: accessRow.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
  });

  return { ok: true, tokens: issued(accessToken, refreshToken, scopes) };
}
