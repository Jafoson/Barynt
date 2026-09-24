import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// The bootstrap runs on every deploy (`bun prisma/bootstrap.ts` in the migrate
// image). It must put the official plugin store in, on by default, and must
// never switch it back on for an admin who turned it off. No real database.

const upserts: Record<string, ReturnType<typeof mock>> = {
  status: mock(async () => ({})),
  priority: mock(async () => ({})),
  issueType: mock(async () => ({})),
  pluginStore: mock(async () => ({})),
};
const fakeDb = {
  status: { upsert: upserts.status },
  priority: { upsert: upserts.priority },
  issueType: { upsert: upserts.issueType },
  pluginStore: { upsert: upserts.pluginStore },
  $transaction: mock(async () => undefined),
} as unknown as PrismaClient;

import { OFFICIAL_STORE_URL } from "@/lib/plugins/storeUrl";
import { bootstrapSystemData } from "@/prisma/bootstrap";

beforeEach(() => {
  for (const m of Object.values(upserts)) m.mockClear();
});

describe("bootstrapSystemData() and the plugin stores", () => {
  it("puts the official store in, on and marked as official", async () => {
    await bootstrapSystemData(fakeDb);
    const call = upserts.pluginStore?.mock.calls[0]?.[0] as {
      where: unknown;
      update: unknown;
      create: unknown;
    };
    expect(call.where).toEqual({
      key: "github.com/jafoson/barynt-plugin-store",
    });
    expect(call.create).toEqual({
      url: OFFICIAL_STORE_URL,
      key: "github.com/jafoson/barynt-plugin-store",
      name: "Barynt (official)",
      official: true,
      enabled: true,
    });
  });

  it("never touches `enabled` of a store that is already there: switched off stays off", async () => {
    await bootstrapSystemData(fakeDb);
    const call = upserts.pluginStore?.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
    };
    expect(call.update).toEqual({ official: true });
    expect(call.update).not.toHaveProperty("enabled");
  });

  it("runs once per call, so a repeated deploy changes nothing", async () => {
    await bootstrapSystemData(fakeDb);
    await bootstrapSystemData(fakeDb);
    expect(upserts.pluginStore).toHaveBeenCalledTimes(2);
  });
});
