import { beforeEach, describe, expect, it, mock } from "bun:test";

// Installing from a store. The action is what the dialog calls: it checks who may and what it is
// asked for, and only then hands over to the installer (`storeInstall.ts`, tested on its own in
// `tests/unit/store-install`, where the store, the release and the disk are real).

const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "admin1",
);
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PLATFORM: { scope: "platform" },
}));

const mockInstallFromStore = mock(
  async (_input: unknown): Promise<unknown> => ({ ok: true }),
);
const mockUpdateFromStore = mock(
  async (_input: unknown): Promise<unknown> => ({ ok: true }),
);
mock.module("@/features/plugins/storeInstall", () => ({
  installFromStore: mockInstallFromStore,
  updateFromStore: mockUpdateFromStore,
}));

import {
  installStorePlugin,
  updateStorePlugin,
} from "@/features/plugins/storeActions";

beforeEach(() => {
  mockRequirePermission.mockReset();
  mockRequirePermission.mockResolvedValue("admin1");
  mockInstallFromStore.mockClear();
  mockUpdateFromStore.mockClear();
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
    [
      "a plugin id that is a list which reads like a good one",
      ["store-1", ["notes"], "1.0.0"],
    ],
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

describe("what it hands over", () => {
  it("is who asked, and exactly what was asked, and gives back what the installer says", async () => {
    mockInstallFromStore.mockResolvedValue({ error: "no" });
    const result = await installStorePlugin("store-1", "notes", "1.0.0", {
      acknowledged: true,
    });
    expect(result).toEqual({ error: "no" });
    expect(mockInstallFromStore.mock.calls).toEqual([
      [
        {
          actorId: "admin1",
          storeId: "store-1",
          pluginId: "notes",
          version: "1.0.0",
        },
      ],
    ]);
    mockInstallFromStore.mockResolvedValue({ ok: true });
    expect(
      await installStorePlugin("store-1", "notes", "1.0.0", {
        acknowledged: true,
      }),
    ).toEqual({ ok: true });
  });

  it("is nothing at all, not even a look at the store, when the request is refused", async () => {
    await installStorePlugin("", "notes", "1.0.0", { acknowledged: true });
    await installStorePlugin("store-1", "notes", "1.0.0", undefined);
    await installStorePlugin("store-1", "../x", "1.0.0", {
      acknowledged: true,
    });
    expect(mockInstallFromStore).not.toHaveBeenCalled();
  });

  it("takes no source, origin or hash from the client: the installer is given none", async () => {
    await installStorePlugin("store-1", "notes", "1.0.0", {
      acknowledged: true,
      // Whatever else a caller passes is not looked at.
      source: "STORE",
      origin: "https://evil.example",
      integrity: "x",
    } as never);
    expect(
      Object.keys(mockInstallFromStore.mock.calls[0]?.[0] as object).sort(),
    ).toEqual(["actorId", "pluginId", "storeId", "version"]);
  });
});

describe("updating: who may, what is asked for, what it hands over", () => {
  const ack = { acknowledged: true };

  it("asks for plugin.manage in the platform context, first, and looks at nothing before that", async () => {
    await updateStorePlugin("notes", "1.1.0", ack);
    expect(mockRequirePermission.mock.calls[0]).toEqual([
      "plugin.manage",
      { scope: "platform" },
    ]);
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(
      updateStorePlugin("../etc", "nope", undefined),
    ).rejects.toThrow("not allowed");
    expect(mockUpdateFromStore).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a plugin id that is a path", ["../etc", "1.1.0"]],
    ["a plugin id with capitals", ["Notes", "1.1.0"]],
    ["a plugin id that is not text", [7, "1.1.0"]],
    [
      "a plugin id that is a list which reads like a good one",
      [["notes"], "1.1.0"],
    ],
    ["a version that is a range", ["notes", "^1.1.0"]],
    ["a version that is a path", ["notes", "../1.1.0"]],
    ["a version that is not text", ["notes", 1]],
    ["nothing", [undefined, undefined]],
  ])("is refused with %s", async (_n, [plugin, version]) => {
    expect(
      await updateStorePlugin(plugin as string, version as string, ack),
    ).toEqual({ error: "Invalid request." });
    expect(mockUpdateFromStore).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing", undefined],
    ["false", { acknowledged: false }],
    ["the text true", { acknowledged: "true" as never }],
    ["1", { acknowledged: 1 as never }],
    ["an empty object", {}],
  ])("needs the yes, and %s is not that", async (_n, input) => {
    expect(await updateStorePlugin("notes", "1.1.0", input)).toEqual({
      error:
        "Confirm that you have read what the new version asks for before it is installed.",
    });
    expect(mockUpdateFromStore).not.toHaveBeenCalled();
  });

  it("hands over who asked, the plugin and the version, and gives back what the updater says", async () => {
    mockUpdateFromStore.mockResolvedValue({ error: "no" });
    expect(await updateStorePlugin("notes", "1.1.0", ack)).toEqual({
      error: "no",
    });
    expect(mockUpdateFromStore.mock.calls).toEqual([
      [{ actorId: "admin1", pluginId: "notes", version: "1.1.0" }],
    ]);
    mockUpdateFromStore.mockResolvedValue({ ok: true });
    expect(await updateStorePlugin("notes", "1.1.0", ack)).toEqual({
      ok: true,
    });
  });

  it("names no store, and takes no source, origin or hash from the client", async () => {
    await updateStorePlugin("notes", "1.1.0", {
      ...ack,
      storeId: "evil",
      source: "STORE",
      origin: "https://evil.example",
      integrity: "x",
    } as never);
    expect(
      Object.keys(mockUpdateFromStore.mock.calls[0]?.[0] as object).sort(),
    ).toEqual(["actorId", "pluginId", "version"]);
  });
});
