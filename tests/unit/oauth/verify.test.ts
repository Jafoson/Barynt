import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockAccessTokenFindUnique = mock();

mock.module("@/lib/db", () => ({
  db: { oAuthAccessToken: { findUnique: mockAccessTokenFindUnique } },
}));
mock.module("@/lib/app-url", () => ({
  appBaseUrl: () => "https://barynt.example.com",
  appUrl: (path: string) => `https://barynt.example.com${path}`,
}));

import { verifyOAuthAccessToken } from "@/lib/oauth/verify";

const RESOURCE = "https://barynt.example.com/api/mcp";

function freshTokenRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "access-1",
    userId: "user-1",
    scopes: ["issues:read"],
    resource: RESOURCE,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    user: { deactivatedAt: null },
    ...overrides,
  };
}

beforeEach(() => {
  mockAccessTokenFindUnique.mockReset();
});

describe("verifyOAuthAccessToken()", () => {
  it("rejects anything not carrying the bryat_ prefix without touching the database", async () => {
    const result = await verifyOAuthAccessToken("bry_some-api-key");
    expect(result).toBeNull();
    expect(mockAccessTokenFindUnique).not.toHaveBeenCalled();
  });

  it("resolves a valid token to the same shape resolveApiUser produces", async () => {
    mockAccessTokenFindUnique.mockResolvedValue(freshTokenRow());
    const result = await verifyOAuthAccessToken("bryat_valid");
    expect(result).toEqual({
      userId: "user-1",
      keyId: "access-1",
      scopes: ["issues:read"],
    });
  });

  it("rejects an unknown token", async () => {
    mockAccessTokenFindUnique.mockResolvedValue(null);
    expect(await verifyOAuthAccessToken("bryat_unknown")).toBeNull();
  });

  it("rejects a revoked token", async () => {
    mockAccessTokenFindUnique.mockResolvedValue(
      freshTokenRow({ revokedAt: new Date() }),
    );
    expect(await verifyOAuthAccessToken("bryat_revoked")).toBeNull();
  });

  it("rejects an expired token", async () => {
    mockAccessTokenFindUnique.mockResolvedValue(
      freshTokenRow({ expiresAt: new Date(Date.now() - 1000) }),
    );
    expect(await verifyOAuthAccessToken("bryat_expired")).toBeNull();
  });

  it("rejects a token whose audience doesn't match this server's MCP resource — RFC 8707 audience binding", async () => {
    mockAccessTokenFindUnique.mockResolvedValue(
      freshTokenRow({ resource: "https://a-different-server.example.com" }),
    );
    expect(await verifyOAuthAccessToken("bryat_wrong_audience")).toBeNull();
  });

  it("rejects a token belonging to a deactivated account", async () => {
    mockAccessTokenFindUnique.mockResolvedValue(
      freshTokenRow({ user: { deactivatedAt: new Date() } }),
    );
    expect(await verifyOAuthAccessToken("bryat_deactivated_user")).toBeNull();
  });
});
