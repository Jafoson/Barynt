import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { unpackStoreArchive } from "@/lib/plugins/store/archive";
import { readStoreDirectory } from "@/lib/plugins/store/reader";
import { entry, longName, pax, tar, tgz } from "../store-support/tarBuilder";

// Unpacking the archive of a store. What matters: only what a store is made of reaches the
// disk, wherever the archive says to put something else, whatever it is (a symlink, a
// script, a directory named like a file), and the archive is refused when it is damaged, too
// large, made of more than one tree, or says the same file twice. The disk is real.

let root: string;
let dest: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-unpack-"));
  dest = join(root, "dest");
  await mkdir(dest);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const STORE = JSON.stringify({
  schemaVersion: 1,
  id: "test-store",
  name: "Test",
});
const MANIFEST = JSON.stringify({
  manifestVersion: 1,
  id: "notes",
  name: "Notes",
  version: "1.0.0",
  description: "d",
  author: "a",
  license: "MIT",
  categories: ["other"],
  barynt: "^0.1.0",
});
const SOURCE = JSON.stringify({
  versions: [
    {
      version: "1.0.0",
      download: "https://x.com/n.tgz",
      sha512: "a".repeat(128),
    },
  ],
});

const good = () =>
  tgz(
    pax({ comment: "a1b2c3" }, "g"),
    entry({ name: "repo-a1b2c3/", flag: "5" }),
    entry({ name: "repo-a1b2c3/store.json", data: STORE }),
    entry({ name: "repo-a1b2c3/README.md", data: "# Store" }),
    entry({ name: "repo-a1b2c3/.github/workflows/ci.yml", data: "name: ci" }),
    entry({ name: "repo-a1b2c3/plugins/", flag: "5" }),
    entry({ name: "repo-a1b2c3/plugins/notes/", flag: "5" }),
    entry({
      name: "repo-a1b2c3/plugins/notes/barynt-plugin.json",
      data: MANIFEST,
    }),
    entry({ name: "repo-a1b2c3/plugins/notes/source.json", data: SOURCE }),
    entry({ name: "repo-a1b2c3/plugins/notes/README.md", data: "notes" }),
  );

async function listing(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${prefix}${item.name}`;
    if (item.isDirectory())
      out.push(...(await listing(join(dir, item.name), `${path}/`)));
    else out.push(path);
  }
  return out.sort();
}

describe("a store's archive", () => {
  it("writes the files of the store and nothing else", async () => {
    const result = await unpackStoreArchive(good(), dest);
    expect(result).toEqual({ ok: true, files: 3 });
    expect(await listing(dest)).toEqual([
      "plugins/notes/barynt-plugin.json",
      "plugins/notes/source.json",
      "store.json",
    ]);
    expect(await readFile(join(dest, "store.json"), "utf8")).toBe(STORE);
    expect(
      await readFile(join(dest, "plugins/notes/source.json"), "utf8"),
    ).toBe(SOURCE);
  });

  it("gives a directory that the reader takes as a store", async () => {
    await unpackStoreArchive(good(), dest);
    const snapshot = await readStoreDirectory(dest);
    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) {
      expect(snapshot.store).toEqual({ id: "test-store", name: "Test" });
      expect(snapshot.entries.map((e) => e.id)).toEqual(["notes"]);
      expect(snapshot.problems).toEqual([]);
    }
  });

  it("writes the files readable by everyone and executable by no one", async () => {
    await unpackStoreArchive(good(), dest);
    const mode = (await stat(join(dest, "store.json"))).mode & 0o777;
    expect(mode & 0o111).toBe(0);
    expect(mode & 0o400).not.toBe(0);
  });

  it("takes a PAX path and a GNU long name for what they name", async () => {
    const result = await unpackStoreArchive(
      tgz(
        entry({ name: "root/store.json", data: STORE }),
        longName("root/plugins/notes/barynt-plugin.json"),
        entry({ name: "cut-off", data: MANIFEST }),
        pax({ path: "root/plugins/notes/source.json" }),
        entry({ name: "cut-off-too", data: SOURCE }),
      ),
      dest,
    );
    expect(result).toMatchObject({ ok: true, files: 3 });
  });

  it("does not need a directory entry for the root or for a plugin", async () => {
    const result = await unpackStoreArchive(
      tgz(entry({ name: "r/store.json", data: STORE })),
      dest,
    );
    expect(result).toEqual({ ok: true, files: 1 });
  });
});

describe("what is left out, without a word", () => {
  const withStore = (...extra: Buffer[]) =>
    tgz(entry({ name: "r/store.json", data: STORE }), ...extra);

  it.each([
    ["a file in another place", "r/scripts/build.sh"],
    ["a plugin file with another name", "r/plugins/notes/other.json"],
    ["a source deeper down", "r/plugins/notes/sub/source.json"],
    ["a plugin whose id has capitals", "r/plugins/Notes/source.json"],
    [
      "a plugin whose id starts with an underscore",
      "r/plugins/_example/source.json",
    ],
    ["a plugin whose id starts with a dot", "r/plugins/.git/source.json"],
    ["a plugin whose id is too short", "r/plugins/a/source.json"],
    ["a store.json deeper down", "r/plugins/store.json"],
    ["a plugins file at the top", "r/plugins/source.json"],
    ["a store.json with another case", "r/Store.json"],
    ["a plugins directory below another one", "r/x/plugins/notes/source.json"],
    [
      "a file that only starts like a store file",
      "r/plugins/notes/source.json.bak",
    ],
    [
      "a file that only ends like a store file",
      "r/plugins/notes/xbarynt-plugin.json",
    ],
    ["a store.json that only starts like the store file", "r/store.json.orig"],
  ])("leaves out %s", async (_n, name) => {
    const result = await unpackStoreArchive(
      withStore(entry({ name, data: "x" })),
      dest,
    );
    expect(result).toEqual({ ok: true, files: 1 });
    expect(await listing(dest)).toEqual(["store.json"]);
  });

  it("leaves out a symlink, a hard link and a device, even where a store file would go", async () => {
    const result = await unpackStoreArchive(
      tgz(
        entry({ name: "r/store.json", data: STORE }),
        entry({
          name: "r/plugins/notes/source.json",
          flag: "2",
          linkname: "/etc/passwd",
        }),
        entry({
          name: "r/plugins/notes/barynt-plugin.json",
          flag: "1",
          linkname: "r/store.json",
        }),
        entry({ name: "r/plugins/wiki/source.json", flag: "3" }),
        entry({ name: "r/plugins/wiki2/source.json", flag: "5" }),
      ),
      dest,
    );
    expect(result).toEqual({ ok: true, files: 1 });
    expect(await listing(dest)).toEqual(["store.json"]);
  });

  it("is no store when the only store.json is a symlink", async () => {
    const result = await unpackStoreArchive(
      tgz(entry({ name: "r/store.json", flag: "2", linkname: "/etc/passwd" })),
      dest,
    );
    expect(result).toEqual({
      ok: false,
      error: "The archive is no store: it has no store.json.",
    });
    expect(await listing(dest)).toEqual([]);
  });
});

describe("an archive that is refused", () => {
  it.each([
    ["a parent directory", "r/../../etc/passwd"],
    ["an absolute path", "/etc/passwd"],
    ["a backslash", "r\\..\\evil"],
    ["a control character", "r/a\u0007b"],
  ])(
    "says no to a name with %s, even for a file that is left out anyway",
    async (_n, name) => {
      const result = await unpackStoreArchive(
        tgz(
          entry({ name: "r/store.json", data: STORE }),
          entry({ name, data: "x" }),
        ),
        dest,
      );
      expect(result).toEqual({
        ok: false,
        error:
          "The store's archive has a file with a name that cannot be used.",
      });
      expect(await listing(dest)).toEqual([]);
    },
  );

  it("says no to a name that is too long, which only a PAX header can carry", async () => {
    const result = await unpackStoreArchive(
      tgz(
        entry({ name: "r/store.json", data: STORE }),
        pax({ path: `r/${"x".repeat(600)}` }),
        entry({ name: "short", data: "x" }),
      ),
      dest,
    );
    expect(result).toEqual({
      ok: false,
      error: "The store's archive has a file with a name that cannot be used.",
    });
  });

  it("writes nothing outside the directory, whatever the names say", async () => {
    const before = await listing(root);
    await unpackStoreArchive(
      tgz(
        entry({ name: "r/store.json", data: STORE }),
        entry({ name: "r/../outside.json", data: "x" }),
        entry({ name: "../outside.json", data: "x" }),
      ),
      dest,
    );
    expect(await listing(root)).toEqual(before);
  });

  it("says no to an archive with more than one top-level directory", async () => {
    const result = await unpackStoreArchive(
      tgz(
        entry({ name: "one/store.json", data: STORE }),
        entry({ name: "two/store.json", data: STORE }),
      ),
      dest,
    );
    expect(result).toEqual({
      ok: false,
      error: "The store's archive has more than one top-level directory.",
    });
  });

  it("says no to a file that is twice in it, and does not choose", async () => {
    const result = await unpackStoreArchive(
      tgz(
        entry({ name: "r/store.json", data: STORE }),
        entry({ name: "r/store.json", data: STORE.replace("Test", "Other") }),
      ),
      dest,
    );
    expect(result).toEqual({
      ok: false,
      error: "The store's archive holds store.json twice.",
    });
    expect(await listing(dest)).toEqual([]);
  });

  it("takes a store file of exactly 256 KiB, and no more", async () => {
    const exact = await unpackStoreArchive(
      tgz(entry({ name: "r/store.json", data: "x".repeat(256 * 1024) })),
      dest,
    );
    expect(exact).toEqual({ ok: true, files: 1 });
  });

  it("says no to a store file that is too large", async () => {
    const result = await unpackStoreArchive(
      tgz(entry({ name: "r/store.json", data: "x".repeat(256 * 1024 + 1) })),
      dest,
    );
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("larger than 256 KiB"),
    });
  });

  it("takes 2000 plugins, and says no to more than that", async () => {
    const plugin = (n: number) => {
      const id = `plugin-${String(n).padStart(4, "0")}`;
      return [
        entry({ name: `r/plugins/${id}/barynt-plugin.json`, data: "{}" }),
        entry({ name: `r/plugins/${id}/source.json`, data: "{}" }),
      ];
    };
    const files = (count: number) =>
      tgz(
        entry({ name: "r/store.json", data: STORE }),
        ...Array.from({ length: count }, (_, n) => plugin(n)).flat(),
      );
    expect(await unpackStoreArchive(files(2000), dest)).toEqual({
      ok: true,
      files: 4001,
    });
    const more = join(root, "more");
    expect(await unpackStoreArchive(files(2001), more)).toEqual({
      ok: false,
      error: "The store's archive has more than 2000 entries.",
    });
    expect(await readdir(root)).not.toContain("more");
    // One file more than the plugins' two each is one too many, too.
    const lone = join(root, "lone");
    expect(
      await unpackStoreArchive(
        tgz(
          entry({ name: "r/store.json", data: STORE }),
          ...Array.from({ length: 2000 }, (_, n) => plugin(n)).flat(),
          entry({ name: "r/plugins/one-more/source.json", data: "{}" }),
        ),
        lone,
      ),
    ).toEqual({
      ok: false,
      error: "The store's archive has more than 2000 entries.",
    });
  });

  it("says it is no store when there is no store.json", async () => {
    const result = await unpackStoreArchive(
      tgz(entry({ name: "r/plugins/notes/source.json", data: SOURCE })),
      dest,
    );
    expect(result).toEqual({
      ok: false,
      error: "The archive is no store: it has no store.json.",
    });
  });

  it("says no to an archive that is empty", async () => {
    expect(await unpackStoreArchive(tgz(), dest)).toMatchObject({ ok: false });
  });

  it("says it is not a gzip archive for what is not one, however it starts", async () => {
    for (const bytes of [
      Buffer.from("just text"),
      Buffer.alloc(0),
      tar(entry({ name: "r/store.json", data: STORE })),
      Buffer.from([0x1f, 0x8b, 0, 0]),
    ]) {
      const result = await unpackStoreArchive(bytes, dest);
      expect(result).toEqual({
        ok: false,
        error: "The store's archive is not a gzip archive.",
      });
    }
  });

  it("says it is not a gzip archive for one that is cut off", async () => {
    const archive = good();
    expect(
      await unpackStoreArchive(archive.subarray(0, archive.length - 30), dest),
    ).toMatchObject({ ok: false });
  });

  it("says no to a tar that is damaged", async () => {
    const damaged = tar(
      entry({ name: "r/store.json", data: STORE, badChecksum: true }),
    );
    const result = await unpackStoreArchive(gzipSync(damaged), dest);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("damaged"),
    });
  });

  it("does not unpack a bomb: what it becomes is limited, not what it is", async () => {
    const bomb = gzipSync(Buffer.alloc(3_000_000));
    expect(bomb.length).toBeLessThan(10_000);
    const result = await unpackStoreArchive(bomb, dest, {
      maxUnpackedBytes: 1_000_000,
    });
    expect(result).toEqual({
      ok: false,
      error: "The store's archive is larger than a store may be once unpacked.",
    });
  });

  it("does not overwrite: a destination that is not empty is refused, and the file that was there stays", async () => {
    await mkdir(join(dest, "plugins/notes"), { recursive: true });
    await writeFile(join(dest, "plugins/notes/source.json"), "OLD");
    const result = await unpackStoreArchive(good(), dest);
    expect(result).toEqual({
      ok: false,
      error: "The store's files could not be written.",
    });
    expect(
      await readFile(join(dest, "plugins/notes/source.json"), "utf8"),
    ).toBe("OLD");
  });

  it("makes the destination when it is not there yet", async () => {
    const later = join(root, "no", "such", "dir");
    const result = await unpackStoreArchive(good(), later);
    expect(result).toEqual({ ok: true, files: 3 });
    expect(await listing(later)).toContain("store.json");
  });

  it("says the files could not be written when the destination is a file", async () => {
    const blocker = join(root, "blocker");
    await writeFile(blocker, "x");
    expect(await unpackStoreArchive(good(), blocker)).toEqual({
      ok: false,
      error: "The store's files could not be written.",
    });
  });
});
