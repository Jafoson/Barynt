import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";

const mockAuthCodeFindUnique = mock();
const mockAuthCodeUpdateMany = mock();
const mockAccessTokenCreate = mock();
const mockAccessTokenUpdate = mock();
const mockAccessTokenUpdateMany = mock();
const mockRefreshTokenFindUnique = mock();
const mockRefreshTokenCreate = mock();
const mockRefreshTokenUpdate = mock();
const mockRefreshTokenUpdateMany = mock();

// biome-ignore lint/suspicious/noExplicitAny: test double standing in for PrismaClient/TransactionClient
const mockDb: any = {
  oAuthAuthorizationCode: {
    findUnique: mockAuthCodeFindUnique,
    updateMany: mockAuthCodeUpdateMany,
  },
  oAuthAccessToken: {
    create: mockAccessTokenCreate,
    update: mockAccessTokenUpdate,
    updateMany: mockAccessTokenUpdateMany,
  },
  oAuthRefreshToken: {
    findUnique: mockRefreshTokenFindUnique,
    create: mockRefreshTokenCreate,
    update: mockRefreshTokenUpdate,
    updateMany: mockRefreshTokenUpdateMany,
  },
  // Both call shapes `exchange.ts` uses: a callback (runs it against this
  // same mock — everything it touches is already mocked, no real isolation
  // needed) and a plain array (the reuse-detection revocation sweep).
  $transaction: mock(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(mockDb)
      : Promise.all(arg as Promise<unknown>[]),
  ),
};

mock.module("@/lib/db", () => ({ db: mockDb }));
mock.module("@/lib/app-url", () => ({
  appBaseUrl: () => "https://barynt.example.com",
  appUrl: (path: string) => `https://barynt.example.com${path}`,
}));

import {
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "@/lib/oauth/exchange";

const RESOURCE = "https://barynt.example.com/api/mcp";
const CODE_VERIFIER = "a-verifier-with-enough-entropy-for-pkce";
const CODE_CHALLENGE = createHash("sha256")
  .update(CODE_VERIFIER)
  .digest("base64url");

function freshAuthCodeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "code-1",
    clientId: "client-1",
    userId: "user-1",
    redirectUri: "https://claude.ai/api/mcp/auth_callback",
    codeChallenge: CODE_CHALLENGE,
    codeChallengeMethod: "S256",
    resource: RESOURCE,
    scopes: ["issues:read"],
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

beforeEach(() => {
  for (const m of [
    mockAuthCodeFindUnique,
    mockAuthCodeUpdateMany,
    mockAccessTokenCreate,
    mockAccessTokenUpdate,
    mockAccessTokenUpdateMany,
    mockRefreshTokenFindUnique,
    mockRefreshTokenCreate,
    mockRefreshTokenUpdate,
    mockRefreshTokenUpdateMany,
  ]) {
    m.mockReset();
  }
  mockAuthCodeUpdateMany.mockResolvedValue({ count: 1 });
  mockAccessTokenCreate.mockResolvedValue({ id: "access-1" });
  mockRefreshTokenCreate.mockResolvedValue({ id: "refresh-1" });
});

describe("exchangeAuthorizationCode()", () => {
  const validParams = {
    code: "bryoc_whatever",
    clientId: "client-1",
    redirectUri: "https://claude.ai/api/mcp/auth_callback",
    codeVerifier: CODE_VERIFIER,
  };

  it("mints an access/refresh token pair for a valid code", async () => {
    mockAuthCodeFindUnique.mockResolvedValue(freshAuthCodeRow());

    const result = await exchangeAuthorizationCode(validParams);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokens.access_token).toMatch(/^bryat_/);
      expect(result.tokens.refresh_token).toMatch(/^bryrt_/);
      expect(result.tokens.scope).toBe("issues:read");
    }
    // Consumed exactly the row it looked up, guarded against a concurrent
    // redemption of the same code (`usedAt: null` in the where-clause).
    expect(mockAuthCodeUpdateMany).toHaveBeenCalledWith({
      where: { id: "code-1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("rejects an unknown code", async () => {
    mockAuthCodeFindUnique.mockResolvedValue(null);
    const result = await exchangeAuthorizationCode(validParams);
    expect(result).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("rejects an already-used code — replay defense", async () => {
    mockAuthCodeFindUnique.mockResolvedValue(
      freshAuthCodeRow({ usedAt: new Date() }),
    );
    const result = await exchangeAuthorizationCode(validParams);
    expect(result).toEqual({ ok: false, error: "invalid_grant" });
    expect(mockAccessTokenCreate).not.toHaveBeenCalled();
  });

  it("rejects an expired code", async () => {
    mockAuthCodeFindUnique.mockResolvedValue(
      freshAuthCodeRow({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const result = await exchangeAuthorizationCode(validParams);
    expect(result).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("rejects a client_id that doesn't match the one the code was issued to", async () => {
    mockAuthCodeFindUnique.mockResolvedValue(freshAuthCodeRow());
    const result = await exchangeAuthorizationCode({
      ...validParams,
      clientId: "someone-elses-client",
    });
    expect(result).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("rejects a redirect_uri that doesn't match the one the code was issued to", async () => {
    mockAuthCodeFindUnique.mockResolvedValue(freshAuthCodeRow());
    const result = await exchangeAuthorizationCode({
      ...validParams,
      redirectUri: "https://claude.ai/different-callback",
    });
    expect(result).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("rejects a code_verifier that doesn't hash to the stored challenge", async () => {
    mockAuthCodeFindUnique.mockResolvedValue(freshAuthCodeRow());
    const result = await exchangeAuthorizationCode({
      ...validParams,
      codeVerifier: "wrong-verifier",
    });
    expect(result).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("rejects a resource that doesn't match this server's canonical MCP URI", async () => {
    mockAuthCodeFindUnique.mockResolvedValue(freshAuthCodeRow());
    const result = await exchangeAuthorizationCode({
      ...validParams,
      resource: "https://a-different-mcp-server.example.com",
    });
    expect(result).toEqual({ ok: false, error: "invalid_target" });
  });

  it("loses a redemption race gracefully instead of minting tokens nobody gets", async () => {
    mockAuthCodeFindUnique.mockResolvedValue(freshAuthCodeRow());
    // A concurrent request already flipped `usedAt` between the lookup
    // above and this transaction's own conditional update.
    mockAuthCodeUpdateMany.mockResolvedValue({ count: 0 });

    const result = await exchangeAuthorizationCode(validParams);
    expect(result).toEqual({ ok: false, error: "invalid_grant" });
    expect(mockAccessTokenCreate).not.toHaveBeenCalled();
  });
});

describe("refreshAccessToken()", () => {
  function freshRefreshRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "refresh-old",
      clientId: "client-1",
      userId: "user-1",
      scopes: ["issues:read"],
      resource: RESOURCE,
      accessTokenId: "access-old",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
  }

  it("rotates: mints a new pair and retires the old one", async () => {
    mockRefreshTokenFindUnique.mockResolvedValue(freshRefreshRow());

    const result = await refreshAccessToken({
      refreshToken: "bryrt_old",
      clientId: "client-1",
    });

    expect(result.ok).toBe(true);
    expect(mockRefreshTokenUpdate).toHaveBeenCalledWith({
      where: { id: "refresh-old" },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockAccessTokenUpdate).toHaveBeenCalledWith({
      where: { id: "access-old" },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockAccessTokenCreate).toHaveBeenCalledTimes(1);
    expect(mockRefreshTokenCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown refresh token", async () => {
    mockRefreshTokenFindUnique.mockResolvedValue(null);
    const result = await refreshAccessToken({
      refreshToken: "bryrt_nope",
      clientId: "client-1",
    });
    expect(result).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("rejects a client_id mismatch", async () => {
    mockRefreshTokenFindUnique.mockResolvedValue(freshRefreshRow());
    const result = await refreshAccessToken({
      refreshToken: "bryrt_old",
      clientId: "someone-elses-client",
    });
    expect(result).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("rejects an expired refresh token", async () => {
    mockRefreshTokenFindUnique.mockResolvedValue(
      freshRefreshRow({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const result = await refreshAccessToken({
      refreshToken: "bryrt_old",
      clientId: "client-1",
    });
    expect(result).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("theft detection: reusing an already-rotated refresh token revokes every live token for that user+client, not just the replayed one", async () => {
    mockRefreshTokenFindUnique.mockResolvedValue(
      freshRefreshRow({ revokedAt: new Date() }),
    );

    const result = await refreshAccessToken({
      refreshToken: "bryrt_already_used",
      clientId: "client-1",
    });

    expect(result).toEqual({ ok: false, error: "invalid_grant" });
    expect(mockAccessTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockRefreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // No fresh pair handed out on a detected-theft path.
    expect(mockAccessTokenCreate).not.toHaveBeenCalled();
  });

  it("rejects a resource mismatch", async () => {
    mockRefreshTokenFindUnique.mockResolvedValue(freshRefreshRow());
    const result = await refreshAccessToken({
      refreshToken: "bryrt_old",
      clientId: "client-1",
      resource: "https://a-different-mcp-server.example.com",
    });
    expect(result).toEqual({ ok: false, error: "invalid_target" });
  });
});
