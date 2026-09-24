import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Installing a plugin from a store. What matters: the store, the entry and the release are the
// store's and never the client's word, everything that needs no download is checked before one
// (and a request that cannot succeed asks nobody for anything), what is installed is exactly what
// the store pinned and listed, it arrives whole or not at all, a plugin that is there is never
// overwritten, and the row says where it came from. The store's clone and the plugin directory are
// real, the database is not, and the download is a replaced `fetch`.

const pluginFindUnique = mock();
const pluginFindMany = mock();
const pluginCreate = mock();
const pluginUpdateMany = mock();
const storeFindUnique = mock();
const auditCreate = mock();
const revalidate = mock();

mock.module("@/lib/db", () => ({
  db: {
    plugin: {
      findUnique: pluginFindUnique,
      findMany: pluginFindMany,
      create: pluginCreate,
      updateMany: pluginUpdateMany,
    },
    pluginStore: { findUnique: storeFindUnique },
    auditLog: { create: auditCreate },
    user: { findUnique: mock(async () => null) },
  },
}));
mock.module("next/cache", () => ({ revalidatePath: revalidate }));
mock.module("react", () => ({ cache: <T>(fn: T) => fn }));
mock.module("node:dns/promises", () => ({
  lookup: async () => [{ address: "140.82.112.3", family: 4 }],
}));

import {
  installFromStore,
  updateFromStore,
} from "@/features/plugins/storeInstall";
import { hashPluginDirectory } from "@/lib/plugins/integrity";
import { getRegistryState } from "@/lib/plugins/registryState";
import { storeCloneDir } from "@/lib/plugins/store/paths";
import { manifestOf } from "../store-support/storeArchive";
import { entry, tgz } from "../store-support/tarBuilder";

const KEY = "github.com/acme/plugins";
const URL_OF_STORE = "https://github.com/acme/plugins";
const DOWNLOAD =
  "https://github.com/acme/notes/releases/download/v1.0.0/notes-1.0.0.tgz";
const sha512 = (data: Buffer) =>
  createHash("sha512").update(data).digest("hex");

let root: string;
let served: Buffer;
let status = 200;
const requests: { url: string; headers: Record<string, string> }[] = [];
const fetchSpy = spyOn(globalThis, "fetch");

const manifestText = (more: Record<string, unknown> = {}) =>
  JSON.stringify({ ...JSON.parse(manifestOf("notes")), ...more });
const releaseOf = (text: string, files: Record<string, string> = {}) =>
  tgz(
    entry({ name: "barynt-plugin.json", data: text }),
    entry({ name: "dist/index.js", data: "export default {}" }),
    ...Object.entries(files).map(([name, data]) => entry({ name, data })),
  );

/** A clone of the store with `notes` in it, its release, and the hash pinned for that release. */
async function clone(
  more: {
    manifest?: Record<string, unknown>;
    release?: Buffer;
    versions?: object[];
    pinned?: string;
    plugins?: string[];
    storeJson?: string;
    /** The version the store describes (its manifest's), 1.0.0 unless said. */
    version?: string;
  } = {},
) {
  const version = more.version ?? "1.0.0";
  const text = manifestText({ version, ...more.manifest });
  served = more.release ?? releaseOf(text);
  const dir = storeCloneDir(root, KEY);
  await mkdir(join(dir, "plugins", "notes"), { recursive: true });
  await writeFile(
    join(dir, "store.json"),
    more.storeJson ??
      JSON.stringify({ schemaVersion: 1, id: "acme", name: "Acme" }),
  );
  await writeFile(join(dir, "plugins", "notes", "barynt-plugin.json"), text);
  await writeFile(
    join(dir, "plugins", "notes", "source.json"),
    JSON.stringify({
      versions: more.versions ?? [
        {
          version,
          download: DOWNLOAD,
          sha512: more.pinned ?? sha512(served),
        },
      ],
    }),
  );
}

const install = (
  more: {
    pluginId?: string;
    version?: string;
    storeId?: string;
    only?: "WORKSPACE" | "PROJECT";
    workspaceId?: string;
  } = {},
) =>
  installFromStore({
    actorId: "admin1",
    storeId: more.storeId ?? "store-1",
    pluginId: more.pluginId ?? "notes",
    version: more.version ?? "1.0.0",
    ...(more.only ? { only: more.only } : {}),
    ...(more.workspaceId ? { workspaceId: more.workspaceId } : {}),
  });
const at = (...parts: string[]) => join(root, ...parts);
const noWork = () => {
  expect(requests).toHaveLength(0);
  expect(pluginCreate).not.toHaveBeenCalled();
  expect(auditCreate).not.toHaveBeenCalled();
};
const nothingInstalled = async (rowTried = false) => {
  if (!rowTried) expect(pluginCreate).not.toHaveBeenCalled();
  expect(auditCreate).not.toHaveBeenCalled();
  const names = await readdir(root).catch(() => [] as string[]);
  expect(names.filter((n) => n !== ".stores" && n !== ".staging")).toEqual([]);
  const staging = await readdir(at(".staging")).catch(() => [] as string[]);
  expect(staging).toEqual([]);
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-storeinstall-"));
  process.env.BARYNT_PLUGINS_DIR = root;
  status = 200;
  requests.length = 0;
  for (const m of [
    pluginFindUnique,
    pluginFindMany,
    pluginCreate,
    pluginUpdateMany,
    storeFindUnique,
    auditCreate,
    revalidate,
  ]) {
    m.mockReset();
  }
  storeFindUnique.mockResolvedValue({
    key: KEY,
    url: URL_OF_STORE,
    name: "Acme",
    enabled: true,
  });
  pluginFindUnique.mockResolvedValue(null);
  pluginFindMany.mockResolvedValue([]);
  pluginCreate.mockResolvedValue({});
  pluginUpdateMany.mockResolvedValue({ count: 1 });
  auditCreate.mockResolvedValue({});
  fetchSpy.mockReset();
  fetchSpy.mockImplementation((async (url: string, init: RequestInit) => {
    requests.push({
      url,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    return new Response(new Uint8Array(served), { status });
  }) as never);
});
afterEach(async () => {
  delete process.env.BARYNT_PLUGINS_DIR;
  await rm(root, { recursive: true, force: true });
});

describe("a plugin that is installed", () => {
  it("is the files of the release, in the plugin directory, checked against the hash and the manifest", async () => {
    await clone();
    expect(await install()).toEqual({ ok: true });
    expect(
      await readFile(at("notes", "1.0.0", "dist", "index.js"), "utf8"),
    ).toBe("export default {}");
    expect(
      await readFile(at("notes", "1.0.0", "barynt-plugin.json"), "utf8"),
    ).toBe(manifestText());
    expect(requests.map((r) => r.url)).toEqual([DOWNLOAD]);
    expect(JSON.stringify(requests[0]?.headers).toLowerCase()).not.toContain(
      "authorization",
    );
  });

  it("is a row that says it came from the store, at the address that was entered, with the hash of its files", async () => {
    await clone();
    await install();
    const hashed = await hashPluginDirectory(at("notes", "1.0.0"));
    expect(pluginCreate).toHaveBeenCalledTimes(1);
    expect(pluginCreate.mock.calls[0]?.[0]).toEqual({
      data: {
        id: "notes",
        version: "1.0.0",
        status: "ENABLED",
        source: "STORE",
        scope: "WORKSPACE",
        origin: URL_OF_STORE,
        integrity: hashed.ok ? hashed.digest : "",
      },
    });
  });

  it("is on the platform when the manifest says so", async () => {
    await clone({ manifest: { scope: "platform" } });
    await install();
    expect(pluginCreate.mock.calls[0]?.[0].data.scope).toBe("PLATFORM");
  });

  it("is per project when the manifest says so", async () => {
    await clone({ manifest: { scope: "project" } });
    await install();
    expect(pluginCreate.mock.calls[0]?.[0].data.scope).toBe("PROJECT");
    expect(auditCreate.mock.calls[0]?.[0].data.meta.scope).toBe("PROJECT");
  });

  it("is audited, with who, which store, which version, the hash of the files and of the archive", async () => {
    await clone();
    await install();
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const data = auditCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      action: "plugin.installed",
      actorId: "admin1",
      targetType: "plugin",
      targetId: "notes",
      targetLabel: "notes@1.0.0",
    });
    expect(data.meta).toMatchObject({
      version: "1.0.0",
      source: "STORE",
      scope: "WORKSPACE",
      store: KEY,
      archive: sha512(served),
    });
    expect(String(data.meta.hash)).toMatch(/^sha512-/);
  });

  it("is told to the registry and to the pages", async () => {
    await clone();
    const before = getRegistryState().generation;
    await install();
    expect(getRegistryState().generation).toBe(before + 1);
    expect(revalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("asks the row, and not the client, where the store is: the store is looked up by its id", async () => {
    await clone();
    await install({ storeId: "store-42" });
    expect(storeFindUnique).toHaveBeenCalledWith({
      where: { id: "store-42" },
      select: { key: true, url: true, name: true, enabled: true },
    });
  });

  it("is installed when the plugin it needs is installed, and fits", async () => {
    await clone({ manifest: { dependencies: { base: "^1.0.0" } } });
    await mkdir(at("base", "1.2.0"), { recursive: true });
    await writeFile(
      at("base", "1.2.0", "barynt-plugin.json"),
      JSON.stringify({ ...JSON.parse(manifestOf("base", "1.2.0")) }),
    );
    pluginFindMany.mockResolvedValue([
      { id: "base", version: "1.2.0", scope: "WORKSPACE" },
    ]);
    expect(await install()).toEqual({ ok: true });
    pluginFindMany.mockResolvedValue([
      { id: "base", version: "2.0.0", scope: "WORKSPACE" },
    ]);
    await rm(at("notes"), { recursive: true });
    pluginCreate.mockClear();
    expect(await install()).toMatchObject({
      error: expect.stringContaining("needs"),
    });
  });

  it("takes an install of a plugin with code, which is not approved and runs nothing", async () => {
    await clone({ manifest: { server: "dist/server.js" } });
    expect(await install()).toEqual({ ok: true });
    expect(pluginCreate.mock.calls[0]?.[0].data).not.toHaveProperty(
      "codeApprovalHash",
    );
    expect(pluginCreate.mock.calls[0]?.[0].data.status).toBe("ENABLED");
  });
});

describe("an install for a workspace", () => {
  it("takes a plugin that applies per workspace, and says in the audit entry which workspace asked", async () => {
    await clone();
    expect(await install({ only: "WORKSPACE", workspaceId: "ws-7" })).toEqual({
      ok: true,
    });
    expect(auditCreate.mock.calls[0]?.[0].data.meta).toMatchObject({
      workspace: "ws-7",
      source: "STORE",
      scope: "WORKSPACE",
    });
    expect(auditCreate.mock.calls[0]?.[0].data.actorId).toBe("admin1");
  });

  it("does not take one that applies to the whole platform, which is not a workspace's to bring in, and downloads nothing", async () => {
    await clone({ manifest: { scope: "platform" } });
    expect(await install({ only: "WORKSPACE", workspaceId: "ws-7" })).toEqual({
      error:
        "notes applies to the whole platform, so only the platform installs it.",
    });
    noWork();
  });

  it("does not take one that applies per project either, for a workspace: that is added in a project", async () => {
    await clone({ manifest: { scope: "project" } });
    expect(await install({ only: "WORKSPACE", workspaceId: "ws-7" })).toEqual({
      error:
        "notes applies per project, not per workspace, so it is added in a project.",
    });
    noWork();
  });

  it("takes only what applies per project, for a project", async () => {
    await clone({ manifest: { scope: "project" } });
    expect(await install({ only: "PROJECT" })).toEqual({ ok: true });
    expect(pluginCreate.mock.calls[0]?.[0].data.scope).toBe("PROJECT");
  });

  it("does not take what applies per workspace or to the whole platform, for a project", async () => {
    await clone();
    expect(await install({ only: "PROJECT" })).toEqual({
      error:
        "notes applies per workspace, not per project, so it is added in a workspace.",
    });
    noWork();
    await clone({ manifest: { scope: "platform" } });
    expect(await install({ only: "PROJECT" })).toEqual({
      error:
        "notes applies to the whole platform, so only the platform installs it.",
    });
    noWork();
  });

  it("is the platform's install when nobody asks for a workspace: a platform plugin goes in, and the audit says no workspace", async () => {
    await clone({ manifest: { scope: "platform" } });
    expect(await install()).toEqual({ ok: true });
    expect(auditCreate.mock.calls[0]?.[0].data.meta).not.toHaveProperty(
      "workspace",
    );
  });
});

describe("what is refused before anything is downloaded", () => {
  it("is plugins that are off, a store that is not there, and one that is switched off", async () => {
    await clone();
    process.env.BARYNT_PLUGINS_DIR = "relative/dir";
    expect(await install()).toMatchObject({
      error: expect.stringContaining("absolute"),
    });
    process.env.BARYNT_PLUGINS_DIR = root;
    storeFindUnique.mockResolvedValue(null);
    expect(await install()).toEqual({ error: "There is no such store." });
    storeFindUnique.mockResolvedValue({
      key: KEY,
      url: URL_OF_STORE,
      name: "Acme",
      enabled: false,
    });
    expect(await install()).toEqual({ error: "The store is switched off." });
    noWork();
  });

  it("is a plugin that is installed already, from the store or not, with no advice that does not apply", async () => {
    await clone();
    pluginFindUnique.mockResolvedValue({ version: "0.9.0", source: "STORE" });
    expect(await install()).toEqual({
      error:
        "notes is installed already (0.9.0). Updating from a store is not available yet.",
    });
    pluginFindUnique.mockResolvedValue({
      version: "0.9.0",
      source: "DIRECTORY",
    });
    expect(await install()).toEqual({
      error:
        "notes is installed already (0.9.0), so it is not installed again.",
    });
    noWork();
  });

  it("looks for the plugin by the id it was given", async () => {
    await clone();
    await install();
    expect(pluginFindUnique).toHaveBeenCalledWith({
      where: { id: "notes" },
      select: { version: true, source: true },
    });
  });

  it("is a store that has not been fetched, or is not a store", async () => {
    expect(await install()).toEqual({
      error: "Acme cannot be read: The store has not been fetched yet.",
    });
    await clone({ storeJson: "{}" });
    expect(await install()).toMatchObject({
      error: expect.stringContaining("Acme cannot be read"),
    });
    noWork();
  });

  it("is a plugin the store does not list, and a version it does not list", async () => {
    await clone();
    expect(await install({ pluginId: "wiki" })).toEqual({
      error: "Acme does not list wiki.",
    });
    expect(await install({ version: "1.0.1" })).toEqual({
      error: "Acme does not list notes 1.0.1.",
    });
    noWork();
  });

  it("is a version the store withdrew, with its reason when there is one", async () => {
    await clone({
      versions: [
        {
          version: "1.0.0",
          download: DOWNLOAD,
          sha512: "a".repeat(128),
          revoked: "stole data",
        },
      ],
    });
    expect(await install()).toEqual({
      error:
        "notes 1.0.0 was withdrawn by the store: stole data, so it is not installed.",
    });
    await clone({
      versions: [
        {
          version: "1.0.0",
          download: DOWNLOAD,
          sha512: "a".repeat(128),
          revoked: true,
        },
      ],
    });
    expect(await install()).toEqual({
      error: "notes 1.0.0 was withdrawn by the store, so it is not installed.",
    });
    noWork();
  });

  it("is a version the store lists but does not describe, which is the one its manifest is for", async () => {
    await clone({
      versions: [
        { version: "1.0.0", download: DOWNLOAD, sha512: "a".repeat(128) },
        { version: "0.9.0", download: DOWNLOAD, sha512: "b".repeat(128) },
      ],
    });
    expect(await install({ version: "0.9.0" })).toEqual({
      error: "Only 1.0.0, the version Acme describes, can be installed.",
    });
    noWork();
  });

  it("is a plugin for another Barynt, and one that needs a plugin that is not installed", async () => {
    await clone({ manifest: { barynt: "^9.0.0" } });
    expect(await install()).toMatchObject({
      error: expect.stringContaining("works with Barynt ^9.0.0"),
    });
    await clone({ manifest: { dependencies: { base: "^1.0.0" } } });
    expect(await install()).toMatchObject({
      error: expect.stringContaining(
        "needs the plugin base (^1.0.0), which is not installed",
      ),
    });
    noWork();
  });
});

describe("a release that is not what the store says", () => {
  it("is not installed when the download fails, and leaves nothing", async () => {
    await clone();
    status = 404;
    expect(await install()).toEqual({ error: "The server answered 404." });
    await nothingInstalled();
  });

  it("is not installed when it is not the release the store pinned", async () => {
    await clone({ pinned: "f".repeat(128) });
    const result = await install();
    expect(result).toMatchObject({
      error: expect.stringContaining(
        "does not match the hash the store pinned",
      ),
    });
    await nothingInstalled();
  });

  it("is not installed when its manifest is not the one the store lists", async () => {
    await clone({
      release: releaseOf(manifestText({ capabilities: ["issues:write"] })),
    });
    const result = await install();
    expect(result).toMatchObject({
      error: expect.stringContaining("not the one the store lists"),
    });
    await nothingInstalled();
  });

  it("is not installed when the archive holds a link, and nothing of it is written", async () => {
    const text = manifestText();
    await clone({
      release: tgz(
        entry({ name: "barynt-plugin.json", data: text }),
        entry({ name: "link", flag: "2", linkname: "/etc/passwd" }),
      ),
    });
    expect(await install()).toMatchObject({
      error: expect.stringContaining("link"),
    });
    await nothingInstalled();
  });
});

describe("what is in the plugin directory already", () => {
  it("is left alone when it is the same release, and the plugin is installed from it", async () => {
    await clone();
    await install();
    pluginCreate.mockClear();
    auditCreate.mockClear();
    const before = await readFile(
      at("notes", "1.0.0", "dist", "index.js"),
      "utf8",
    );
    expect(await install()).toEqual({ ok: true });
    expect(
      await readFile(at("notes", "1.0.0", "dist", "index.js"), "utf8"),
    ).toBe(before);
    expect(pluginCreate).toHaveBeenCalledTimes(1);
  });

  it("is never overwritten when it is another copy, and nothing is recorded", async () => {
    await clone();
    await mkdir(at("notes", "1.0.0"), { recursive: true });
    await writeFile(
      at("notes", "1.0.0", "barynt-plugin.json"),
      "somebody else's",
    );
    const result = await install();
    expect(result).toMatchObject({
      error: expect.stringContaining("A different copy of notes 1.0.0"),
    });
    expect(
      await readFile(at("notes", "1.0.0", "barynt-plugin.json"), "utf8"),
    ).toBe("somebody else's");
    expect(pluginCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

describe("when the row cannot be made", () => {
  it("takes away what this call put in place, when another admin installed it at the same moment", async () => {
    await clone();
    pluginCreate.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    expect(await install()).toEqual({ error: "notes is installed already." });
    await nothingInstalled(true);
  });

  it("does not take away what was there before, when the same files were", async () => {
    await clone();
    await install();
    pluginCreate.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    expect(await install()).toEqual({ error: "notes is installed already." });
    expect(
      await readFile(at("notes", "1.0.0", "dist", "index.js"), "utf8"),
    ).toBe("export default {}");
  });

  it("leaves the plugin's other versions where they are when it takes its own away", async () => {
    await clone();
    await mkdir(at("notes", "0.9.0"), { recursive: true });
    await writeFile(at("notes", "0.9.0", "barynt-plugin.json"), "older");
    pluginCreate.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    await install();
    expect(await readdir(at("notes"))).toEqual(["0.9.0"]);
    expect(
      await readFile(at("notes", "0.9.0", "barynt-plugin.json"), "utf8"),
    ).toBe("older");
  });

  it("takes it away and passes the error on when it is another one", async () => {
    await clone();
    pluginCreate.mockRejectedValue(new Error("database is down"));
    await expect(install()).rejects.toThrow("database is down");
    await nothingInstalled(true);
  });
});

describe("updating from the store the plugin came from", () => {
  /** notes 1.0.0 is installed from the store, its files are on disk; the store now describes 1.1.0. */
  async function installedThenListed(
    more: Parameters<typeof clone>[0] = {},
    row: Record<string, unknown> = {},
    first: Parameters<typeof clone>[0] = {},
  ) {
    await clone(first);
    await install();
    const hash = pluginCreate.mock.calls[0]?.[0].data.integrity as string;
    pluginCreate.mockClear();
    auditCreate.mockClear();
    requests.length = 0;
    const current = {
      version: "1.0.0",
      source: "STORE",
      origin: URL_OF_STORE,
      scope: "WORKSPACE",
      integrity: hash,
      codeApprovalHash: null,
      ...row,
    };
    pluginFindUnique.mockResolvedValue(current);
    pluginFindMany.mockResolvedValue([
      { id: "notes", version: "1.0.0", scope: "WORKSPACE" },
    ]);
    storeFindUnique.mockResolvedValue({
      key: KEY,
      url: URL_OF_STORE,
      name: "Acme",
      enabled: true,
    });
    await clone({ version: "1.1.0", ...more });
    return { hash, current };
  }
  const update = (version = "1.1.0", pluginId = "notes") =>
    updateFromStore({ actorId: "admin1", pluginId, version });

  it("puts the new version next to the old one, and the row at the new one with the old one as the way back", async () => {
    const { hash } = await installedThenListed();
    expect(await update()).toEqual({ ok: true });
    expect(
      await readFile(at("notes", "1.1.0", "barynt-plugin.json"), "utf8"),
    ).toBe(manifestText({ version: "1.1.0" }));
    // What is replaced is not touched.
    expect(
      await readFile(at("notes", "1.0.0", "barynt-plugin.json"), "utf8"),
    ).toBe(manifestText());
    const newHash = await hashPluginDirectory(at("notes", "1.1.0"));
    expect(pluginUpdateMany.mock.calls).toEqual([
      [
        {
          where: { id: "notes", version: "1.0.0", integrity: hash },
          data: {
            version: "1.1.0",
            integrity: newHash.ok ? newHash.digest : "",
            previousVersion: "1.0.0",
            previousIntegrity: hash,
            codeApprovalHash: null,
            codeApprovedAt: null,
          },
        },
      ],
    ]);
    expect(pluginCreate).not.toHaveBeenCalled();
  });

  it("asks the store the plugin came from, found by where the row says it came from, and no other", async () => {
    await installedThenListed(
      {},
      { origin: "https://GitHub.com/Acme/Plugins.git" },
    );
    await update();
    expect(storeFindUnique.mock.calls.at(-1)).toEqual([
      {
        where: { key: KEY },
        select: { key: true, url: true, name: true, enabled: true },
      },
    ]);
    expect(requests.map((r) => r.url)).toEqual([DOWNLOAD]);
  });

  it("is audited with from and to, the store, both hashes and what is asked for that was not", async () => {
    await installedThenListed({
      manifest: { capabilities: ["issues:read", "issues:write"] },
    });
    await update();
    const data = auditCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      action: "plugin.updated",
      actorId: "admin1",
      targetId: "notes",
      targetLabel: "notes@1.1.0",
    });
    expect(data.meta).toMatchObject({
      from: "1.0.0",
      to: "1.1.0",
      source: "STORE",
      store: KEY,
      approvalWithdrawn: false,
      archive: sha512(served),
      addedCapabilities: ["issues:read", "issues:write"],
    });
    expect(String(data.meta.hash)).toMatch(/^sha512-/);
  });

  it("says nothing of capabilities when it asks for nothing more", async () => {
    await installedThenListed();
    await update();
    expect(auditCreate.mock.calls[0]?.[0].data.meta).not.toHaveProperty(
      "addedCapabilities",
    );
  });

  it("names only what is new: what the old version asked for already is not", async () => {
    await installedThenListed(
      { manifest: { capabilities: ["issues:read", "issues:write"] } },
      {},
      { manifest: { capabilities: ["issues:read"] } },
    );
    await update();
    expect(auditCreate.mock.calls[0]?.[0].data.meta.addedCapabilities).toEqual([
      "issues:write",
    ]);
  });

  it("names all of them when the old files cannot be read, since nothing is known of what they asked for", async () => {
    await installedThenListed(
      { manifest: { capabilities: ["issues:read"] } },
      {},
      { manifest: { capabilities: ["issues:read"] } },
    );
    await writeFile(at("notes", "1.0.0", "barynt-plugin.json"), "not json");
    await update();
    expect(auditCreate.mock.calls[0]?.[0].data.meta.addedCapabilities).toEqual([
      "issues:read",
    ]);
  });

  it("compares with the version that is installed, not with another one that lies there", async () => {
    await installedThenListed(
      { manifest: { capabilities: ["issues:read", "issues:write"] } },
      {},
      { manifest: { capabilities: ["issues:read"] } },
    );
    await mkdir(at("notes", "0.9.0"), { recursive: true });
    await writeFile(
      at("notes", "0.9.0", "barynt-plugin.json"),
      manifestText({ version: "0.9.0", capabilities: [] }),
    );
    await update();
    expect(auditCreate.mock.calls[0]?.[0].data.meta.addedCapabilities).toEqual([
      "issues:write",
    ]);
  });

  it("reads the plugin by its id, and only the columns it needs", async () => {
    await installedThenListed();
    pluginFindUnique.mockClear();
    await update();
    expect(pluginFindUnique.mock.calls).toEqual([
      [
        {
          where: { id: "notes" },
          select: {
            version: true,
            source: true,
            origin: true,
            scope: true,
            integrity: true,
            codeApprovalHash: true,
          },
        },
      ],
    ]);
  });

  it("is refused for a plugin of the whole platform that would need one that is per workspace", async () => {
    await installedThenListed(
      { manifest: { scope: "platform", dependencies: { base: "^1.0.0" } } },
      { scope: "PLATFORM" },
      { manifest: { scope: "platform" } },
    );
    await mkdir(at("base", "1.0.0"), { recursive: true });
    await writeFile(
      at("base", "1.0.0", "barynt-plugin.json"),
      manifestOf("base"),
    );
    pluginFindMany.mockResolvedValue([
      { id: "notes", version: "1.0.0", scope: "PLATFORM" },
      { id: "base", version: "1.0.0", scope: "WORKSPACE" },
    ]);
    expect(await update()).toMatchObject({
      error: expect.stringContaining(
        "applies to the whole platform but needs base",
      ),
    });
    expect(requests).toHaveLength(0);
    expect(pluginUpdateMany).not.toHaveBeenCalled();
  });

  it("is refused when another copy of the new version lies in the plugin directory, which is never written over", async () => {
    await installedThenListed();
    await mkdir(at("notes", "1.1.0"), { recursive: true });
    await writeFile(
      at("notes", "1.1.0", "barynt-plugin.json"),
      "somebody else's",
    );
    expect(await update()).toMatchObject({
      error: expect.stringContaining("A different copy of notes 1.1.0"),
    });
    expect(pluginUpdateMany).not.toHaveBeenCalled();
    expect(
      await readFile(at("notes", "1.1.0", "barynt-plugin.json"), "utf8"),
    ).toBe("somebody else's");
  });

  it("withdraws the approval of the old files, which is for the old files, and says so", async () => {
    await installedThenListed({}, { codeApprovalHash: "approved-hash" });
    await update();
    expect(
      pluginUpdateMany.mock.calls[0]?.[0].data.codeApprovalHash,
    ).toBeNull();
    expect(auditCreate.mock.calls[0]?.[0].data.meta.approvalWithdrawn).toBe(
      true,
    );
  });

  it("is told to the registry and the pages", async () => {
    await installedThenListed();
    const before = getRegistryState().generation;
    await update();
    expect(getRegistryState().generation).toBe(before + 1);
    expect(revalidate).toHaveBeenCalledWith("/", "layout");
  });

  describe("what is refused before anything is downloaded", () => {
    const refused = async (message: string | RegExp, version = "1.1.0") => {
      const result = await update(version);
      expect(result).toMatchObject({ error: expect.stringMatching(message) });
      expect(requests).toHaveLength(0);
      expect(pluginUpdateMany).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
      expect(await readdir(at("notes"))).toEqual(["1.0.0"]);
    };

    it("is plugins that are off", async () => {
      await installedThenListed();
      process.env.BARYNT_PLUGINS_DIR = "relative/dir";
      await refused(/absolute/);
    });

    it("is a plugin that is not installed", async () => {
      await installedThenListed();
      pluginFindUnique.mockResolvedValue(null);
      await refused(/^Unknown plugin\.$/);
    });

    it.each(["DIRECTORY", "UPLOAD"])(
      "is a plugin that came from %s: it is updated where it came from",
      async (source) => {
        await installedThenListed({}, { source, origin: null });
        await refused(/did not come from a store/);
      },
    );

    it.each(["1.0.0", "0.9.0"])(
      "is version %s, which is not newer than the installed 1.0.0",
      async (version) => {
        await installedThenListed();
        await refused(/newer version than the installed 1\.0\.0/, version);
      },
    );

    it("is a plugin whose store is not connected any more: another store that lists the same id is not a way out", async () => {
      await installedThenListed();
      storeFindUnique.mockResolvedValue(null);
      await refused(
        /not connected any more, so it is not updated from another store/,
      );
    });

    it.each([
      ["no origin", null],
      ["an origin that is no store address", "not a url"],
      [
        "an origin with a port, which is no store's",
        "https://github.com:8443/acme/plugins",
      ],
    ])(
      "is a plugin that has %s: nothing says which store to ask",
      async (_n, origin) => {
        await installedThenListed({}, { origin });
        storeFindUnique.mockClear();
        await refused(/not connected any more/);
        expect(storeFindUnique).not.toHaveBeenCalled();
      },
    );

    it("is a store that is switched off", async () => {
      await installedThenListed();
      storeFindUnique.mockResolvedValue({
        key: KEY,
        url: URL_OF_STORE,
        name: "Acme",
        enabled: false,
      });
      await refused(/^The store is switched off\.$/);
    });

    it("is a store that cannot be read", async () => {
      await installedThenListed();
      await rm(storeCloneDir(root, KEY), { recursive: true });
      await refused(/Acme cannot be read/);
    });

    it("is a plugin the store does not list any more, and a version it does not list", async () => {
      await installedThenListed();
      await rm(join(storeCloneDir(root, KEY), "plugins", "notes"), {
        recursive: true,
      });
      await refused(/does not list notes any more/);
      await installedThenListed({ version: "1.1.0" });
      await refused(/does not list notes 1\.2\.0/, "1.2.0");
    });

    it("is not another plugin the store lists in its place", async () => {
      await installedThenListed();
      const dir = storeCloneDir(root, KEY);
      await rm(join(dir, "plugins", "notes"), { recursive: true });
      await mkdir(join(dir, "plugins", "alpha"), { recursive: true });
      await writeFile(
        join(dir, "plugins", "alpha", "barynt-plugin.json"),
        JSON.stringify({
          ...JSON.parse(manifestOf("alpha")),
          version: "1.1.0",
        }),
      );
      await writeFile(
        join(dir, "plugins", "alpha", "source.json"),
        JSON.stringify({
          versions: [
            { version: "1.1.0", download: DOWNLOAD, sha512: sha512(served) },
          ],
        }),
      );
      await refused(/does not list notes any more/);
    });

    it("is a version the store withdrew, with its reason when there is one", async () => {
      await installedThenListed({
        versions: [
          {
            version: "1.1.0",
            download: DOWNLOAD,
            sha512: "a".repeat(128),
            revoked: "stole data",
          },
        ],
      });
      await refused(/withdrawn by the store: stole data/);
    });

    it("is a version the store lists and does not describe", async () => {
      await installedThenListed({
        version: "1.2.0",
        versions: [
          { version: "1.2.0", download: DOWNLOAD, sha512: "a".repeat(128) },
          { version: "1.1.0", download: DOWNLOAD, sha512: "b".repeat(128) },
        ],
      });
      await refused(/Only 1\.2\.0, the version Acme describes/);
    });

    it("is a plugin that would apply somewhere else than the installed one", async () => {
      await installedThenListed({ manifest: { scope: "platform" } });
      await refused(/cannot change where the plugin applies/);
      await installedThenListed({ manifest: { scope: "project" } });
      await refused(/cannot change where the plugin applies/);
    });

    it("is a version for another Barynt, and one that needs a plugin that is not installed", async () => {
      await installedThenListed({ manifest: { barynt: "^9.0.0" } });
      await refused(/works with Barynt \^9\.0\.0/);
      await installedThenListed({
        manifest: { dependencies: { base: "^1.0.0" } },
      });
      await refused(/needs the plugin base/);
    });
  });

  describe("a release that is not what the store says", () => {
    const nothingChanged = async () => {
      expect(pluginUpdateMany).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
      expect(await readdir(at("notes"))).toEqual(["1.0.0"]);
      expect(await readdir(at(".staging")).catch(() => [])).toEqual([]);
    };

    it("is not installed when the download fails", async () => {
      await installedThenListed();
      status = 404;
      expect(await update()).toEqual({ error: "The server answered 404." });
      await nothingChanged();
    });

    it("is not installed when it is not the release the store pinned", async () => {
      await installedThenListed({ pinned: "f".repeat(128) });
      expect(await update()).toMatchObject({
        error: expect.stringContaining("does not match the hash"),
      });
      await nothingChanged();
    });

    it("is not installed when its manifest is not the one the store lists", async () => {
      await installedThenListed({
        release: releaseOf(
          manifestText({ version: "1.1.0", capabilities: ["issues:write"] }),
        ),
      });
      expect(await update()).toMatchObject({
        error: expect.stringContaining("not the one the store lists"),
      });
      await nothingChanged();
    });
  });

  describe("when the row cannot be updated", () => {
    it("takes away what this call put in place, and leaves the old version, when another change got there first", async () => {
      await installedThenListed();
      pluginUpdateMany.mockResolvedValue({ count: 0 });
      expect(await update()).toEqual({
        error: "The plugin changed while it was being updated.",
      });
      expect(await readdir(at("notes"))).toEqual(["1.0.0"]);
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it("does not take away files that were there before, when the same ones were", async () => {
      await installedThenListed();
      await update();
      pluginUpdateMany.mockClear();
      pluginUpdateMany.mockResolvedValue({ count: 0 });
      auditCreate.mockClear();
      expect(await update()).toEqual({
        error: "The plugin changed while it was being updated.",
      });
      expect((await readdir(at("notes"))).sort()).toEqual(["1.0.0", "1.1.0"]);
    });

    it("does not take away files that were there before when the database fails", async () => {
      await installedThenListed();
      await update();
      pluginUpdateMany.mockRejectedValue(new Error("database is down"));
      await expect(update()).rejects.toThrow("database is down");
      expect((await readdir(at("notes"))).sort()).toEqual(["1.0.0", "1.1.0"]);
    });

    it("takes them away and passes the error on when the database fails", async () => {
      await installedThenListed();
      pluginUpdateMany.mockRejectedValue(new Error("database is down"));
      await expect(update()).rejects.toThrow("database is down");
      expect(await readdir(at("notes"))).toEqual(["1.0.0"]);
    });
  });
});
