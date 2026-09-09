import "server-only";
import { redisClient } from "@/lib/redis";

// Fixed-window request counter per API key, backed by Redis — the classic
// `INCR`+`EXPIRE` pattern, same idea as the `X-RateLimit-*` headers Jira and
// Linear both expose. Deliberately not complexity-based (Linear's model):
// that only earns its keep on a GraphQL API where a single query can be
// arbitrarily deep — this is REST with a fixed, shallow response shape per
// route, so a flat request count is the honest unit to limit on.

const WINDOW_SECONDS = 60;
const LIMIT = 120;

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  /** Unix ms when the window resets. */
  resetAt: number;
}

function keyFor(apiKeyId: string): string {
  return `ratelimit:apikey:${apiKeyId}`;
}

/**
 * Counts this request against the key's per-minute budget and reports the
 * remaining budget either way. `ok: false` means the caller must be
 * rejected (429) — the count itself is still incremented, so a client that
 * ignores 429s doesn't get free retries.
 */
export async function checkRateLimit(
  apiKeyId: string,
): Promise<{ ok: boolean; info: RateLimitInfo }> {
  const key = keyFor(apiKeyId);
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, WINDOW_SECONDS);
  }
  const ttl = await redisClient.ttl(key);
  const resetAt = Date.now() + Math.max(ttl, 0) * 1000;

  return {
    ok: count <= LIMIT,
    info: { limit: LIMIT, remaining: Math.max(LIMIT - count, 0), resetAt },
  };
}
