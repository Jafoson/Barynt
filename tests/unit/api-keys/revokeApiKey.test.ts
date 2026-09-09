import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiKeyFindUnique = mock();
const mockApiKeyUpdate = mock();

mock.module("@/lib/db", () => ({
  db: {
    apiKey: { findUnique: mockApiKeyFindUnique, update: mockApiKeyUpdate },
  },
}));

const mockGetSession = mock();
mock.module("@/lib/session", () => ({ getSession: mockGetSession }));
mock.module("next/cache", () => ({ revalidatePath: mock() }));

import { revokeApiKey } from "@/features/account/actions";

const ME = "u-me";

function reset() {
  mockApiKeyFindUnique.mockReset();
  mockApiKeyUpdate.mockReset();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ userId: ME });
  mockApiKeyFindUnique.mockResolvedValue({ userId: ME, revokedAt: null });
  mockApiKeyUpdate.mockResolvedValue({ id: "k-1" });
}

describe("revokeApiKey()", () => {
  beforeEach(reset);

  it("rejects when nobody is logged in", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(await revokeApiKey("k-1")).toEqual({
      error: "You must be logged in.",
    });
    expect(mockApiKeyUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unknown key", async () => {
    mockApiKeyFindUnique.mockResolvedValue(null);
    expect(await revokeApiKey("k-1")).toEqual({
      error: "This API key is not on your account.",
    });
    expect(mockApiKeyUpdate).not.toHaveBeenCalled();
  });

  it("rejects a key belonging to someone else", async () => {
    mockApiKeyFindUnique.mockResolvedValue({
      userId: "u-someone-else",
      revokedAt: null,
    });
    expect(await revokeApiKey("k-1")).toEqual({
      error: "This API key is not on your account.",
    });
    expect(mockApiKeyUpdate).not.toHaveBeenCalled();
  });

  it("revokes the key", async () => {
    expect(await revokeApiKey("k-1")).toEqual({ ok: true });
    expect(mockApiKeyUpdate).toHaveBeenCalledWith({
      where: { id: "k-1" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("is idempotent on an already-revoked key", async () => {
    mockApiKeyFindUnique.mockResolvedValue({
      userId: ME,
      revokedAt: new Date(),
    });
    expect(await revokeApiKey("k-1")).toEqual({ ok: true });
    expect(mockApiKeyUpdate).not.toHaveBeenCalled();
  });
});
