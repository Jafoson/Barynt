import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockClientCreate = mock();
const mockClientFindUnique = mock();

mock.module("@/lib/db", () => ({
  db: {
    oAuthClient: { create: mockClientCreate, findUnique: mockClientFindUnique },
  },
}));

import { findOAuthClient, registerOAuthClient } from "@/lib/oauth/clients";

beforeEach(() => {
  mockClientCreate.mockReset();
  mockClientFindUnique.mockReset();
});

describe("registerOAuthClient()", () => {
  it("rejects an empty redirect_uris list", async () => {
    const result = await registerOAuthClient({ redirectUris: [] });
    expect(result).toEqual({
      ok: false,
      error: "redirect_uris must contain at least one URI.",
    });
    expect(mockClientCreate).not.toHaveBeenCalled();
  });

  it("accepts https:// redirect URIs", async () => {
    mockClientCreate.mockResolvedValue({
      id: "client-1",
      name: "Claude",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    const result = await registerOAuthClient({
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      clientName: "Claude",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.client.client_id).toBe("client-1");
      expect(result.client.token_endpoint_auth_method).toBe("none");
    }
  });

  it("accepts a loopback http:// redirect URI (RFC 8252 native app clients)", async () => {
    mockClientCreate.mockResolvedValue({
      id: "client-2",
      name: "MCP client",
      redirectUris: ["http://127.0.0.1:51234/callback"],
      createdAt: new Date(),
    });

    const result = await registerOAuthClient({
      redirectUris: ["http://127.0.0.1:51234/callback"],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a plain http:// redirect URI on a non-loopback host", async () => {
    const result = await registerOAuthClient({
      redirectUris: ["http://example.com/callback"],
    });
    expect(result.ok).toBe(false);
    expect(mockClientCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed URI", async () => {
    const result = await registerOAuthClient({ redirectUris: ["not-a-url"] });
    expect(result.ok).toBe(false);
  });

  it("falls back to a default name when none is given", async () => {
    mockClientCreate.mockResolvedValue({
      id: "client-3",
      name: "MCP client",
      redirectUris: ["https://example.com/cb"],
      createdAt: new Date(),
    });
    await registerOAuthClient({ redirectUris: ["https://example.com/cb"] });
    expect(mockClientCreate.mock.calls[0][0].data.name).toBe("MCP client");
  });
});

describe("findOAuthClient()", () => {
  it("looks the client up by id", async () => {
    mockClientFindUnique.mockResolvedValue({ id: "client-1" });
    await findOAuthClient("client-1");
    expect(mockClientFindUnique).toHaveBeenCalledWith({
      where: { id: "client-1" },
    });
  });
});
