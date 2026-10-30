import { beforeEach, describe, expect, it, mock } from "bun:test";

// Only `@/lib/db` is mocked — the route's own logic (status codes, the
// timeout, no caching) runs for real.

const mockQueryRaw = mock();
mock.module("@/lib/db", () => ({ db: { $queryRaw: mockQueryRaw } }));

import { GET as live } from "@/app/api/health/live/route";
import { GET as ready } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => mockQueryRaw.mockReset());

  it("is ok while the database answers", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await ready();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({ database: "ok" });
    expect(typeof body.version).toBe("string");
  });

  it("is unavailable (503) when the database fails", async () => {
    mockQueryRaw.mockRejectedValue(new Error("connection refused"));
    const res = await ready();
    expect(res.status).toBe(503);
    expect((await res.json()).checks).toEqual({ database: "unavailable" });
  });

  it("gives up on a database that hangs", async () => {
    mockQueryRaw.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    const res = await ready();
    expect(res.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(4500);
  }, 6000);
});

describe("GET /api/health/live", () => {
  it("answers without touching the database", async () => {
    mockQueryRaw.mockReset();
    const res = live();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});
