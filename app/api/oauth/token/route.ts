import {
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "@/lib/oauth/exchange";

// OAuth 2.1 token endpoint — form-encoded body per spec convention (not
// JSON), handling both grants a public MCP client needs:
// `authorization_code` (the initial exchange, `/oauth/authorize` →
// consent → here) and `refresh_token` (silent renewal once the short-lived
// access token expires, `lib/oauth/exchange.ts` rotates it every time).
export async function POST(request: Request): Promise<Response> {
  let form: URLSearchParams;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    form = contentType.includes("application/json")
      ? new URLSearchParams(
          Object.entries(await request.json()).map(([k, v]) => [k, String(v)]),
        )
      : new URLSearchParams(await request.text());
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const grantType = form.get("grant_type");
  const clientId = form.get("client_id");
  if (!clientId) {
    return Response.json(
      { error: "invalid_client", error_description: "client_id is required." },
      { status: 400 },
    );
  }

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const redirectUri = form.get("redirect_uri");
    const codeVerifier = form.get("code_verifier");
    if (!code || !redirectUri || !codeVerifier) {
      return Response.json(
        {
          error: "invalid_request",
          error_description:
            "code, redirect_uri, and code_verifier are required.",
        },
        { status: 400 },
      );
    }

    const result = await exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier,
      resource: form.get("resource") ?? undefined,
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json(result.tokens);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken) {
      return Response.json(
        {
          error: "invalid_request",
          error_description: "refresh_token is required.",
        },
        { status: 400 },
      );
    }

    const result = await refreshAccessToken({
      refreshToken,
      clientId,
      resource: form.get("resource") ?? undefined,
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json(result.tokens);
  }

  return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
}
