import { beforeEach, describe, expect, it, mock } from "bun:test";

// Installing from a store. The action is what the dialog calls; the download and the
// unpacking come with BARY-107, so until then it checks who may and what it is asked for,
// and then says plainly that it cannot, and does nothing.

const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "admin1",
);
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PLATFORM: { scope: "platform" },
}));

import { installStorePlugin } from "@/features/plugins/storeActions";

beforeEach(() => {
  mockRequirePermission.mockReset();
  mockRequirePermission.mockResolvedValue("admin1");
});

describe("who may", () => {
  it("asks for plugin.manage in the platform context, first", async () => {
    await installStorePlugin("store-1", "notes", "1.0.0", {
      acknowledged: true,
    });
    expect(mockRequirePermission.mock.calls[0]).toEqual([
      "plugin.manage",
      { scope: "platform" },
    ]);
  });

  it("refuses without looking at the request when the permission is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(
      installStorePlugin("", "../etc", "nope", undefined),
    ).rejects.toThrow("not allowed");
  });
});

describe("what is asked for", () => {
  it.each([
    ["a store id that is not text", [42, "notes", "1.0.0"]],
    ["an empty store id", ["", "notes", "1.0.0"]],
    ["a store id that is too long", ["s".repeat(101), "notes", "1.0.0"]],
    ["a plugin id that is a path", ["store-1", "../etc", "1.0.0"]],
    ["a plugin id with capitals", ["store-1", "Notes", "1.0.0"]],
    ["a plugin id that is not text", ["store-1", 7, "1.0.0"]],
    ["a version that is a range", ["store-1", "notes", "^1.0.0"]],
    ["a version that is a path", ["store-1", "notes", "../1.0.0"]],
    ["a version that is not text", ["store-1", "notes", 1]],
    ["nothing", [undefined, undefined, undefined]],
  ])("is refused with %s", async (_n, [store, plugin, version]) => {
    expect(
      await installStorePlugin(
        store as string,
        plugin as string,
        version as string,
        { acknowledged: true },
      ),
    ).toEqual({ error: "Invalid request." });
  });

  it.each([
    ["nothing", undefined],
    ["false", { acknowledged: false }],
    ["the text true", { acknowledged: "true" as never }],
    ["1", { acknowledged: 1 as never }],
    ["an empty object", {}],
  ])("needs the yes, and %s is not that", async (_n, input) => {
    const result = await installStorePlugin("store-1", "notes", "1.0.0", input);
    expect(result).toEqual({
      error:
        "Confirm that you have read what the plugin asks for before it is installed.",
    });
  });
});

describe("what it does today", () => {
  it("says that installing from a store is not available yet, and does nothing else", async () => {
    const result = await installStorePlugin("store-1", "notes", "1.0.0", {
      acknowledged: true,
    });
    expect(result).toEqual({
      error:
        "Installing from a store is not available yet: downloading and unpacking a plugin come with the next step.",
    });
  });
});
