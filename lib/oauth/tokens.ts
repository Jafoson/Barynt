import "server-only";
import { randomBytes } from "node:crypto";
import { hashApiToken } from "@/lib/api-auth";

// Same shape as personal API keys (`bry_...`, `features/account/actions.ts`)
// — 256 bits of CSPRNG entropy, base64url-encoded, hashed with the same
// SHA-256 helper for lookup. Distinct prefixes so a token's origin (and
// which table to check) is obvious from the string alone, and so the two
// never collide even though both are valid bearer tokens at `/api/mcp`.
export function generateAuthorizationCode(): string {
  return `bryoc_${randomBytes(32).toString("base64url")}`;
}

export function generateAccessToken(): string {
  return `bryat_${randomBytes(32).toString("base64url")}`;
}

export function generateRefreshToken(): string {
  return `bryrt_${randomBytes(32).toString("base64url")}`;
}

/** Re-exported for the OAuth token tables — identical SHA-256-over-the-raw-
 *  token scheme as `ApiKey.tokenHash`, no reason for a second definition. */
export { hashApiToken as hashOAuthToken };
