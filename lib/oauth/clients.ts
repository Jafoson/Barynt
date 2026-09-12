import "server-only";
import { db } from "@/lib/db";

/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591) — the piece that lets
 * Claude (or any other MCP client) start using this server's OAuth flow
 * with zero manual setup: it registers itself the first time it connects
 * and gets back a `client_id` to use from then on. Public clients only —
 * MCP clients are apps a user installs locally (desktop, browser), which
 * can't keep a client secret confidential, so PKCE is the only protection
 * offered (`lib/oauth/pkce.ts`) and none is issued here.
 *
 * Every redirect URI must be `https://` or `localhost`/`127.0.0.1` (loopback
 * clients bind an ephemeral port per RFC 8252) — enforced here rather than
 * only at `/oauth/authorize` time, so a client can't register a URI it will
 * never actually be allowed to use.
 */
export interface ClientRegistrationInput {
  redirectUris: string[];
  clientName?: string;
}

export interface ClientRegistrationResult {
  client_id: string;
  client_id_issued_at: number;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  grant_types: string[];
  response_types: string[];
}

function isAllowedRedirectUri(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:") {
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    }
    return false;
  } catch {
    return false;
  }
}

export async function registerOAuthClient(
  input: ClientRegistrationInput,
): Promise<
  { ok: true; client: ClientRegistrationResult } | { ok: false; error: string }
> {
  if (input.redirectUris.length === 0) {
    return { ok: false, error: "redirect_uris must contain at least one URI." };
  }
  if (!input.redirectUris.every(isAllowedRedirectUri)) {
    return {
      ok: false,
      error:
        "Every redirect URI must be https://, or http:// on localhost/127.0.0.1.",
    };
  }

  const client = await db.oAuthClient.create({
    data: {
      name: input.clientName?.trim() || "MCP client",
      redirectUris: input.redirectUris,
    },
  });

  return {
    ok: true,
    client: {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  };
}

export async function findOAuthClient(clientId: string) {
  return db.oAuthClient.findUnique({ where: { id: clientId } });
}
