import "server-only";
import Redis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var redis: Redis | undefined;
}

function createClient() {
  const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  // ioredis emits "error" on every failed connection attempt and retries
  // forever by default; an unlistened "error" event is treated as an
  // uncaught exception. Without this handler, anything that imports this
  // module while no real Redis is reachable — e.g. `next build`'s page-data
  // collection, which imports every route module against the build-time
  // placeholder environment — crashes the process outright (observed as a
  // Bun segfault under the resulting rapid-fire reconnect/error loop).
  client.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });
  return client;
}

export const redisClient = global.redis ?? createClient();

if (process.env.NODE_ENV !== "production") global.redis = redisClient;
