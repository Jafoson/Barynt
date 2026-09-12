import { registerOAuthClient } from "@/lib/oauth/clients";

// RFC 7591 Dynamic Client Registration — what lets an MCP client (Claude, ...)
// start using this server's OAuth flow the first time it connects, with no
// manual client_id setup on either side (`lib/oauth/clients.ts`).
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: "invalid_client_metadata",
        error_description: "Malformed JSON body.",
      },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const { redirect_uris, client_name } = body as Record<string, unknown>;
  if (
    !Array.isArray(redirect_uris) ||
    !redirect_uris.every((uri) => typeof uri === "string")
  ) {
    return Response.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must be an array of strings.",
      },
      { status: 400 },
    );
  }

  const result = await registerOAuthClient({
    redirectUris: redirect_uris,
    clientName: typeof client_name === "string" ? client_name : undefined,
  });

  if (!result.ok) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: result.error },
      { status: 400 },
    );
  }

  return Response.json(result.client, { status: 201 });
}
