import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiKeyCreate = mock();

mock.module("@/lib/db", () => ({
  db: { apiKey: { create: mockApiKeyCreate } },
}));

const mockGetSession = mock();
mock.module("@/lib/session", () => ({ getSession: mockGetSession }));
mock.module("next/cache", () => ({ revalidatePath: mock() }));

import { createApiKey } from "@/features/account/actions";

const ME = "u-me";

function reset() {
  mockApiKeyCreate.mockReset();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ userId: ME });
  mockApiKeyCreate.mockResolvedValue({ id: "k-1" });
}

describe("createApiKey()", () => {
  beforeEach(reset);

  it("rejects when nobody is logged in", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(await createApiKey({ name: "CI", scopes: ["issues:read"] })).toEqual(
      {
        error: "You must be logged in.",
      },
    );
    expect(mockApiKeyCreate).not.toHaveBeenCalled();
  });

  it("requires a name", async () => {
    expect(await createApiKey({ name: "  ", scopes: ["issues:read"] })).toEqual(
      {
        error: "Name is required.",
      },
    );
    expect(mockApiKeyCreate).not.toHaveBeenCalled();
  });

  it("requires at least one scope", async () => {
    expect(await createApiKey({ name: "CI", scopes: [] })).toEqual({
      error: "Select at least one scope.",
    });
    expect(mockApiKeyCreate).not.toHaveBeenCalled();
  });

  it("drops anything that isn't a recognized scope", async () => {
    await createApiKey({
      name: "CI",
      // biome-ignore lint/suspicious/noExplicitAny: exercising the runtime guard against a bad value from outside the type system
      scopes: ["issues:read", "admin:everything" as any],
    });
    expect(mockApiKeyCreate.mock.calls[0][0].data.scopes).toEqual([
      "issues:read",
    ]);
  });

  it("de-duplicates repeated scopes", async () => {
    await createApiKey({
      name: "CI",
      scopes: ["issues:read", "issues:read"],
    });
    expect(mockApiKeyCreate.mock.calls[0][0].data.scopes).toEqual([
      "issues:read",
    ]);
  });

  it("returns the raw token exactly once, prefixed with bry_", async () => {
    const result = await createApiKey({
      name: "CI",
      scopes: ["issues:read"],
    });
    expect("token" in result).toBe(true);
    if ("token" in result) {
      expect(result.token.startsWith("bry_")).toBe(true);
      expect(result.id).toBe("k-1");
    }
  });

  it("never persists the raw token — only its hash and a prefix", async () => {
    const result = await createApiKey({
      name: "CI",
      scopes: ["issues:read", "issues:write"],
    });
    if (!("token" in result)) throw new Error("expected success");

    const call = mockApiKeyCreate.mock.calls[0][0];
    expect(call.data.userId).toBe(ME);
    expect(call.data.name).toBe("CI");
    expect(call.data.scopes).toEqual(["issues:read", "issues:write"]);
    expect(call.data.tokenHash).toBe(
      createHash("sha256").update(result.token).digest("hex"),
    );
    expect(call.data.prefix).toBe(result.token.slice(0, 12));
    expect(JSON.stringify(call.data)).not.toContain(result.token.slice(12));
  });

  it("stores an optional expiry", async () => {
    const expiresAt = new Date("2027-01-01");
    await createApiKey({ name: "CI", scopes: ["issues:read"], expiresAt });
    expect(mockApiKeyCreate.mock.calls[0][0].data.expiresAt).toBe(expiresAt);
  });
});
