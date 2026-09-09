import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockWebhookCreate = mock();
const mockWebhookFindUnique = mock();
const mockWebhookUpdate = mock();
const mockWebhookDelete = mock();

mock.module("@/lib/db", () => ({
  db: {
    webhook: {
      create: mockWebhookCreate,
      findUnique: mockWebhookFindUnique,
      update: mockWebhookUpdate,
      delete: mockWebhookDelete,
    },
  },
}));

const mockRequirePermission = mock();
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PermissionError: class PermissionError extends Error {},
}));

mock.module("next/cache", () => ({ revalidatePath: mock() }));

import {
  createWebhook,
  deleteWebhook,
  setWebhookEnabled,
} from "@/features/webhooks/actions";

const ME = "u-me";
const WORKSPACE_ID = "ws-1";

function reset() {
  for (const m of [
    mockWebhookCreate,
    mockWebhookFindUnique,
    mockWebhookUpdate,
    mockWebhookDelete,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue(ME);
  mockWebhookCreate.mockResolvedValue({ id: "wh-1" });
  mockWebhookFindUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID });
}

describe("createWebhook()", () => {
  beforeEach(reset);

  it("requires webhook.manage on the workspace", async () => {
    await createWebhook(WORKSPACE_ID, {
      url: "https://example.com/hook",
      events: ["issue.created"],
    });
    expect(mockRequirePermission).toHaveBeenCalledWith("webhook.manage", {
      workspaceId: WORKSPACE_ID,
    });
  });

  it("rejects an empty url", async () => {
    const result = await createWebhook(WORKSPACE_ID, {
      url: "  ",
      events: ["issue.created"],
    });
    expect(result).toEqual({ error: "URL is required." });
    expect(mockWebhookCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed url", async () => {
    const result = await createWebhook(WORKSPACE_ID, {
      url: "not a url",
      events: ["issue.created"],
    });
    expect("error" in result).toBe(true);
    expect(mockWebhookCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-http(s) url", async () => {
    const result = await createWebhook(WORKSPACE_ID, {
      url: "ftp://example.com/hook",
      events: ["issue.created"],
    });
    expect("error" in result).toBe(true);
    expect(mockWebhookCreate).not.toHaveBeenCalled();
  });

  it("requires at least one event", async () => {
    const result = await createWebhook(WORKSPACE_ID, {
      url: "https://example.com/hook",
      events: [],
    });
    expect(result).toEqual({ error: "Select at least one event." });
    expect(mockWebhookCreate).not.toHaveBeenCalled();
  });

  it("drops anything that isn't a recognized event", async () => {
    await createWebhook(WORKSPACE_ID, {
      url: "https://example.com/hook",
      // biome-ignore lint/suspicious/noExplicitAny: exercising the runtime guard against a bad value from outside the type system
      events: ["issue.created", "totally.made.up" as any],
    });
    expect(mockWebhookCreate.mock.calls[0][0].data.events).toEqual([
      "issue.created",
    ]);
  });

  it("returns the raw secret exactly once, never persists it in the clear as anything but the stored field", async () => {
    const result = await createWebhook(WORKSPACE_ID, {
      url: "https://example.com/hook",
      events: ["issue.created"],
    });
    expect("secret" in result).toBe(true);
    if ("secret" in result) {
      expect(typeof result.secret).toBe("string");
      expect(result.secret.length).toBeGreaterThan(0);
      expect(mockWebhookCreate).toHaveBeenCalledWith({
        data: {
          workspaceId: WORKSPACE_ID,
          url: "https://example.com/hook",
          secret: result.secret,
          events: ["issue.created"],
          createdById: ME,
        },
        select: { id: true },
      });
    }
  });
});

describe("setWebhookEnabled()", () => {
  beforeEach(reset);

  it("does nothing when the webhook no longer exists", async () => {
    mockWebhookFindUnique.mockResolvedValue(null);
    await setWebhookEnabled("wh-1", false);
    expect(mockRequirePermission).not.toHaveBeenCalled();
    expect(mockWebhookUpdate).not.toHaveBeenCalled();
  });

  it("requires webhook.manage on the webhook's workspace, then updates it", async () => {
    await setWebhookEnabled("wh-1", false);
    expect(mockRequirePermission).toHaveBeenCalledWith("webhook.manage", {
      workspaceId: WORKSPACE_ID,
    });
    expect(mockWebhookUpdate).toHaveBeenCalledWith({
      where: { id: "wh-1" },
      data: { enabled: false },
    });
  });
});

describe("deleteWebhook()", () => {
  beforeEach(reset);

  it("does nothing when the webhook no longer exists", async () => {
    mockWebhookFindUnique.mockResolvedValue(null);
    await deleteWebhook("wh-1");
    expect(mockRequirePermission).not.toHaveBeenCalled();
    expect(mockWebhookDelete).not.toHaveBeenCalled();
  });

  it("requires webhook.manage on the webhook's workspace, then deletes it", async () => {
    await deleteWebhook("wh-1");
    expect(mockRequirePermission).toHaveBeenCalledWith("webhook.manage", {
      workspaceId: WORKSPACE_ID,
    });
    expect(mockWebhookDelete).toHaveBeenCalledWith({ where: { id: "wh-1" } });
  });
});
