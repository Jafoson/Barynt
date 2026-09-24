import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Letting a plugin's code run in the app's process is the one step that gives it
// the power of the whole app, so it is approved explicitly, for one plugin and its
// exact files. What matters: only `plugin.manage`, only with a real yes that the
// server checks itself, only the hash the admin was shown, only what is really on
// disk, only what the policy would run anyway, and never for a store as a whole.
// The plugin directory is real, the database is not.

const mockPluginFindUnique = mock();
const mockPluginUpdateMany = mock();
const mockPluginUpdate = mock();
const mockStoreFindMany = mock();
const mockSettingsFindUnique = mock();
const mockAuditCreate = mock();
const mockRevalidate = mock();

mock.module("@/lib/db", () => ({
  db: {
    plugin: {
      findUnique: mockPluginFindUnique,
      updateMany: mockPluginUpdateMany,
      update: mockPluginUpdate,
    },
    pluginStore: { findMany: mockStoreFindMany },
    systemSettings: { findUnique: mockSettingsFindUnique },
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
  approvePluginCode,
  revokePluginCodeApproval,
} from "@/features/plugins/actions";
import { hashPluginDirectory } from "@/lib/plugins/integrity";
import { OFFICIAL_STORE_URL } from "@/lib/plugins/policy";
import { getRegistryState } from "@/lib/plugins/registryState";

const OTHER_HASH = `sha512-${"B".repeat(86)}==`;

let root: string;
let savedDir: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-approval-"));
  savedDir = process.env.BARYNT_PLUGINS_DIR;
  process.env.BARYNT_PLUGINS_DIR = root;
  for (const m of [
    mockPluginFindUnique,
    mockPluginUpdateMany,
    mockPluginUpdate,
    mockStoreFindMany,
    mockSettingsFindUnique,
    mockAuditCreate,
    mockRevalidate,
    mockRequirePermission,
  ]) {
    m.mockReset();
  }
  mockRequirePermission.mockResolvedValue("admin1");
  mockStoreFindMany.mockResolvedValue([{ url: OFFICIAL_STORE_URL }]);
  mockSettingsFindUnique.mockResolvedValue(null);
  mockPluginUpdateMany.mockResolvedValue({ count: 1 });
  mockPluginUpdate.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
  const state = getRegistryState();
  state.snapshot = FAKE;
  state.generation = 0;
});

afterEach(async () => {
  if (savedDir === undefined) delete process.env.BARYNT_PLUGINS_DIR;
  else process.env.BARYNT_PLUGINS_DIR = savedDir;
  await rm(root, { recursive: true, force: true });
});

const FAKE = {
  builtAt: 0,
  dir: "/plugins",
  problem: null,
  discoveryIssues: [],
  plugins: [],
  active: [],
};

interface Installed {
  id: string;
  version: string;
  hash: string;
}

/** Writes a plugin directory and mocks the row that says it is installed. */
async function install(
  more: {
    id?: string;
    manifest?: Record<string, unknown>;
    files?: Record<string, string>;
    row?: Record<string, unknown>;
    rawManifest?: string;
  } = {},
): Promise<Installed> {
  const id = more.id ?? "calendar";
  const version = "1.0.0";
  const dir = join(root, id, version);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "barynt-plugin.json"),
    more.rawManifest ??
      JSON.stringify({
        manifestVersion: 1,
        id,
        name: id,
        version,
        description: "A test plugin",
        author: "Someone",
        license: "MIT",
        categories: ["other"],
        barynt: "^0.1.0",
        server: "server.js",
        ...more.manifest,
      }),
  );
  for (const [name, text] of Object.entries(
    more.files ?? { "server.js": "export default {};" },
  )) {
    await writeFile(join(dir, name), text);
  }
  const hashed = await hashPluginDirectory(dir);
  if (!hashed.ok) throw new Error(hashed.issue);
  mockPluginFindUnique.mockResolvedValue({
    id,
    version,
    source: "STORE",
    origin: OFFICIAL_STORE_URL,
    integrity: hashed.digest,
    codeApprovalHash: null,
    ...more.row,
  });
  return { id, version, hash: hashed.digest };
}

const approve = (p: Installed, more: Record<string, unknown> = {}) =>
  approvePluginCode(p.id, { hash: p.hash, acknowledged: true, ...more } as {
    hash: string;
    acknowledged: boolean;
  });

/** Nothing was written, audited or told to the cache. */
function untouched(): boolean {
  return [
    mockPluginUpdateMany,
    mockPluginUpdate,
    mockAuditCreate,
    mockRevalidate,
  ].every((m) => m.mock.calls.length === 0);
}

const state = getRegistryState();

describe("who may approve", () => {
  it("asks for plugin.manage in the platform context, for each action", async () => {
    const p = await install();
    await approve(p);
    mockPluginFindUnique.mockResolvedValue({
      id: "calendar",
      version: "1.0.0",
      codeApprovalHash: p.hash,
    });
    await revokePluginCodeApproval("calendar");
    expect(mockRequirePermission.mock.calls).toEqual([
      ["plugin.manage", { scope: "platform" }],
      ["plugin.manage", { scope: "platform" }],
    ]);
  });

  it("does nothing at all when the permission is refused", async () => {
    const p = await install();
    mockRequirePermission.mockRejectedValue(new Error("not allowed"));
    await expect(approve(p)).rejects.toThrow("not allowed");
    await expect(revokePluginCodeApproval("calendar")).rejects.toThrow();
    expect(untouched()).toBe(true);
    expect(mockPluginFindUnique).not.toHaveBeenCalled();
    expect(state.snapshot).toBe(FAKE);
  });
});

describe("the yes", () => {
  it.each([
    ["nothing", undefined],
    ["false", false],
    ["the text true", "true"],
    ["1", 1],
    ["null", null],
    ["an object", {}],
  ])(
    "is refused with %s, and the plugin is not even looked up",
    async (_name, yes) => {
      const p = await install();
      const result = await approve(p, { acknowledged: yes });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("full power");
      expect(mockPluginFindUnique).not.toHaveBeenCalled();
      expect(untouched()).toBe(true);
    },
  );

  it("is also refused when there is no input at all", async () => {
    const result = await approvePluginCode("calendar", undefined as never);
    expect(result).toHaveProperty("error");
    expect(untouched()).toBe(true);
  });
});

describe("what is asked for", () => {
  it.each([
    ["a hash that is not a hash", "sha512-abc"],
    ["an empty hash", ""],
    ["a hash of another kind", `sha256-${"A".repeat(86)}==`],
    ["no text", 42],
    ["nothing", undefined],
  ])("is refused with %s", async (_name, hash) => {
    const result = await approvePluginCode("calendar", {
      hash: hash as string,
      acknowledged: true,
    });
    expect(result).toEqual({ error: "Invalid request." });
    expect(mockPluginFindUnique).not.toHaveBeenCalled();
  });

  it("is refused for an id that is not text", async () => {
    const result = await approvePluginCode(42 as unknown as string, {
      hash: OTHER_HASH,
      acknowledged: true,
    });
    expect(result).toEqual({ error: "Invalid request." });
  });

  it("is refused for a plugin that is not installed", async () => {
    mockPluginFindUnique.mockResolvedValue(null);
    const result = await approvePluginCode("nope", {
      hash: OTHER_HASH,
      acknowledged: true,
    });
    expect(result).toEqual({ error: "Unknown plugin." });
    expect(untouched()).toBe(true);
  });
});

describe("the hash the admin was shown", () => {
  it("is what is approved, and nothing else", async () => {
    const p = await install();
    expect(await approve(p)).toEqual({ ok: true });
    const call = mockPluginUpdateMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ id: "calendar", integrity: p.hash });
    expect(call.data.codeApprovalHash).toBe(p.hash);
    expect(call.data.codeApprovedAt).toBeInstanceOf(Date);
  });

  it("is refused when the plugin has changed since, and nothing is written", async () => {
    const p = await install();
    const result = await approve(p, { hash: OTHER_HASH });
    expect(result).toEqual({
      error:
        "The plugin has changed since you looked at it. Look at it again before approving.",
    });
    expect(untouched()).toBe(true);
  });

  it("is refused when an update replaced the plugin between the check and the write", async () => {
    const p = await install();
    mockPluginUpdateMany.mockResolvedValue({ count: 0 });
    const result = await approve(p);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("changed");
    // Nothing was approved, so nothing is audited and nothing is told to reload.
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(state.snapshot).toBe(FAKE);
  });

  it("replaces an older approval for another hash, that no longer fitted", async () => {
    const p = await install({ row: { codeApprovalHash: OTHER_HASH } });
    expect(await approve(p)).toEqual({ ok: true });
    expect(mockPluginUpdateMany.mock.calls[0]?.[0].data.codeApprovalHash).toBe(
      p.hash,
    );
  });

  it("does nothing, quietly, when this very hash is approved already", async () => {
    const p = await install();
    mockPluginFindUnique.mockResolvedValue({
      ...(await mockPluginFindUnique()),
      codeApprovalHash: p.hash,
    });
    expect(await approve(p)).toEqual({ ok: true });
    expect(untouched()).toBe(true);
  });
});

describe("what is on disk", () => {
  it("has to be what the hash says: a file changed after install is not approved", async () => {
    const p = await install();
    await writeFile(join(root, "calendar", "1.0.0", "server.js"), "evil()");
    const result = await approve(p);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("do not match");
    expect(untouched()).toBe(true);
  });

  it("has to be there: a plugin lost with its directory is not approved", async () => {
    const p = await install();
    await rm(join(root, "calendar"), { recursive: true });
    const result = await approve(p);
    expect(result).toHaveProperty("error");
    expect(untouched()).toBe(true);
  });

  it("has to be free of what does not belong: a symlink inside is not approved", async () => {
    const p = await install();
    const { symlink } = await import("node:fs/promises");
    await symlink("/etc/passwd", join(root, "calendar", "1.0.0", "link"));
    const result = await approve(p);
    expect(result).toHaveProperty("error");
    expect(untouched()).toBe(true);
  });

  it("is refused when its manifest cannot be read, even if the hash matches it", async () => {
    const p = await install({ rawManifest: "{ not json" });
    const result = await approve(p);
    expect(result).toEqual({
      error: "The plugin's manifest could not be read.",
    });
    expect(untouched()).toBe(true);
  });

  it("does not put the plugin directory into an error", async () => {
    const p = await install();
    await writeFile(join(root, "calendar", "1.0.0", "server.js"), "evil()");
    const result = (await approve(p)) as { error: string };
    expect(result.error).not.toContain(root);
    expect(result.error).not.toContain("/tmp");
  });

  it("is refused when there is no directory to read from", async () => {
    const p = await install();
    process.env.BARYNT_PLUGINS_DIR = "relative/dir";
    const result = await approve(p);
    expect(result).toEqual({
      error: "Plugins have no directory to read from.",
    });
    expect(untouched()).toBe(true);
  });

  it.each([
    ["an id that leaves the directory", "../../etc"],
    ["an id with a slash", "a/b"],
    ["an id that is too short", "a"],
  ])("does not build a path from %s", async (_name, id) => {
    const p = await install();
    mockPluginFindUnique.mockResolvedValue({
      ...(await mockPluginFindUnique()),
      id,
    });
    const result = await approvePluginCode(id, {
      hash: p.hash,
      acknowledged: true,
    });
    expect(result).toEqual({
      error: "The plugin's id or version is not valid.",
    });
    expect(untouched()).toBe(true);
  });

  it("does not build a path from a version that is not one", async () => {
    const p = await install();
    mockPluginFindUnique.mockResolvedValue({
      ...(await mockPluginFindUnique()),
      version: "../1.0.0",
    });
    const result = await approve(p);
    expect(result).toEqual({
      error: "The plugin's id or version is not valid.",
    });
  });
});

describe("only what the policy would run", () => {
  it("is refused for a plugin without code: there is nothing to approve", async () => {
    const p = await install({
      manifest: { server: undefined },
      files: {},
    });
    const result = await approve(p);
    expect(result).toEqual({
      error: "This plugin has no code, so there is nothing to approve.",
    });
    expect(untouched()).toBe(true);
  });

  it("is allowed for a plugin with only a client bundle: that is code too", async () => {
    const p = await install({
      manifest: { server: undefined, client: "client.js" },
      files: { "client.js": "export default {};" },
    });
    expect(await approve(p)).toEqual({ ok: true });
  });

  it("is refused for a plugin whose store is not switched on", async () => {
    const p = await install();
    mockStoreFindMany.mockResolvedValue([]);
    const result = await approve(p);
    expect((result as { error: string }).error).toContain("not switched on");
    expect(untouched()).toBe(true);
  });

  it("is refused for a plugin of another store than the ones that are on", async () => {
    const p = await install({ row: { origin: "https://example.com/other" } });
    const result = await approve(p);
    expect((result as { error: string }).error).toContain("not switched on");
  });

  it.each([
    ["not allowed", false],
    ["allowed", true],
  ])(
    "is refused for a plugin from no store, whether unsigned plugins are %s",
    async (_name, allow) => {
      const p = await install({ row: { source: "UPLOAD", origin: null } });
      mockSettingsFindUnique.mockResolvedValue({ allowUnsignedPlugins: allow });
      const result = await approve(p);
      expect((result as { error: string }).error).toContain("no store");
      expect(untouched()).toBe(true);
    },
  );

  it("fails closed when the stores cannot be read: no store is on, so nothing is approved", async () => {
    const p = await install();
    mockStoreFindMany.mockRejectedValue(new Error("connection lost"));
    const log = mock(() => {});
    const original = console.error;
    console.error = log;
    try {
      const result = await approve(p);
      expect((result as { error: string }).error).toContain("not switched on");
      expect(untouched()).toBe(true);
    } finally {
      console.error = original;
    }
  });
});

describe("approving", () => {
  it("audits who did it, for which plugin and which hash, without giving the hash away as a secret it is not", async () => {
    const p = await install();
    await approve(p);
    expect(mockAuditCreate.mock.calls).toHaveLength(1);
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.code.approved",
      actorId: "admin1",
      targetType: "plugin",
      targetId: "calendar",
      targetLabel: "calendar@1.0.0",
      meta: { version: "1.0.0", hash: p.hash },
    });
  });

  it("tells the registry to decide again, and the cache", async () => {
    const p = await install();
    await approve(p);
    expect(state.snapshot).toBeNull();
    expect(state.generation).toBe(1);
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  it("is per plugin: it writes to that one and no other", async () => {
    const p = await install();
    await approve(p);
    expect(mockPluginUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockPluginUpdateMany.mock.calls[0]?.[0].where.id).toBe("calendar");
  });
});

describe("withdrawing the approval", () => {
  const approved = (hash: string) => ({
    id: "calendar",
    version: "1.0.0",
    codeApprovalHash: hash,
  });

  it("clears the hash and the time, audits it and tells the registry", async () => {
    mockPluginFindUnique.mockResolvedValue(approved(OTHER_HASH));
    expect(await revokePluginCodeApproval("calendar")).toEqual({ ok: true });
    expect(mockPluginUpdate).toHaveBeenCalledWith({
      where: { id: "calendar" },
      data: { codeApprovalHash: null, codeApprovedAt: null },
    });
    expect(mockAuditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "plugin.code.revoked",
      actorId: "admin1",
      targetType: "plugin",
      targetId: "calendar",
      meta: { version: "1.0.0", hash: OTHER_HASH },
    });
    expect(state.snapshot).toBeNull();
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  it("does nothing, quietly, when there is no approval", async () => {
    mockPluginFindUnique.mockResolvedValue(approved(null as unknown as string));
    expect(await revokePluginCodeApproval("calendar")).toEqual({ ok: true });
    expect(untouched()).toBe(true);
    expect(state.snapshot).toBe(FAKE);
  });

  it("says so for a plugin that is not installed", async () => {
    mockPluginFindUnique.mockResolvedValue(null);
    expect(await revokePluginCodeApproval("nope")).toEqual({
      error: "Unknown plugin.",
    });
    expect(untouched()).toBe(true);
  });

  it("refuses an id that is not text", async () => {
    expect(await revokePluginCodeApproval(42 as unknown as string)).toEqual({
      error: "Invalid request.",
    });
    expect(mockPluginFindUnique).not.toHaveBeenCalled();
  });

  it("withdraws an approval that no longer fitted, too", async () => {
    mockPluginFindUnique.mockResolvedValue(approved(OTHER_HASH));
    expect(await revokePluginCodeApproval("calendar")).toEqual({ ok: true });
    expect(mockPluginUpdate).toHaveBeenCalledTimes(1);
  });
});
