import "server-only";
import Redis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var redis: Redis | undefined;
}

function createClient() {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
}

export const redisClient = global.redis ?? createClient();

if (process.env.NODE_ENV !== "production") global.redis = redisClient;
