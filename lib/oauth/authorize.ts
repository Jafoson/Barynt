import "server-only";
import { API_SCOPES, type ApiScope, isApiScope } from "@/lib/api/scopes";
import { db } from "@/lib/db";
import { findOAuthClient } from "@/lib/oauth/clients";
import { generateAuthorizationCode, hashOAuthToken } from "@/lib/oauth/tokens";

const CODE_TTL_MS = 10 * 60 * 1000;

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource?: string;
  scope?: string;
  state?: string;
}

/** Space-separated `scope` param → the subset that's a real `ApiScope`.
 *  Unrecognized words are silently dropped rather than rejected — an MCP
 *  client has no way to know this server's scope catalog in advance, and
 *  erroring on an unknown scope would just break clients that guess. No
 *  recognized scope at all falls back to every scope: the same ceiling a
 *  manually created API key gets when its own creation form is left at
 *  its default (`features/account/actions.ts`), not broader. */
export function resolveRequestedScopes(scope: string | undefined): ApiScope[] {
  const requested = (scope ?? "").split(/\s+/).filter(isApiScope);
  return requested.length > 0 ? requested : [...API_SCOPES];
}

/** Validates everything about an incoming `/oauth/authorize` request that
 *  doesn't depend on who's logged in — client exists, redirect_uri is one
 *  of that client's registered ones (exact match, the spec's own defense
 *  against open redirects), and PKCE is S256. Called before the consent
 *  screen renders, so a bad request never even reaches "do you approve?". */
export async function validateAuthorizeRequest(
  req: AuthorizeRequest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = await findOAuthClient(req.clientId);
  if (!client) return { ok: false, error: "Unknown client_id." };
  if (!client.redirectUris.includes(req.redirectUri)) {
    return {
      ok: false,
      error: "redirect_uri does not match a registered value.",
    };
  }
  if (req.codeChallengeMethod !== "S256") {
    return { ok: false, error: "code_challenge_method must be S256." };
  }
  if (!req.codeChallenge) {
    return { ok: false, error: "code_challenge is required." };
  }
  return { ok: true };
}

/** Only called after `validateAuthorizeRequest` passed and the logged-in
 *  user approved on the consent screen — creates the one-time code
 *  `/oauth/token` will redeem. */
export async function createAuthorizationCode(
  req: AuthorizeRequest,
  userId: string,
): Promise<string> {
  const code = generateAuthorizationCode();
  await db.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashOAuthToken(code),
      clientId: req.clientId,
      userId,
      redirectUri: req.redirectUri,
      codeChallenge: req.codeChallenge,
      codeChallengeMethod: req.codeChallengeMethod,
      resource: req.resource,
      scopes: resolveRequestedScopes(req.scope),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}
