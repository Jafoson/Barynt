import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Keeping the clones up to date from the server side: what one store's sync writes to its row,
// which stores opening the page fetches (and which it waits for), and the action that fetches
// on request. The database, the permission check, `after` and DNS are replaced; the disk and
// the download code are real, with `fetch` answering from a store archive.

const findUnique = mock();
const findMany = mock();
const updateMany = mock();
mock.module("@/lib/db", () => ({
  db: { pluginStore: { findUnique, findMany, updateMany } },
}));
const requirePermission = mock(async (_p: string, _c: unknown) => "admin1");
mock.module("@/lib/permissions", () => ({
  requirePermission,
  PLATFORM: { scope: "platform" },
}));
let afterCallbacks: (() => unknown)[] = [];
mock.module("next/server", () => ({
  after: (callback: () => unknown) => afterCallbacks.push(callback),
}));
mock.module("node:dns/promises", () => ({
  lookup: async () => [{ address: "140.82.112.3", family: 4 }],
}));

process.env.SECRETS_KEY = "a-key-for-the-tests-that-is-long-enough-1234";

import { syncPluginStores } from "@/features/plugins/storeActions";
import { refreshStoresForPage } from "@/features/plugins/storeRefresh";
import { syncStore } from "@/features/plugins/storeSync";
import { storeCloneDir } from "@/lib/plugins/store/paths";
import { sealStoreToken } from "@/lib/plugins/storeCredentials";
import { storeArchive } from "../store-support/storeArchive";
import { entry, tgz } from "../store-support/tarBuilder";

const KEY = "github.com/acme/plugins";
const row = (more: object = {}) => ({
  key: KEY,
  url: "https://github.com/acme/plugins",
  enabled: true,
  credential: null,
  credentialUser: null,
  ...more,
});

let root: string;
let answer: () => Response;
const requests: { url: string; headers: Record<string, string> }[] = [];
const fetchSpy = spyOn(globalThis, "fetch");

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-storesync-"));
  process.env.BARYNT_PLUGINS_DIR = root;
  delete process.env.BARYNT_STORE_AUTO_SYNC;
  delete process.env.BARYNT_STORE_MAX_AGE_HOURS;
  afterCallbacks = [];
  requests.length = 0;
  findUnique.mockReset();
  findMany.mockReset();
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
  requirePermission.mockReset();
  requirePermission.mockResolvedValue("admin1");
  answer = () =>
    new Response(new Uint8Array(storeArchive({ plugins: [{ id: "notes" }] })), {
      status: 200,
    });
  fetchSpy.mockReset();
  fetchSpy.mockImplementation((async (url: string, init: RequestInit) => {
    requests.push({ url, headers: init.headers as Record<string, string> });
    return answer();
  }) as never);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
afterAll(() => {
  fetchSpy.mockRestore();
  delete process.env.BARYNT_PLUGINS_DIR;
});

const written = () => updateMany.mock.calls.map((c) => c[0]);
const cloneExists = async () => {
  const names: string[] = await readdir(join(root, ".stores")).catch(
    () => [] as string[],
  );
  return names.includes(storeCloneDir(root, KEY).split("/").pop() as string);
};

describe("the sync of one store", () => {
  it("fetches it, puts the clone in place and writes when, on the store's row", async () => {
    findUnique.mockResolvedValue(row());
    const before = Date.now();
    expect(await syncStore("s1")).toEqual({ ok: true });
    expect(await cloneExists()).toBe(true);
    expect(requests.map((r) => r.url)).toEqual([
      "https://codeload.github.com/acme/plugins/tar.gz/HEAD",
    ]);
    const [call] = written();
    expect(call.where).toEqual({ id: "s1" });
    expect(Object.keys(call.data).sort()).toEqual([
      "syncAttemptedAt",
      "syncError",
      "syncedAt",
    ]);
    expect(call.data.syncError).toBeNull();
    expect(call.data.syncedAt).toBeInstanceOf(Date);
    expect(call.data.syncedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.data.syncAttemptedAt).toBe(call.data.syncedAt);
  });

  it("looks for the store by the id it was given, and only takes what it needs", async () => {
    findUnique.mockResolvedValue(row());
    await syncStore("s1");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "s1" },
      select: {
        key: true,
        url: true,
        enabled: true,
        credential: true,
        credentialUser: true,
      },
    });
  });

  it("writes why, and only that the try was made, when the store cannot be reached, and keeps what it had", async () => {
    findUnique.mockResolvedValue(row());
    await syncStore("s1");
    answer = () => new Response("gone", { status: 404 });
    expect(await syncStore("s1")).toEqual({ ok: true });
    const failed = written()[1];
    expect(Object.keys(failed.data).sort()).toEqual([
      "syncAttemptedAt",
      "syncError",
    ]);
    expect(failed.data.syncError).toBe("The server answered 404.");
    expect(await cloneExists()).toBe(true);
  });

  it("cuts a reason that is long, such as a store.json with a lot wrong in it", async () => {
    findUnique.mockResolvedValue(row());
    const wrong = JSON.stringify({
      schemaVersion: 1,
      id: "test-store",
      name: "Test",
      maintainerKeys: Array.from({ length: 60 }, (_, n) => n),
    });
    answer = () =>
      new Response(
        new Uint8Array(tgz(entry({ name: "r/store.json", data: wrong }))),
        {
          status: 200,
        },
      );
    await syncStore("s1");
    const stored: string = written()[0].data.syncError;
    expect(stored).toStartWith("Not a store: store.json");
    expect(stored).toHaveLength(300);
  });

  it("does not try a store that is not there, or that is switched off, and writes nothing", async () => {
    findUnique.mockResolvedValue(null);
    expect(await syncStore("nope")).toEqual({
      error: "There is no such store.",
    });
    findUnique.mockResolvedValue(row({ enabled: false }));
    expect(await syncStore("s1")).toEqual({
      error: "The store is switched off.",
    });
    expect(requests).toHaveLength(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("says why when there is no plugin directory", async () => {
    process.env.BARYNT_PLUGINS_DIR = "relative/dir";
    const result = await syncStore("s1");
    expect(result).toMatchObject({
      error: expect.stringContaining("absolute"),
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("does not fail when the store was removed while it was fetched", async () => {
    findUnique.mockResolvedValue(row());
    updateMany.mockResolvedValue({ count: 0 });
    expect(await syncStore("s1")).toEqual({ ok: true });
  });

  it("gives the time it may take: half a minute when someone asked", async () => {
    findUnique.mockResolvedValue(row());
    const timeout = spyOn(AbortSignal, "timeout");
    try {
      await syncStore("s1");
      await syncStore("s1", 1234);
      expect(timeout.mock.calls.map((c) => c[0])).toEqual([30_000, 1234]);
    } finally {
      timeout.mockRestore();
    }
  });
});

describe("the token of a private store", () => {
  it("is opened for the store it was sealed for, and goes to the host as its own header", async () => {
    findUnique.mockResolvedValue(
      row({ credential: sealStoreToken(KEY, "TOKEN-1") }),
    );
    await syncStore("s1");
    expect(requests[0]?.url).toBe(
      "https://api.github.com/repos/acme/plugins/tarball",
    );
    expect(requests[0]?.headers.authorization).toBe("Bearer TOKEN-1");
  });

  it("is sent with the user name where the host wants one", async () => {
    findUnique.mockResolvedValue(
      row({
        key: "bitbucket.org/acme/plugins",
        url: "https://bitbucket.org/acme/plugins",
        credential: sealStoreToken(
          "bitbucket.org/acme/plugins",
          "APP-PASSWORD",
        ),
        credentialUser: "jane",
      }),
    );
    await syncStore("s1");
    expect(requests[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("jane:APP-PASSWORD").toString("base64")}`,
    );
  });

  it("is not used when it was sealed for another store: it is no token", async () => {
    findUnique.mockResolvedValue(
      row({ credential: sealStoreToken("github.com/other/repo", "TOKEN-2") }),
    );
    await syncStore("s1");
    expect(requests[0]?.url).toBe(
      "https://codeload.github.com/acme/plugins/tar.gz/HEAD",
    );
    expect(requests[0]?.headers.authorization).toBeUndefined();
  });

  it("is in nothing that is written or returned", async () => {
    findUnique.mockResolvedValue(
      row({ credential: sealStoreToken(KEY, "TOKEN-SECRET") }),
    );
    answer = () => new Response("no", { status: 401 });
    const result = await syncStore("s1");
    expect(JSON.stringify([result, updateMany.mock.calls])).not.toContain(
      "TOKEN-SECRET",
    );
  });
});

describe("opening the store page", () => {
  const stores = (
    ...list: {
      id: string;
      syncedAt: Date | null;
      syncAttemptedAt: Date | null;
    }[]
  ) => findMany.mockResolvedValue(list);
  const HOUR = 60 * 60 * 1000;
  const ago = (ms: number) => new Date(Date.now() - ms);

  it("asks for plugin.manage first, and does nothing when it is refused", async () => {
    requirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(refreshStoresForPage()).rejects.toThrow("not allowed");
    expect(requirePermission.mock.calls[0]).toEqual([
      "plugin.manage",
      { scope: "platform" },
    ]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("fetches a store that was never fetched before the page goes on, and only the stores that are on", async () => {
    stores({ id: "s1", syncedAt: null, syncAttemptedAt: null });
    findUnique.mockResolvedValue(row());
    await refreshStoresForPage();
    expect(findMany).toHaveBeenCalledWith({
      where: { enabled: true },
      select: { id: true, syncedAt: true, syncAttemptedAt: true },
    });
    expect(requests).toHaveLength(1);
    expect(afterCallbacks).toHaveLength(0);
    expect(await cloneExists()).toBe(true);
  });

  it("waits at most 15 seconds for it", async () => {
    stores({ id: "s1", syncedAt: null, syncAttemptedAt: null });
    findUnique.mockResolvedValue(row());
    const timeout = spyOn(AbortSignal, "timeout");
    try {
      await refreshStoresForPage();
      expect(timeout.mock.calls.map((c) => c[0])).toEqual([15_000]);
    } finally {
      timeout.mockRestore();
    }
  });

  it("leaves a store whose state is old for after the page is sent, and does not wait for it", async () => {
    stores({
      id: "s1",
      syncedAt: ago(20 * HOUR),
      syncAttemptedAt: ago(20 * HOUR),
    });
    findUnique.mockResolvedValue(row());
    await refreshStoresForPage();
    expect(requests).toHaveLength(0);
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]?.();
    expect(requests).toHaveLength(1);
    expect(written()[0].data.syncError).toBeNull();
  });

  it("fetches the stores that are due, and only those", async () => {
    stores(
      { id: "never", syncedAt: null, syncAttemptedAt: null },
      { id: "fresh", syncedAt: ago(HOUR), syncAttemptedAt: ago(HOUR) },
      { id: "just-tried", syncedAt: null, syncAttemptedAt: ago(60_000) },
      { id: "old", syncedAt: ago(20 * HOUR), syncAttemptedAt: ago(20 * HOUR) },
    );
    findUnique.mockResolvedValue(row());
    await refreshStoresForPage();
    await Promise.all(afterCallbacks.map((c) => c()));
    expect(findUnique.mock.calls.map((c) => c[0].where.id).sort()).toEqual([
      "never",
      "old",
    ]);
  });

  it("fetches nothing when the environment says not to", async () => {
    process.env.BARYNT_STORE_AUTO_SYNC = "off";
    stores({ id: "s1", syncedAt: null, syncAttemptedAt: null });
    await refreshStoresForPage();
    expect(findMany).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  it("takes the age from the environment", async () => {
    process.env.BARYNT_STORE_MAX_AGE_HOURS = "48";
    stores({
      id: "s1",
      syncedAt: ago(20 * HOUR),
      syncAttemptedAt: ago(20 * HOUR),
    });
    await refreshStoresForPage();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("does not fail the page when it cannot look, or when a fetch throws", async () => {
    findMany.mockRejectedValue(new Error("database down"));
    await expect(refreshStoresForPage()).resolves.toBeUndefined();
    stores({
      id: "s1",
      syncedAt: ago(20 * HOUR),
      syncAttemptedAt: ago(20 * HOUR),
    });
    findUnique.mockRejectedValue(new Error("boom"));
    await refreshStoresForPage();
    await expect(
      Promise.all(afterCallbacks.map((c) => c())),
    ).resolves.toBeDefined();
  });
});

describe("the action that fetches on request", () => {
  it("asks for plugin.manage first", async () => {
    requirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(syncPluginStores("s1")).rejects.toThrow("not allowed");
    expect(requirePermission.mock.calls[0]).toEqual([
      "plugin.manage",
      { scope: "platform" },
    ]);
    expect(findUnique).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each([
    ["an id that is not text", 42],
    ["an empty id", ""],
    ["an id that is too long", "s".repeat(101)],
  ])("refuses %s", async (_n, id) => {
    expect(await syncPluginStores(id as never)).toEqual({
      error: "Invalid request.",
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("takes an id of 100 characters, and no more", async () => {
    findUnique.mockResolvedValue(row());
    expect(await syncPluginStores("s".repeat(100))).toEqual({ ok: true });
    expect(await syncPluginStores("s".repeat(101))).toEqual({
      error: "Invalid request.",
    });
  });

  it("fetches the store it was given, however the fetch goes", async () => {
    findUnique.mockResolvedValue(row());
    expect(await syncPluginStores("s1")).toEqual({ ok: true });
    answer = () => new Response("gone", { status: 404 });
    expect(await syncPluginStores("s1")).toEqual({ ok: true });
    expect(written()[1].data.syncError).toBe("The server answered 404.");
  });

  it("says when it could not even try", async () => {
    findUnique.mockResolvedValue(row({ enabled: false }));
    expect(await syncPluginStores("s1")).toEqual({
      error: "The store is switched off.",
    });
  });

  it("fetches every store that is on when it is given none", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    findUnique.mockResolvedValue(row());
    expect(await syncPluginStores()).toEqual({ ok: true });
    expect(findMany).toHaveBeenCalledWith({
      where: { enabled: true },
      select: { id: true },
    });
    expect(findUnique.mock.calls.map((c) => c[0].where.id).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("gives the first thing that could not be tried, when fetching them all", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "gone" }]);
    findUnique.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === "gone" ? null : row(),
    );
    expect(await syncPluginStores()).toEqual({
      error: "There is no such store.",
    });
  });
});
