import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockIncr = mock();
const mockExpire = mock();
const mockTtl = mock();

mock.module("@/lib/redis", () => ({
  redisClient: { incr: mockIncr, expire: mockExpire, ttl: mockTtl },
}));

import { checkRateLimit } from "@/lib/api/rateLimit";

function reset() {
  mockIncr.mockReset();
  mockExpire.mockReset();
  mockTtl.mockReset();
  mockExpire.mockResolvedValue(1);
  mockTtl.mockResolvedValue(60);
}

describe("checkRateLimit()", () => {
  beforeEach(reset);

  it("allows the first request and sets the window", async () => {
    mockIncr.mockResolvedValue(1);
    const { ok, info } = await checkRateLimit("k-1");
    expect(ok).toBe(true);
    expect(info.limit).toBe(120);
    expect(info.remaining).toBe(119);
    expect(mockExpire).toHaveBeenCalledWith("ratelimit:apikey:k-1", 60);
  });

  it("does not reset the window on subsequent requests", async () => {
    mockIncr.mockResolvedValue(2);
    await checkRateLimit("k-1");
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("allows requests up to the limit", async () => {
    mockIncr.mockResolvedValue(120);
    const { ok, info } = await checkRateLimit("k-1");
    expect(ok).toBe(true);
    expect(info.remaining).toBe(0);
  });

  it("rejects once the limit is exceeded", async () => {
    mockIncr.mockResolvedValue(121);
    const { ok, info } = await checkRateLimit("k-1");
    expect(ok).toBe(false);
    expect(info.remaining).toBe(0);
  });

  it("keys the counter per api key id", async () => {
    mockIncr.mockResolvedValue(1);
    await checkRateLimit("k-2");
    expect(mockIncr).toHaveBeenCalledWith("ratelimit:apikey:k-2");
  });

  it("derives resetAt from the current ttl", async () => {
    mockIncr.mockResolvedValue(5);
    mockTtl.mockResolvedValue(30);
    const before = Date.now();
    const { info } = await checkRateLimit("k-1");
    expect(info.resetAt).toBeGreaterThanOrEqual(before + 30_000);
    expect(info.resetAt).toBeLessThanOrEqual(Date.now() + 30_000);
  });
});
