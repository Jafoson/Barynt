import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// Access to a private store: a token, sealed before it is stored and bound to the
// store's address. What matters: the token is never stored, returned, audited or
// put in an error in the clear; only `plugin.manage` may set or remove it; a
// value that is invalid or has no key to seal with stores nothing; and a sealed
// token opens only for the store it was sealed for. No real database, real crypto.

const mockStoreCount = mock();
const mockStoreFindUnique = mock();
const mockStoreFindMany = mock();
const mockStoreCreate = mock();
const mockStoreUpdate = mock();
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
  clearPluginStoreCredential,
  setPluginStoreCredential,
} from "@/features/plugin-stores/actions";
import {
  MAX_STORE_TOKEN_LENGTH,
  MAX_STORE_USERNAME_LENGTH,
} from "@/features/plugin-stores/constants";
import { parseStoreCredential } from "@/features/plugin-stores/credential";
import { getPluginStores } from "@/features/plugin-stores/queries";
import { openStoreToken } from "@/lib/plugins/storeCredentials";

const OWN = "https://git.example.com/team/plugins";
const OWN_KEY = "git.example.com/team/plugins";
const OTHER_KEY = "git.example.org/other/plugins";
const TOKEN = "ghp_SecretTokenValue0123456789";
const KEY = "k".repeat(40);

let savedEnv: { SECRETS_KEY?: string; AUTH_SECRET?: string };

function reset() {
  for (const m of [
    mockStoreCount,
    mockStoreFindUnique,
    mockStoreFindMany,
    mockStoreCreate,
    mockStoreUpdate,
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
  mockAuditCreate.mockResolvedValue({});
}

beforeEach(() => {
  reset();
  savedEnv = {
    SECRETS_KEY: process.env.SECRETS_KEY,
    AUTH_SECRET: process.env.AUTH_SECRET,
  };
  delete process.env.SECRETS_KEY;
  process.env.AUTH_SECRET = KEY;
});

afterEach(() => {
  for (const name of ["SECRETS_KEY", "AUTH_SECRET"] as const) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

/** Everything the actions handed to the database, the audit log or the cache. */
function everythingWritten(): string {
  return JSON.stringify([
    mockStoreCreate.mock.calls,
    mockStoreUpdate.mock.calls,
    mockAuditCreate.mock.calls,
    mockRevalidate.mock.calls,
  ]);
}

function wrote(): boolean {
  return [
    mockStoreCreate,
    mockStoreUpdate,
    mockAuditCreate,
    mockRevalidate,
  ].some((m) => m.mock.calls.length > 0);
}

const CUSTOM = { id: "s2", name: "Our plugins", key: OWN_KEY };

describe("parseStoreCredential", () => {
  it("takes a token, and no user name is null", () => {
    expect(parseStoreCredential({ token: TOKEN })).toEqual({
      ok: true,
      username: null,
      token: TOKEN,
    });
    expect(parseStoreCredential({ token: TOKEN, username: "   " })).toEqual({
      ok: true,
      username: null,
      token: TOKEN,
    });
  });

  it("trims a token that was pasted with a line break", () => {
    expect(parseStoreCredential({ token: `  ${TOKEN}\n` })).toEqual({
      ok: true,
      username: null,
      token: TOKEN,
    });
  });

  it("keeps a user name", () => {
    expect(
      parseStoreCredential({ token: TOKEN, username: " deploy-bot " }),
    ).toEqual({ ok: true, username: "deploy-bot", token: TOKEN });
  });

  it.each([
    ["nothing", undefined],
    ["an empty text", ""],
    ["spaces only", "   "],
    ["a number", 42],
    ["null", null],
    ["an object", { toString: () => TOKEN }],
    ["a list", [TOKEN]],
  ])("needs a token: %s", (_name, token) => {
    expect(parseStoreCredential({ token })).toHaveProperty("error");
  });

  it.each([
    ["a space inside", "abc def"],
    ["a line break inside", "abc\ndef"],
    ["a carriage return", "abc\rdef"],
    ["a tab", "abc\tdef"],
    ["a null character", "abc\u0000def"],
    ["a delete character", "abc\u007fdef"],
    ["a header break", "abc\r\nX-Injected: 1"],
    ["a non-ASCII letter", "tökén"],
    ["an emoji", "abc🔐"],
    ["a no-break space", "abc\u00a0def"],
    ["a zero-width space", "abc\u200bdef"],
  ])("refuses a token with %s", (_name, token) => {
    expect(parseStoreCredential({ token })).toHaveProperty("error");
  });

  it("allows the longest token and refuses one character more", () => {
    expect(
      parseStoreCredential({ token: "a".repeat(MAX_STORE_TOKEN_LENGTH) }),
    ).toHaveProperty("ok", true);
    expect(
      parseStoreCredential({ token: "a".repeat(MAX_STORE_TOKEN_LENGTH + 1) }),
    ).toHaveProperty("error");
  });

  it.each([
    ["a colon", "de:ploy"],
    ["a space", "de ploy"],
    ["a line break", "deploy\nbot"],
    ["a non-ASCII letter", "dépløy"],
  ])("refuses a user name with %s", (_name, username) => {
    expect(parseStoreCredential({ token: TOKEN, username })).toHaveProperty(
      "error",
    );
  });

  it("allows the longest user name and refuses one character more", () => {
    expect(
      parseStoreCredential({
        token: TOKEN,
        username: "u".repeat(MAX_STORE_USERNAME_LENGTH),
      }),
    ).toHaveProperty("ok", true);
    expect(
      parseStoreCredential({
        token: TOKEN,
        username: "u".repeat(MAX_STORE_USERNAME_LENGTH + 1),
      }),
    ).toHaveProperty("error");
  });

  it("does not put the token in an error text", () => {
    const bad = `${TOKEN} with a space`;
    const result = parseStoreCredential({ token: bad });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe("connecting a store with a token", () => {
  it("stores it sealed, bound to the store's address, and never in the clear", async () => {
    const result = await addPluginStore({
      url: OWN,
      name: "Our plugins",
      trusted: true,
      token: ` ${TOKEN} `,
      username: "deploy-bot",
    });
    expect(result).toEqual({ ok: true });

    const data = mockStoreCreate.mock.calls[0]?.[0].data;
    expect(data.credentialUser).toBe("deploy-bot");
    expect(data.credential).toMatch(/^v1\./);
    expect(data.credential).not.toContain(TOKEN);
    // It opens for this store's address, and for no other.
    expect(openStoreToken(OWN_KEY, data.credential)).toBe(TOKEN);
    expect(openStoreToken(OTHER_KEY, data.credential)).toBeNull();

    expect(everythingWritten()).not.toContain(TOKEN);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("audits that a store was connected and that access was set, without the token", async () => {
    await addPluginStore({
      url: OWN,
      name: "Our plugins",
      trusted: true,
      token: TOKEN,
    });
    const actions = mockAuditCreate.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual([
      "plugin.store.added",
      "plugin.store.credentialSet",
    ]);
    for (const call of mockAuditCreate.mock.calls) {
      expect(call[0].data).toMatchObject({
        actorId: "admin1",
        targetType: "pluginStore",
        targetId: "s2",
        targetLabel: `Our plugins (${OWN_KEY})`,
      });
      expect(call[0].data.meta).toBeUndefined();
    }
  });

  it("stores no credential and audits none when there is no token", async () => {
    await addPluginStore({ url: OWN, name: "Our plugins", trusted: true });
    const data = mockStoreCreate.mock.calls[0]?.[0].data;
    expect(data.credential).toBeNull();
    expect(data.credentialUser).toBeNull();
    expect(mockAuditCreate.mock.calls.map((c) => c[0].data.action)).toEqual([
      "plugin.store.added",
    ]);
  });

  it("still needs the yes to trusting the store", async () => {
    const result = await addPluginStore({
      url: OWN,
      name: "Our plugins",
      trusted: false,
      token: TOKEN,
    });
    expect(result).toHaveProperty("error");
    expect(wrote()).toBe(false);
  });

  it("refuses a user name without a token, and stores nothing", async () => {
    const result = await addPluginStore({
      url: OWN,
      name: "Our plugins",
      trusted: true,
      username: "deploy-bot",
    });
    expect(result).toHaveProperty("error");
    expect(wrote()).toBe(false);
  });

  it("refuses an invalid token, and stores nothing", async () => {
    const result = await addPluginStore({
      url: OWN,
      name: "Our plugins",
      trusted: true,
      token: "has a space",
    });
    expect(result).toHaveProperty("error");
    expect(wrote()).toBe(false);
  });

  it("stores nothing, and says why, when there is no key to seal with", async () => {
    delete process.env.AUTH_SECRET;
    const result = await addPluginStore({
      url: OWN,
      name: "Our plugins",
      trusted: true,
      token: TOKEN,
    });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("SECRETS_KEY");
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(wrote()).toBe(false);
  });

  it("does not need a key when there is no token", async () => {
    delete process.env.AUTH_SECRET;
    const result = await addPluginStore({
      url: OWN,
      name: "Our plugins",
      trusted: true,
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("setting the access of a connected store", () => {
  it("seals it for that store's address and records that it was set", async () => {
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    const result = await setPluginStoreCredential("s2", {
      token: TOKEN,
      username: "deploy-bot",
    });
    expect(result).toEqual({ ok: true });

    const update = mockStoreUpdate.mock.calls[0]?.[0];
    expect(update.where).toEqual({ id: "s2" });
    expect(update.data.credentialUser).toBe("deploy-bot");
    // A new token may be what a store that failed was waiting for: the next visit tries again.
    expect(update.data.syncAttemptedAt).toBeNull();
    expect(openStoreToken(OWN_KEY, update.data.credential)).toBe(TOKEN);
    expect(openStoreToken(OTHER_KEY, update.data.credential)).toBeNull();

    expect(mockAuditCreate.mock.calls).toHaveLength(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.store.credentialSet",
      actorId: "admin1",
      targetType: "pluginStore",
      targetId: "s2",
      targetLabel: `Our plugins (${OWN_KEY})`,
    });
    expect(everythingWritten()).not.toContain(TOKEN);
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  it("replaces an earlier token and user name", async () => {
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    await setPluginStoreCredential("s2", { token: TOKEN });
    // No user name this time: the old one must not stay.
    expect(mockStoreUpdate.mock.calls[0]?.[0].data.credentialUser).toBeNull();
  });

  it("seals the same token differently each time", async () => {
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    await setPluginStoreCredential("s2", { token: TOKEN });
    await setPluginStoreCredential("s2", { token: TOKEN });
    const [first, second] = mockStoreUpdate.mock.calls.map(
      (c) => c[0].data.credential,
    );
    expect(first).not.toBe(second);
  });

  it("does nothing for an unknown store", async () => {
    const result = await setPluginStoreCredential("nope", { token: TOKEN });
    expect(result).toEqual({ error: "Unknown store." });
    expect(wrote()).toBe(false);
  });

  it.each([
    ["no token", { token: "" }],
    ["a token with a space", { token: "abc def" }],
    ["a user name with a colon", { token: TOKEN, username: "a:b" }],
  ])("stores nothing for %s", async (_name, input) => {
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    const result = await setPluginStoreCredential("s2", input);
    expect(result).toHaveProperty("error");
    expect(wrote()).toBe(false);
  });

  it("stores nothing, and does not leak the token, when there is no key", async () => {
    delete process.env.AUTH_SECRET;
    mockStoreFindUnique.mockResolvedValue(CUSTOM);
    const result = await setPluginStoreCredential("s2", { token: TOKEN });
    expect((result as { error: string }).error).toContain("SECRETS_KEY");
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(wrote()).toBe(false);
  });
});

describe("removing the access of a connected store", () => {
  it("clears the token and the user name, and records it", async () => {
    mockStoreFindUnique.mockResolvedValue({
      ...CUSTOM,
      credential: "v1.a.b.c",
    });
    const result = await clearPluginStoreCredential("s2");
    expect(result).toEqual({ ok: true });
    expect(mockStoreUpdate).toHaveBeenCalledWith({
      where: { id: "s2" },
      data: { credential: null, credentialUser: null, syncAttemptedAt: null },
    });
    expect(mockAuditCreate.mock.calls).toHaveLength(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.store.credentialCleared",
      targetId: "s2",
    });
    expect(everythingWritten()).not.toContain("v1.a.b.c");
  });

  it("is a no-op, without an audit entry, when there was no token", async () => {
    mockStoreFindUnique.mockResolvedValue({ ...CUSTOM, credential: null });
    expect(await clearPluginStoreCredential("s2")).toEqual({ ok: true });
    expect(wrote()).toBe(false);
  });

  it("does nothing for an unknown store", async () => {
    expect(await clearPluginStoreCredential("nope")).toEqual({
      error: "Unknown store.",
    });
    expect(wrote()).toBe(false);
  });
});

describe("who may set the access", () => {
  it("asks for plugin.manage in the platform context", async () => {
    mockStoreFindUnique.mockResolvedValue({
      ...CUSTOM,
      credential: "v1.a.b.c",
    });
    await setPluginStoreCredential("s2", { token: TOKEN });
    await clearPluginStoreCredential("s2");
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.manage", { scope: "platform" }],
      ["plugin.manage", { scope: "platform" }],
    ]);
  });

  it("does nothing at all when the permission is refused", async () => {
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(
      setPluginStoreCredential("s2", { token: TOKEN }),
    ).rejects.toThrow("not allowed");
    await expect(clearPluginStoreCredential("s2")).rejects.toThrow();
    await expect(
      addPluginStore({
        url: OWN,
        name: "Our plugins",
        trusted: true,
        token: TOKEN,
      }),
    ).rejects.toThrow();
    expect(wrote()).toBe(false);
    expect(mockStoreFindUnique).not.toHaveBeenCalled();
  });
});

describe("what the page gets to see", () => {
  it("says whether a token is stored, and never gives the sealed value", async () => {
    mockStoreFindMany.mockResolvedValue([
      {
        id: "s1",
        name: "Barynt (official)",
        url: "https://github.com/Jafoson/barynt-plugin-store",
        official: true,
        enabled: true,
        credential: null,
        credentialUser: null,
      },
      {
        id: "s2",
        name: "Our plugins",
        url: OWN,
        official: false,
        enabled: true,
        credential: "v1.SEALED.VALUE.HERE",
        credentialUser: "deploy-bot",
      },
    ]);
    const rows = await getPluginStores();
    expect(rows.map((r) => [r.id, r.hasCredential, r.credentialUser])).toEqual([
      ["s1", false, null],
      ["s2", true, "deploy-bot"],
    ]);
    for (const row of rows) expect(row).not.toHaveProperty("credential");
    expect(JSON.stringify(rows)).not.toContain("SEALED");
  });

  it("gives exactly the fields the page uses", async () => {
    mockStoreFindMany.mockResolvedValue([
      {
        id: "s2",
        name: "Our plugins",
        url: OWN,
        official: false,
        enabled: true,
        credential: "v1.a.b.c",
        credentialUser: null,
        // A column added later must not reach the client by accident.
        somethingElse: "surprise",
      },
    ]);
    const [row] = await getPluginStores();
    expect(Object.keys(row).sort()).toEqual([
      "credentialUser",
      "enabled",
      "hasCredential",
      "id",
      "name",
      "official",
      "url",
    ]);
  });
});
