import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Which plugin stores are on. The list decides which code the platform can be
// asked to approve, so: only `plugin.manage` may change it, every change is
// audited, and connecting or switching on a store needs an explicit "I trust it"
// that the server enforces itself. No real database.

const mockStoreCount = mock();
const mockStoreFindUnique = mock();
const mockStoreFindMany = mock();
const mockStoreCreate = mock();
const mockStoreUpdate = mock();
const mockStoreDelete = mock();
const mockAuditCreate = mock();
const mockRevalidate = mock();

mock.module("@/lib/db", () => ({
  db: {
    pluginStore: {
      count: mockStoreCount,
      findUnique: mockStoreFindUnique,
      findMany: mockStoreFindMany,
      create: mockStoreCreate,
      update: mockStoreUpdate,
      delete: mockStoreDelete,
    },
    auditLog: { create: mockAuditCreate },
    user: { findUnique: mock(async () => null) },
  },
}));
mock.module("next/cache", () => ({ revalidatePath: mockRevalidate }));

const mockRequirePermission = mock(
  async (_permission: string, _context: unknown) => "admin1",
);
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequirePermission,
  PLATFORM: { scope: "platform" },
}));
mock.module("react", () => ({ cache: <T>(fn: T) => fn }));

import {
  addPluginStore,
  removePluginStore,
  setPluginStoreEnabled,
} from "@/features/plugin-stores/actions";
import {
  MAX_PLUGIN_STORES,
  MAX_STORE_NAME_LENGTH,
  MAX_STORE_URL_LENGTH,
} from "@/features/plugin-stores/constants";
import { getPluginStores } from "@/features/plugin-stores/queries";
import { getRegistryState } from "@/lib/plugins/registryState";
import { storeCloneDir } from "@/lib/plugins/store/paths";

const OWN = "https://git.example.com/team/plugins";

function reset() {
  for (const m of [
    mockStoreCount,
    mockStoreFindUnique,
    mockStoreFindMany,
    mockStoreCreate,
    mockStoreUpdate,
    mockStoreDelete,
    mockAuditCreate,
    mockRevalidate,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("admin1");
  mockStoreCount.mockResolvedValue(1);
  mockStoreFindUnique.mockResolvedValue(null);
  mockStoreFindMany.mockResolvedValue([]);
  mockStoreCreate.mockResolvedValue({ id: "s2" });
  mockStoreUpdate.mockResolvedValue({});
  mockStoreDelete.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
}

beforeEach(reset);

function addInput(more: Partial<Parameters<typeof addPluginStore>[0]> = {}) {
  return { url: OWN, name: "Our plugins", trusted: true, ...more };
}

/** Every write the actions can make, to say none happened. */
function wrote(): boolean {
  return [
    mockStoreCreate,
    mockStoreUpdate,
    mockStoreDelete,
    mockAuditCreate,
    mockRevalidate,
  ].some((m) => m.mock.calls.length > 0);
}

const OFFICIAL = {
  id: "s1",
  name: "Barynt (official)",
  key: "github.com/jafoson/barynt-plugin-store",
  official: true,
  enabled: true,
};
const CUSTOM = {
  id: "s2",
  name: "Our plugins",
  key: "git.example.com/team/plugins",
  official: false,
  enabled: true,
};

describe("who may change the stores", () => {
  it("asks for plugin.manage in the platform context, for every action and query", async () => {
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    await addPluginStore(addInput());
    await setPluginStoreEnabled("s2", false);
    await removePluginStore("s2");
    await getPluginStores();
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.manage", { scope: "platform" }],
      ["plugin.manage", { scope: "platform" }],
      ["plugin.manage", { scope: "platform" }],
      ["plugin.manage", { scope: "platform" }],
    ]);
  });

  it("does nothing at all when the permission is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(addPluginStore(addInput())).rejects.toThrow("not allowed");
    await expect(setPluginStoreEnabled("s2", false)).rejects.toThrow();
    await expect(removePluginStore("s2")).rejects.toThrow();
    await expect(getPluginStores()).rejects.toThrow();
    expect(wrote()).toBe(false);
    expect(mockStoreFindUnique).not.toHaveBeenCalled();
    expect(mockStoreFindMany).not.toHaveBeenCalled();
    expect(mockStoreCount).not.toHaveBeenCalled();
  });
});

describe("connecting a store", () => {
  it("adds it, switched on and not official, and audits who did it", async () => {
    const result = await addPluginStore(addInput({ url: `  ${OWN}.git/  ` }));
    expect(result).toEqual({ ok: true });
    expect(mockStoreCreate).toHaveBeenCalledWith({
      data: {
        url: `${OWN}.git/`,
        key: "git.example.com/team/plugins",
        name: "Our plugins",
        official: false,
        enabled: true,
        credential: null,
        credentialUser: null,
      },
      select: { id: true },
    });
    const audit = mockAuditCreate.mock.calls[0]?.[0].data;
    expect(audit).toMatchObject({
      action: "plugin.store.added",
      actorId: "admin1",
      targetType: "pluginStore",
      targetId: "s2",
      targetLabel: "Our plugins (git.example.com/team/plugins)",
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["nothing", undefined],
    ["false", false],
    ["the text true", "true"],
    ["1", 1],
    ["null", null],
  ])(
    "is refused without a real yes to trusting it: %s",
    async (_name, trusted) => {
      const result = await addPluginStore(
        addInput({ trusted: trusted as unknown as boolean }),
      );
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("trust");
      expect(wrote()).toBe(false);
    },
  );

  it("is refused for input that is not even an object", async () => {
    const result = await addPluginStore(undefined as unknown as never);
    expect(result).toHaveProperty("error");
    expect(wrote()).toBe(false);
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a name of spaces", { name: "   " }],
    [
      "a name that is too long",
      { name: "x".repeat(MAX_STORE_NAME_LENGTH + 1) },
    ],
    ["a name that is not text", { name: 5 as unknown as string }],
  ])("is refused with %s", async (_name, more) => {
    const result = await addPluginStore(addInput(more));
    expect((result as { error: string }).error).toContain("name");
    expect(wrote()).toBe(false);
  });

  it("trims the name", async () => {
    await addPluginStore(addInput({ name: "  Our plugins  " }));
    expect(mockStoreCreate.mock.calls[0]?.[0].data.name).toBe("Our plugins");
  });

  it.each([
    ["an empty address", ""],
    ["text that is no address", "our plugin store"],
    ["plain http", "http://git.example.com/team/plugins"],
    ["the ssh form", "git@git.example.com:team/plugins.git"],
    ["credentials in it", "https://user:token@git.example.com/team/plugins"],
    ["a port", "https://git.example.com:8443/team/plugins"],
    ["a query", "https://git.example.com/team/plugins?x=1"],
    ["a fragment", "https://git.example.com/team/plugins#x"],
    ["only a host", "https://git.example.com"],
    ["a file address", "file:///srv/plugins"],
    [
      "an address that is too long",
      `https://git.example.com/${"a".repeat(MAX_STORE_URL_LENGTH)}`,
    ],
    ["something that is not text", 5 as unknown as string],
  ])(
    "is refused with %s, and tells what an address looks like",
    async (_name, url) => {
      const result = await addPluginStore(addInput({ url }));
      expect((result as { error: string }).error).toContain("https://");
      expect(wrote()).toBe(false);
    },
  );

  it("is refused for a store that is connected, however its address is written", async () => {
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    for (const url of [OWN, `${OWN}.git`, `${OWN}/`, OWN.toUpperCase()]) {
      const result = await addPluginStore(addInput({ url }));
      expect(result).toEqual({ error: "This store is already connected." });
    }
    expect(mockStoreFindUnique).toHaveBeenCalledWith({
      where: { key: "git.example.com/team/plugins" },
    });
    expect(wrote()).toBe(false);
  });

  it("is refused for the official store's address too, it is already there", async () => {
    mockStoreFindUnique.mockResolvedValue(OFFICIAL);
    const result = await addPluginStore(
      addInput({ url: "https://github.com/Jafoson/barynt-plugin-store.git" }),
    );
    expect(result).toEqual({ error: "This store is already connected." });
    expect(wrote()).toBe(false);
  });

  it("copes with two admins adding the same address at once", async () => {
    mockStoreCreate.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );
    expect(await addPluginStore(addInput())).toEqual({
      error: "This store is already connected.",
    });
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("does not hide a database error that is not a duplicate", async () => {
    mockStoreCreate.mockRejectedValue(new Error("connection lost"));
    await expect(addPluginStore(addInput())).rejects.toThrow("connection lost");
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("stops at the limit", async () => {
    mockStoreCount.mockResolvedValue(MAX_PLUGIN_STORES);
    const result = await addPluginStore(addInput());
    expect((result as { error: string }).error).toContain(
      String(MAX_PLUGIN_STORES),
    );
    expect(wrote()).toBe(false);
  });

  it("checks what is wrong with the request before it looks at the database", async () => {
    await addPluginStore(addInput({ trusted: false }));
    await addPluginStore(addInput({ name: "" }));
    await addPluginStore(addInput({ url: "nope" }));
    expect(mockStoreCount).not.toHaveBeenCalled();
    expect(mockStoreFindUnique).not.toHaveBeenCalled();
  });
});

describe("switching a store on or off", () => {
  it("switches the official store off without any question, and audits it", async () => {
    mockStoreFindUnique.mockResolvedValue(OFFICIAL);
    expect(await setPluginStoreEnabled("s1", false)).toEqual({ ok: true });
    expect(mockStoreUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { enabled: false },
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.store.disabled",
      targetLabel: "Barynt (official) (github.com/jafoson/barynt-plugin-store)",
    });
  });

  it("switches any store off without a question", async () => {
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    expect(await setPluginStoreEnabled("s2", false)).toEqual({ ok: true });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      "plugin.store.disabled",
    );
  });

  it("switches the official store back on without a question", async () => {
    mockStoreFindUnique.mockResolvedValue({ ...OFFICIAL, enabled: false });
    expect(await setPluginStoreEnabled("s1", true)).toEqual({ ok: true });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      "plugin.store.enabled",
    );
  });

  it.each([undefined, false, "true" as unknown as boolean])(
    "does not switch another store on without a real yes to trusting it (%p)",
    async (trusted) => {
      mockStoreFindUnique.mockResolvedValue({ ...CUSTOM, enabled: false });
      const result = await setPluginStoreEnabled("s2", true, trusted);
      expect((result as { error: string }).error).toContain("trust");
      expect(wrote()).toBe(false);
    },
  );

  it("switches another store on when the answer is yes", async () => {
    mockStoreFindUnique.mockResolvedValue({ ...CUSTOM, enabled: false });
    expect(await setPluginStoreEnabled("s2", true, true)).toEqual({ ok: true });
    expect(mockStoreUpdate).toHaveBeenCalledWith({
      where: { id: "s2" },
      data: { enabled: true },
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data.action).toBe(
      "plugin.store.enabled",
    );
  });

  it("does nothing, and logs nothing, when the store is already as asked", async () => {
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    expect(await setPluginStoreEnabled("s2", true)).toEqual({ ok: true });
    mockStoreFindUnique.mockResolvedValue({ ...CUSTOM, enabled: false });
    expect(await setPluginStoreEnabled("s2", false)).toEqual({ ok: true });
    expect(wrote()).toBe(false);
  });

  it("refuses a store that does not exist", async () => {
    expect(await setPluginStoreEnabled("nope", false)).toEqual({
      error: "Unknown store.",
    });
    expect(wrote()).toBe(false);
  });
});

describe("removing a store", () => {
  it("removes it and audits it", async () => {
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    expect(await removePluginStore("s2")).toEqual({ ok: true });
    expect(mockStoreDelete).toHaveBeenCalledWith({ where: { id: "s2" } });
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.store.removed",
      targetId: "s2",
      targetLabel: "Our plugins (git.example.com/team/plugins)",
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  describe("and its clone", () => {
    let dir: string;
    const before = process.env.BARYNT_PLUGINS_DIR;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "barynt-removestore-"));
      process.env.BARYNT_PLUGINS_DIR = dir;
    });
    afterEach(async () => {
      if (before === undefined) delete process.env.BARYNT_PLUGINS_DIR;
      else process.env.BARYNT_PLUGINS_DIR = before;
      await rm(dir, { recursive: true, force: true });
    });
    const clone = async (key: string) => {
      const path = storeCloneDir(dir, key);
      await mkdir(join(path, "plugins"), { recursive: true });
      await writeFile(join(path, "store.json"), "{}");
      return path.split("/").pop() as string;
    };

    it("goes with the store, and no other store's does", async () => {
      const own = await clone("git.example.com/team/plugins");
      const other = await clone("git.example.com/other/plugins");
      mockStoreFindUnique.mockResolvedValue(CUSTOM);
      expect(await removePluginStore("s2")).toEqual({ ok: true });
      expect(await readdir(join(dir, ".stores"))).toEqual([other]);
      expect(own).not.toBe(other);
    });

    it("is not missed when there is none", async () => {
      mockStoreFindUnique.mockResolvedValue(CUSTOM);
      expect(await removePluginStore("s2")).toEqual({ ok: true });
    });

    it("does not fail the removal when plugins are off", async () => {
      process.env.BARYNT_PLUGINS_DIR = "relative/dir";
      mockStoreFindUnique.mockResolvedValue(CUSTOM);
      expect(await removePluginStore("s2")).toEqual({ ok: true });
      expect(mockStoreDelete).toHaveBeenCalledTimes(1);
    });

    it("is not touched when the store is the official one, which stays", async () => {
      const official = await clone("github.com/jafoson/barynt-plugin-store");
      mockStoreFindUnique.mockResolvedValue(OFFICIAL);
      await removePluginStore("s1");
      expect(await readdir(join(dir, ".stores"))).toEqual([official]);
    });
  });

  it("never removes the official store, and says to switch it off", async () => {
    mockStoreFindUnique.mockResolvedValue(OFFICIAL);
    const result = await removePluginStore("s1");
    expect((result as { error: string }).error).toContain("Switch it off");
    expect(mockStoreDelete).not.toHaveBeenCalled();
    expect(wrote()).toBe(false);
  });

  it("refuses a store that does not exist", async () => {
    expect(await removePluginStore("nope")).toEqual({
      error: "Unknown store.",
    });
    expect(mockStoreDelete).not.toHaveBeenCalled();
  });
});

describe("the list for the settings page", () => {
  it("has the official store first, then by name, and reads only the columns it needs", async () => {
    mockStoreFindMany.mockResolvedValue([
      {
        id: "s1",
        name: "A",
        url: "u",
        official: true,
        enabled: true,
        credential: null,
        credentialUser: null,
      },
    ]);
    const rows = await getPluginStores();
    expect(rows).toHaveLength(1);
    // The sealed token is read only to say whether there is one, and is not passed on
    // (see credentials.test.ts).
    expect(mockStoreFindMany).toHaveBeenCalledWith({
      orderBy: [{ official: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        url: true,
        official: true,
        enabled: true,
        credential: true,
        credentialUser: true,
      },
    });
  });
});

describe("the registry that keeps which plugins run", () => {
  // Which stores are on decides which plugins may run, and the registry keeps its
  // answer. Whatever changes that says so; whatever changes nothing does not.
  const FAKE = {
    builtAt: 0,
    dir: "/plugins",
    problem: null,
    discoveryIssues: [],
    plugins: [],
    active: [],
  };
  const state = getRegistryState();
  beforeEach(() => {
    state.snapshot = FAKE;
    state.generation = 0;
  });

  it("is invalidated when a store is connected", async () => {
    await addPluginStore(addInput());
    expect(state.snapshot).toBeNull();
    expect(state.generation).toBe(1);
  });

  it("is invalidated when a store is switched on or off", async () => {
    mockStoreFindUnique.mockResolvedValue({ ...CUSTOM, enabled: true });
    await setPluginStoreEnabled("s2", false);
    expect(state.snapshot).toBeNull();

    state.snapshot = FAKE;
    mockStoreFindUnique.mockResolvedValue({ ...CUSTOM, enabled: false });
    await setPluginStoreEnabled("s2", true, true);
    expect(state.snapshot).toBeNull();
    expect(state.generation).toBe(2);
  });

  it("is invalidated when a store is removed", async () => {
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    await removePluginStore("s2");
    expect(state.snapshot).toBeNull();
    expect(state.generation).toBe(1);
  });

  it("is left alone when nothing changed or nothing was allowed", async () => {
    // Refused: no yes to trusting the store, a name that is too long, an address that is not one.
    await addPluginStore(addInput({ trusted: false }));
    await addPluginStore(
      addInput({ name: "x".repeat(MAX_STORE_NAME_LENGTH + 1) }),
    );
    await addPluginStore(addInput({ url: "http://insecure.example.com/x" }));
    // Already there.
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    await addPluginStore(addInput());
    // Switching to the state it is in.
    mockStoreFindUnique.mockResolvedValue({ ...CUSTOM, enabled: true });
    await setPluginStoreEnabled("s2", true);
    // Switching a store on without the yes.
    mockStoreFindUnique.mockResolvedValue({ ...CUSTOM, enabled: false });
    await setPluginStoreEnabled("s2", true, false);
    // The official store cannot be removed, an unknown one is nothing to remove.
    mockStoreFindUnique.mockResolvedValue(OFFICIAL);
    await removePluginStore("s1");
    mockStoreFindUnique.mockResolvedValue(null);
    await removePluginStore("nope");
    expect(state.snapshot).toBe(FAKE);
    expect(state.generation).toBe(0);
  });

  it("is left alone when the permission is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(addPluginStore(addInput())).rejects.toThrow();
    await expect(setPluginStoreEnabled("s2", false)).rejects.toThrow();
    await expect(removePluginStore("s2")).rejects.toThrow();
    expect(state.snapshot).toBe(FAKE);
  });
});
