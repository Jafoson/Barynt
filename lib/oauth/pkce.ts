import "server-only";
import { createHash } from "node:crypto";

/**
 * OAuth 2.1 requires PKCE for every authorization-code exchange (public
 * clients, no client secret) — S256 only, per the spec's own restriction on
 * `plain` for anything but debugging. `code_verifier` never touches the
 * network except in this final token request; `code_challenge` (its SHA-256,
 * base64url-encoded) is what rides along in the authorize request and gets
 * stored with the authorization code.
 */
export function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: string,
): boolean {
  if (codeChallengeMethod !== "S256") return false;
  const computed = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return computed === codeChallenge;
}
