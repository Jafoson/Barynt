import { appUrl } from "@/lib/app-url";

// RFC 8414 — OAuth 2.0 Authorization Server Metadata. `code_challenge_methods_supported`
// listing only `S256` is deliberate: PKCE is mandatory here (`lib/oauth/pkce.ts`
// rejects `plain` outright), and advertising it tells a client not to bother
// offering the weaker method.
export function GET(): Response {
  const issuer = appUrl("");
  return Response.json({
    issuer,
    authorization_endpoint: appUrl("/oauth/authorize"),
    token_endpoint: appUrl("/api/oauth/token"),
    registration_endpoint: appUrl("/api/oauth/register"),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
