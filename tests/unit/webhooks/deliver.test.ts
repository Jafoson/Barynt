import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockWebhookFindMany = mock();
const mockWebhookUpdate = mock();

mock.module("@/lib/db", () => ({
  db: {
    webhook: { findMany: mockWebhookFindMany, update: mockWebhookUpdate },
  },
}));

import { deliverWebhookEvent, signPayload } from "@/lib/webhooks/deliver";

const HOOK = { id: "wh-1", url: "https://example.com/hook", secret: "shh" };

function reset() {
  mockWebhookFindMany.mockReset();
  mockWebhookUpdate.mockReset();
  mockWebhookFindMany.mockResolvedValue([HOOK]);
  mockWebhookUpdate.mockResolvedValue({});
}

describe("signPayload()", () => {
  it("matches a manually computed HMAC-SHA256 over timestamp.payload", () => {
    const sig = signPayload("shh", "1000", '{"a":1}');
    const expected = createHmac("sha256", "shh")
      .update('1000.{"a":1}')
      .digest("hex");
    expect(sig).toBe(expected);
  });

  it("has no sha256= prefix — bare hex, unlike GitHub's convention", () => {
    const sig = signPayload("shh", "1000", "{}");
    expect(sig).not.toContain("sha256=");
    expect(/^[0-9a-f]+$/.test(sig)).toBe(true);
  });
});

describe("deliverWebhookEvent()", () => {
  beforeEach(reset);

  it("does nothing when no webhook is subscribed to the event", async () => {
    mockWebhookFindMany.mockResolvedValue([]);
    const originalFetch = global.fetch;
    global.fetch = mock(() => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;

    await deliverWebhookEvent("ws-1", "issue.created", { id: "i-1" });

    global.fetch = originalFetch;
    expect(mockWebhookUpdate).not.toHaveBeenCalled();
  });

  it("looks up only enabled webhooks subscribed to this event", async () => {
    mockWebhookFindMany.mockResolvedValue([]);
    await deliverWebhookEvent("ws-1", "comment.created", { id: "c-1" });
    expect(mockWebhookFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws-1",
        enabled: true,
        events: { has: "comment.created" },
      },
      select: { id: true, url: true, secret: true },
    });
  });

  it("POSTs a signed payload and records the status on success", async () => {
    const originalFetch = global.fetch;
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toBe(HOOK.url);
      const body = init.body as string;
      const headers = init.headers as Record<string, string>;
      const timestamp = headers["x-barynt-timestamp"];
      const expectedSig = createHmac("sha256", HOOK.secret)
        .update(`${timestamp}.${body}`)
        .digest("hex");
      expect(headers["x-barynt-signature"]).toBe(expectedSig);
      const parsed = JSON.parse(body);
      expect(parsed.event).toBe("issue.created");
      expect(parsed.data).toEqual({ id: "i-1" });
      return new Response(null, { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await deliverWebhookEvent("ws-1", "issue.created", { id: "i-1" });

    global.fetch = originalFetch;
    expect(mockWebhookUpdate).toHaveBeenCalledWith({
      where: { id: "wh-1" },
      data: {
        lastDeliveryAt: expect.any(Date),
        lastDeliveryStatus: 200,
        lastDeliveryError: null,
      },
    });
  });

  it("records the error and never throws when the request fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    await expect(
      deliverWebhookEvent("ws-1", "issue.created", { id: "i-1" }),
    ).resolves.toBeUndefined();

    global.fetch = originalFetch;
    expect(mockWebhookUpdate).toHaveBeenCalledWith({
      where: { id: "wh-1" },
      data: {
        lastDeliveryAt: expect.any(Date),
        lastDeliveryStatus: null,
        lastDeliveryError: "ECONNREFUSED",
      },
    });
  });
});
