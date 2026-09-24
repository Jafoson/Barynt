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
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { hashPluginDirectory } from "@/lib/plugins/integrity";
import type { PluginManifest } from "@/lib/plugins/manifest";
import { RELEASE_LIMITS } from "@/lib/plugins/store/release";
import { placeRelease, verifyRelease } from "@/lib/plugins/store/stageRelease";
import { parseManifest } from "@/lib/plugins/validate";
import { manifestOf } from "../store-support/storeArchive";
import { entry, tar, tgz } from "../store-support/tarBuilder";
import { zip } from "../store-support/zipBuilder";

// A release, from the entry in a store to a directory in the plugin directory. What matters: what
// is installed is exactly what the store pinned (by hash) and listed (by manifest), nothing is
// written before all that is checked, what is written arrives whole or not at all, and a plugin
// that is in the plugin directory already is never overwritten. The disk is real; the download is
// a replaced `fetch`.

const URL =
  "https://github.com/acme/notes/releases/download/v1.0.0/notes-1.0.0.tgz";
const PUBLIC = ["140.82.112.3"];

const sha512 = (data: Buffer) =>
  createHash("sha512").update(data).digest("hex");
const manifest = (more: Record<string, unknown> = {}): PluginManifest => {
  const parsed = parseManifest(
    JSON.stringify({ ...JSON.parse(manifestOf("notes")), ...more }),
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.manifest;
};
const MANIFEST_TEXT = JSON.stringify({ ...JSON.parse(manifestOf("notes")) });

const release = (extra: Buffer[] = [], manifestText = MANIFEST_TEXT) =>
  tgz(
    entry({ name: "barynt-plugin.json", data: manifestText }),
    entry({ name: "dist/", flag: "5" }),
    entry({ name: "dist/index.js", data: "export default {}" }),
    ...extra,
  );

const serving = (bytes: Buffer, headers: Record<string, string> = {}) => {
  const fetchMock = mock(
    async (_url: string, _init: RequestInit) =>
      new Response(new Uint8Array(bytes), { status: 200, headers }),
  );
  return { fetch: fetchMock, lookup: async () => PUBLIC };
};
const verify = (
  bytes: Buffer,
  more: {
    sha512?: string;
    expected?: PluginManifest;
    headers?: Record<string, string>;
  } = {},
) =>
  verifyRelease(
    {
      download: URL,
      sha512: more.sha512 ?? sha512(bytes),
      expected: more.expected ?? manifest(),
    },
    serving(bytes, more.headers),
  );
const error = async (...args: Parameters<typeof verify>) => {
  const result = await verify(...args);
  return result.ok ? null : { code: result.code, error: result.error };
};

describe("checking a release", () => {
  it("gives the files, the manifest and the hash it was checked against, for a .tgz", async () => {
    const bytes = release();
    const result = await verify(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.release.files.map((f) => f.path)).toEqual([
      "barynt-plugin.json",
      "dist/index.js",
    ]);
    expect(result.release.manifest).toEqual(manifest());
    expect(result.release.archiveSha512).toBe(sha512(bytes));
  });

  it("does the same for a .zip", async () => {
    const bytes = zip([
      { name: "barynt-plugin.json", data: MANIFEST_TEXT },
      { name: "dist/index.js", data: "export default {}" },
    ]);
    const result = await verify(bytes);
    expect(result.ok && result.release.files.map((f) => f.path)).toEqual([
      "barynt-plugin.json",
      "dist/index.js",
    ]);
  });

  it("gives the download two minutes", async () => {
    const timeout = spyOn(AbortSignal, "timeout");
    try {
      await verify(release());
      expect(timeout.mock.calls.map((c) => c[0])).toEqual([120_000]);
    } finally {
      timeout.mockRestore();
    }
  });

  it("asks for the address of the entry, and sends no credentials", async () => {
    const bytes = release();
    const deps = serving(bytes);
    await verifyRelease(
      { download: URL, sha512: sha512(bytes), expected: manifest() },
      deps,
    );
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = deps.fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(URL);
    expect(JSON.stringify(init.headers ?? {}).toLowerCase()).not.toContain(
      "authorization",
    );
  });

  it("takes a manifest whose keys are in another order", async () => {
    const reordered = JSON.stringify(
      Object.fromEntries(Object.entries(JSON.parse(MANIFEST_TEXT)).reverse()),
    );
    expect((await verify(release([], reordered))).ok).toBe(true);
  });

  it("is refused before anything is read when the download fails, in the download's words", async () => {
    const result = await verifyRelease(
      { download: URL, sha512: "a".repeat(128), expected: manifest() },
      {
        fetch: async () => new Response("gone", { status: 404 }),
        lookup: async () => PUBLIC,
      },
    );
    expect(result).toEqual({
      ok: false,
      code: "download",
      error: "The server answered 404.",
    });
  });

  it("is refused when it leads inside, or is not https", async () => {
    const inside = await verifyRelease(
      { download: URL, sha512: "a".repeat(128), expected: manifest() },
      {
        fetch: async () => new Response("x"),
        lookup: async () => ["10.0.0.9"],
      },
    );
    expect(inside).toMatchObject({ ok: false, code: "download" });
    const http = await verifyRelease(
      {
        download: "http://example.com/a.tgz",
        sha512: "a".repeat(128),
        expected: manifest(),
      },
      { fetch: async () => new Response("x"), lookup: async () => PUBLIC },
    );
    expect(http).toMatchObject({ ok: false, code: "download" });
  });

  it("is refused when it says it is larger than 50 MiB", async () => {
    const result = await error(release(), {
      headers: {
        "content-length": String(RELEASE_LIMITS.maxDownloadBytes + 1),
      },
    });
    expect(result).toMatchObject({
      code: "download",
      error: expect.stringContaining("larger than"),
    });
    expect(
      await error(release(), {
        headers: { "content-length": String(RELEASE_LIMITS.maxDownloadBytes) },
      }),
    ).toBeNull();
  });
});

describe("a release that is not what the store pinned", () => {
  it("is refused when one byte is different, and says it may have been changed", async () => {
    const bytes = release();
    const changed = Buffer.from(bytes);
    changed[changed.length - 20] ^= 1;
    const result = await verifyRelease(
      { download: URL, sha512: sha512(bytes), expected: manifest() },
      serving(changed),
    );
    expect(result).toMatchObject({ ok: false, code: "hash" });
    expect(result.ok === false && result.error).toContain(
      "changed after the store listed it",
    );
  });

  it("is refused for the right hash with something after it, or written in capitals, which the store does not write", async () => {
    const bytes = release();
    expect(await error(bytes, { sha512: `${sha512(bytes)}a` })).toMatchObject({
      code: "hash",
    });
    expect(await error(bytes, { sha512: `a${sha512(bytes)}` })).toMatchObject({
      code: "hash",
    });
    expect(
      await error(bytes, { sha512: sha512(bytes).toUpperCase() }),
    ).toMatchObject({ code: "hash" });
    expect(await error(bytes, { sha512: sha512(bytes) })).toBeNull();
  });

  it("is refused before it is read: a hostile archive with the wrong hash is a hash problem, not an archive problem", async () => {
    const hostile = tgz(entry({ name: "../evil", data: "x" }));
    expect(await error(hostile, { sha512: "b".repeat(128) })).toMatchObject({
      code: "hash",
    });
  });

  it.each([
    ["too short", "abc"],
    ["empty", ""],
    ["upper case", "A".repeat(128)],
    ["not hex", "z".repeat(128)],
    ["too long", "a".repeat(129)],
  ])(
    "is refused for a pinned hash that is %s, even one that would match if it were read",
    async (_n, hash) => {
      expect(await error(release(), { sha512: hash })).toMatchObject({
        code: "hash",
      });
    },
  );

  it("is not fooled by the hash of a different release", async () => {
    expect(
      await error(release(), {
        sha512: sha512(release([entry({ name: "x", data: "1" })])),
      }),
    ).toMatchObject({
      code: "hash",
    });
  });
});

describe("a release that is checked and is not a plugin", () => {
  it.each([
    ["is not an archive", Buffer.from("<html>Not found</html>"), "not a .tgz"],
    [
      "has a symlink",
      tgz(
        entry({ name: "barynt-plugin.json", data: MANIFEST_TEXT }),
        entry({ name: "l", flag: "2", linkname: "/etc/passwd" }),
      ),
      "link",
    ],
    [
      "has a name that leaves the directory",
      tgz(
        entry({ name: "barynt-plugin.json", data: MANIFEST_TEXT }),
        entry({ name: "../x", data: "1" }),
      ),
      "cannot be used",
    ],
    [
      "has no manifest at its root",
      tgz(entry({ name: "plugin/barynt-plugin.json", data: MANIFEST_TEXT })),
      "no barynt-plugin.json at its root",
    ],
    [
      "has a file twice",
      tgz(
        entry({ name: "barynt-plugin.json", data: MANIFEST_TEXT }),
        entry({ name: "a", data: "1" }),
        entry({ name: "a", data: "2" }),
      ),
      "twice",
    ],
    [
      "is a damaged gzip",
      gzipSync(tar(entry({ name: "a", data: "x", badChecksum: true }))),
      "damaged",
    ],
  ])("is refused as an archive when it %s", async (_n, bytes, words) => {
    const result = await error(bytes);
    expect(result).toMatchObject({ code: "archive" });
    expect(result?.error).toContain(words);
  });

  it("is refused for a zip with a symlink, which is what a zip slip or a link swap looks like", async () => {
    const bytes = zip([
      { name: "barynt-plugin.json", data: MANIFEST_TEXT },
      { name: "link", data: "/etc/passwd", unixMode: 0o120777 },
    ]);
    expect(await error(bytes)).toMatchObject({ code: "archive" });
  });
});

describe("the manifest in the release", () => {
  it("is refused when it is not JSON or is not a manifest", async () => {
    expect(await error(release([], "{ not json"))).toMatchObject({
      code: "manifest",
    });
    expect(await error(release([], "{}"))).toMatchObject({ code: "manifest" });
  });

  it("is refused when it is larger than 256 KiB, though it is a manifest, and not when it is exactly that", async () => {
    const padded = (size: number) =>
      MANIFEST_TEXT + " ".repeat(size - MANIFEST_TEXT.length);
    const large = await error(release([], padded(256 * 1024 + 1)));
    expect(large).toEqual({
      code: "manifest",
      error: "The release's barynt-plugin.json is larger than 256 KiB.",
    });
    expect(await error(release([], padded(256 * 1024)))).toBeNull();
  });

  it("says why it is not valid", async () => {
    const result = await error(
      release(
        [],
        JSON.stringify({ ...JSON.parse(MANIFEST_TEXT), id: "BAD ID" }),
      ),
    );
    expect(result?.error).toContain("is not valid");
  });

  it.each([
    ["the version", { version: "1.0.1" }],
    ["the id", { id: "other" }],
    ["the name", { name: "Something else" }],
    ["the description", { description: "Different" }],
    ["what it asks for", { capabilities: ["issues:read"] }],
    ["the range of Barynt versions", { barynt: "^9.0.0" }],
    ["where it applies", { scope: "platform" }],
    ["the keywords", { keywords: ["xx"] }],
  ])(
    "is refused when it differs from the store's in %s",
    async (_n, change) => {
      const text = JSON.stringify({ ...JSON.parse(MANIFEST_TEXT), ...change });
      const result = await error(release([], text));
      expect(result).toEqual({
        code: "manifest",
        error:
          "The barynt-plugin.json in the release is not the one the store lists for it, so it was not installed.",
      });
    },
  );

  it("is refused when the store lists more than the release has", async () => {
    const expected = manifest({ capabilities: ["issues:read"] });
    expect(await error(release(), { expected })).toMatchObject({
      code: "manifest",
    });
  });
});

describe("putting a release in place", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "barynt-place-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const files = (extra: Record<string, string> = {}) =>
    Object.entries({
      "barynt-plugin.json": MANIFEST_TEXT,
      "dist/index.js": "export default {}",
      ...extra,
    }).map(([path, text]) => ({ path, data: Buffer.from(text) }));
  const place = (
    list = files(),
    more: { id?: string; version?: string } = {},
  ) =>
    placeRelease({
      pluginsDir: root,
      id: more.id ?? "notes",
      version: more.version ?? "1.0.0",
      files: list,
    });
  const at = (...parts: string[]) => join(root, ...parts);
  const names = async (dir: string) => (await readdir(dir)).sort();

  it("writes the files to <plugins>/<id>/<version> and says the hash they have", async () => {
    const result = await place();
    expect(result).toMatchObject({
      ok: true,
      created: true,
      dir: at("notes", "1.0.0"),
    });
    expect(
      await readFile(at("notes", "1.0.0", "dist", "index.js"), "utf8"),
    ).toBe("export default {}");
    expect(
      await readFile(at("notes", "1.0.0", "barynt-plugin.json"), "utf8"),
    ).toBe(MANIFEST_TEXT);
    const hashed = await hashPluginDirectory(at("notes", "1.0.0"));
    expect(hashed.ok && result.ok && result.integrity).toBe(
      hashed.ok && hashed.digest,
    );
  });

  it("leaves nothing in the staging directory", async () => {
    await place();
    expect(await names(at(".staging"))).toEqual([]);
  });

  it("writes files that nobody can run and that only the owner can change", async () => {
    await place();
    const mode =
      (await stat(at("notes", "1.0.0", "dist", "index.js"))).mode & 0o777;
    expect(mode & 0o111).toBe(0);
    expect(mode & 0o022).toBe(0);
  });

  it("is a no-op when the same files are there already, and says so", async () => {
    const first = await place();
    const before = (await stat(at("notes", "1.0.0", "barynt-plugin.json")))
      .mtimeMs;
    const second = await place();
    expect(second).toMatchObject({ ok: true, created: false });
    expect(second.ok && first.ok && second.integrity).toBe(
      first.ok && first.integrity,
    );
    expect(
      (await stat(at("notes", "1.0.0", "barynt-plugin.json"))).mtimeMs,
    ).toBe(before);
    expect(await names(at(".staging"))).toEqual([]);
  });

  it("does not touch what is there when it is not the same: another copy of the version is refused", async () => {
    await mkdir(at("notes", "1.0.0"), { recursive: true });
    await writeFile(
      at("notes", "1.0.0", "barynt-plugin.json"),
      "somebody else's",
    );
    const result = await place();
    expect(result).toEqual({
      ok: false,
      error:
        "A different copy of notes 1.0.0 is already in the plugin directory. Remove it, or install another version.",
    });
    expect(
      await readFile(at("notes", "1.0.0", "barynt-plugin.json"), "utf8"),
    ).toBe("somebody else's");
    expect(await names(at(".staging"))).toEqual([]);
  });

  it("does not touch another version of the same plugin, which stays where it is", async () => {
    await place(files(), { version: "1.0.0" });
    await place(files(), { version: "1.1.0" });
    expect(await names(at("notes"))).toEqual(["1.0.0", "1.1.0"]);
  });

  it("refuses a file that a plugin directory would not accept, and writes nothing to where it goes", async () => {
    const many = Array.from(
      { length: RELEASE_LIMITS.maxFiles + 1 },
      (_, n) => ({
        path: `f${n}.js`,
        data: Buffer.from("x"),
      }),
    );
    const result = await place(many);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("not acceptable"),
    });
    await expect(lstat(at("notes"))).rejects.toThrow();
    expect(await names(at(".staging"))).toEqual([]);
  });

  it.each([
    ["an id that is a path", { id: "../x" }],
    ["an id with capitals", { id: "Notes" }],
    ["an empty id", { id: "" }],
    ["a version that is a path", { version: "../1.0.0" }],
    ["a version that is a range", { version: "^1.0.0" }],
    ["an empty version", { version: "" }],
  ])("refuses %s, before anything is written", async (_n, more) => {
    expect(await place(files(), more)).toEqual({
      ok: false,
      error: "Invalid plugin id or version.",
    });
    expect(await readdir(root)).toEqual([]);
  });

  it("does not write through a symlink where .staging should be", async () => {
    const elsewhere = at("..", `elsewhere-${Date.now()}`);
    await mkdir(elsewhere);
    try {
      await symlink(elsewhere, at(".staging"));
      const result = await place();
      expect(result).toEqual({
        ok: false,
        error: "The staging directory is not a directory.",
      });
      expect(await readdir(elsewhere)).toEqual([]);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("does not write through a symlink where the plugin's directory should be", async () => {
    const elsewhere = at("..", `elsewhere2-${Date.now()}`);
    await mkdir(elsewhere);
    try {
      await symlink(elsewhere, at("notes"));
      const result = await place();
      expect(result).toEqual({
        ok: false,
        error: "notes in the plugin directory is not a directory.",
      });
      expect(await readdir(elsewhere)).toEqual([]);
      expect(await names(at(".staging"))).toEqual([]);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("says so when the plugin directory cannot be written", async () => {
    await writeFile(at("file"), "x");
    const result = await placeRelease({
      pluginsDir: at("file"),
      id: "notes",
      version: "1.0.0",
      files: files(),
    });
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining(
        "could not be put in the plugin directory",
      ),
    });
  });

  it("clears what an earlier run left in the staging directory when it is old, and only that", async () => {
    await mkdir(at(".staging", "release-old"), { recursive: true });
    await mkdir(at(".staging", "release-recent"), { recursive: true });
    await mkdir(at(".staging", "other-thing"), { recursive: true });
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(at(".staging", "release-old"), old, old);
    await utimes(at(".staging", "other-thing"), old, old);
    await place();
    expect(await names(at(".staging"))).toEqual([
      "other-thing",
      "release-recent",
    ]);
  });

  it("does not keep a file that is not in the list, or leave a directory that has none", async () => {
    await place(files({ "a/b/c.txt": "deep" }));
    expect(await names(at("notes", "1.0.0"))).toEqual([
      "a",
      "barynt-plugin.json",
      "dist",
    ]);
    expect(
      await readFile(at("notes", "1.0.0", "a", "b", "c.txt"), "utf8"),
    ).toBe("deep");
  });
});
