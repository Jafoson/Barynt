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
const storeFindUnique = mock();
const auditCreate = mock();
const revalidate = mock();

mock.module("@/lib/db", () => ({
  db: {
    plugin: {
      findUnique: pluginFindUnique,
      findMany: pluginFindMany,
      create: pluginCreate,
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

import { installFromStore } from "@/features/plugins/storeInstall";
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
  } = {},
) {
  const text = manifestText(more.manifest);
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
          version: "1.0.0",
          download: DOWNLOAD,
          sha512: more.pinned ?? sha512(served),
        },
      ],
    }),
  );
}

const install = (
  more: { pluginId?: string; version?: string; storeId?: string } = {},
) =>
  installFromStore({
    actorId: "admin1",
    storeId: more.storeId ?? "store-1",
    pluginId: more.pluginId ?? "notes",
    version: more.version ?? "1.0.0",
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
