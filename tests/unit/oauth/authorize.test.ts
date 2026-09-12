import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockClientFindUnique = mock();
const mockCodeCreate = mock();

mock.module("@/lib/db", () => ({
  db: {
    oAuthClient: { findUnique: mockClientFindUnique },
    oAuthAuthorizationCode: { create: mockCodeCreate },
  },
}));

import {
  createAuthorizationCode,
  resolveRequestedScopes,
  validateAuthorizeRequest,
} from "@/lib/oauth/authorize";

const baseReq = {
  clientId: "client-1",
  redirectUri: "https://claude.ai/api/mcp/auth_callback",
  codeChallenge: "abc123",
  codeChallengeMethod: "S256",
};

beforeEach(() => {
  mockClientFindUnique.mockReset();
  mockCodeCreate.mockReset();
  mockClientFindUnique.mockResolvedValue({
    id: "client-1",
    redirectUris: [baseReq.redirectUri],
  });
});

describe("resolveRequestedScopes()", () => {
  it("keeps only recognized scopes from a space-separated list", () => {
    expect(
      resolveRequestedScopes("issues:read bogus:scope issues:write"),
    ).toEqual(["issues:read", "issues:write"]);
  });

  it("falls back to every scope when nothing recognized was requested — the same ceiling a manually created API key gets by default", () => {
    expect(resolveRequestedScopes(undefined)).toHaveLength(11);
    expect(resolveRequestedScopes("nonsense")).toHaveLength(11);
  });
});

describe("validateAuthorizeRequest()", () => {
  it("rejects an unknown client_id", async () => {
    mockClientFindUnique.mockResolvedValue(null);
    const result = await validateAuthorizeRequest(baseReq);
    expect(result).toEqual({ ok: false, error: "Unknown client_id." });
  });

  it("rejects a redirect_uri that isn't one of the client's registered ones — exact match, the spec's own open-redirect defense", async () => {
    const result = await validateAuthorizeRequest({
      ...baseReq,
      redirectUri: "https://evil.example.com/callback",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a code_challenge_method other than S256", async () => {
    const result = await validateAuthorizeRequest({
      ...baseReq,
      codeChallengeMethod: "plain",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing code_challenge", async () => {
    const result = await validateAuthorizeRequest({
      ...baseReq,
      codeChallenge: "",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a well-formed request for a registered client", async () => {
    const result = await validateAuthorizeRequest(baseReq);
    expect(result).toEqual({ ok: true });
  });
});

describe("createAuthorizationCode()", () => {
  it("stores the code hashed, never the raw value", async () => {
    mockCodeCreate.mockResolvedValue({});
    const code = await createAuthorizationCode(baseReq, "user-1");

    expect(code).toMatch(/^bryoc_/);
    const stored = mockCodeCreate.mock.calls[0][0].data;
    expect(stored.codeHash).not.toBe(code);
    expect(stored.userId).toBe("user-1");
    expect(stored.clientId).toBe(baseReq.clientId);
  });

  it("defaults to every scope when the request carries none", async () => {
    mockCodeCreate.mockResolvedValue({});
    await createAuthorizationCode(baseReq, "user-1");
    expect(mockCodeCreate.mock.calls[0][0].data.scopes).toHaveLength(11);
  });
});
