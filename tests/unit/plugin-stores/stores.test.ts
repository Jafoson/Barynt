import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// What the registry is given as "the stores that are on". It has to fail
// closed: a database error means no store is on, never the official one by
// default. No real database.

const mockFindMany = mock();
mock.module("@/lib/db", () => ({
  db: { pluginStore: { findMany: mockFindMany } },
}));

import {
  DEFAULT_ACTIVE_STORES,
  decideExecution,
  OFFICIAL_STORE_URL,
} from "@/lib/plugins/policy";
import { getActiveStoreUrls } from "@/lib/plugins/stores";

beforeEach(() => {
  mockFindMany.mockReset();
});

describe("getActiveStoreUrls()", () => {
  it("asks for the stores that are on, and only their addresses", async () => {
    mockFindMany.mockResolvedValue([
      { url: OFFICIAL_STORE_URL },
      { url: "https://git.example.com/team/plugins" },
    ]);
    expect(await getActiveStoreUrls()).toEqual([
      OFFICIAL_STORE_URL,
      "https://git.example.com/team/plugins",
    ]);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { enabled: true },
      select: { url: true },
    });
  });

  it("is empty when no store is on, and that means no code, not the default", async () => {
    mockFindMany.mockResolvedValue([]);
    expect(await getActiveStoreUrls()).toEqual([]);
  });

  it("is empty when the stores cannot be read, and says so", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    mockFindMany.mockRejectedValue(new Error("connection refused"));
    expect(await getActiveStoreUrls()).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain("none is on");
    log.mockRestore();
  });

  it("does not fall back to the official store when the database fails", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    mockFindMany.mockRejectedValue(new Error("down"));
    const active = await getActiveStoreUrls();
    expect(active).not.toEqual([...DEFAULT_ACTIVE_STORES]);
    log.mockRestore();
  });

  it("gives the policy a list that keeps code from a store that is off from running", async () => {
    // The official store switched off, the admin's own on.
    mockFindMany.mockResolvedValue([
      { url: "https://git.example.com/team/plugins" },
    ]);
    const HASH = `sha512-${"A".repeat(86)}==`;
    const fromOfficial = {
      manifest: { server: "server.js" },
      source: "STORE",
      origin: OFFICIAL_STORE_URL,
      integrity: HASH,
      codeApprovalHash: HASH,
    };
    expect(decideExecution(fromOfficial, await getActiveStoreUrls())).toEqual({
      mode: "blocked",
      reason: "store-not-active",
    });
    expect(
      decideExecution(
        { ...fromOfficial, origin: "https://git.example.com/team/plugins" },
        await getActiveStoreUrls(),
      ),
    ).toEqual({ mode: "in-process" });
  });
});
