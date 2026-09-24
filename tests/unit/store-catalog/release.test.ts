import { describe, expect, it } from "bun:test";
import { gzipSync } from "node:zlib";
import {
  planRelease,
  RELEASE_LIMITS,
  RELEASE_MANIFEST,
  readRelease,
} from "@/lib/plugins/store/release";
import type { TarEntry } from "@/lib/plugins/store/tar";
import { entry, tar, tgz } from "../store-support/tarBuilder";
import { zip } from "../store-support/zipBuilder";

// A plugin's release, before anything of it is written. What matters: what is accepted is a plugin
// directory with `barynt-plugin.json` at its root and nothing a plugin may not have (a link, a
// special file, a name that leaves the directory, a name twice), within the limits the hash of an
// installed plugin enforces, and the format is told by what the first bytes say, not by a name.

const file = (path: string, data = "x"): TarEntry => ({
  path,
  kind: "file",
  data: Buffer.from(data),
});
const other = (path: string, kind: TarEntry["kind"]): TarEntry => ({
  path,
  kind,
  data: Buffer.alloc(0),
});
const manifest = file(RELEASE_MANIFEST, "{}");
const plan = (...entries: TarEntry[]) => planRelease(entries);
const planned = (...entries: TarEntry[]) => {
  const result = plan(...entries);
  if (!result.ok) throw new Error(result.error);
  return result.files;
};
const error = (...entries: TarEntry[]) => {
  const result = plan(...entries);
  return result.ok ? null : result.error;
};

describe("the format", () => {
  it("reads a .tgz, by its first bytes and not by a name", () => {
    const result = readRelease(
      tgz(
        entry({ name: "barynt-plugin.json", data: "{}" }),
        entry({ name: "dist/index.js", data: "1" }),
      ),
    );
    expect(result.ok && result.entries.map((e) => e.path)).toEqual([
      "barynt-plugin.json",
      "dist/index.js",
    ]);
  });

  it("reads a .zip", () => {
    const result = readRelease(
      zip([
        { name: "barynt-plugin.json", data: "{}" },
        { name: "dist/", data: "" },
      ]),
    );
    expect(result.ok && result.entries.map((e) => [e.path, e.kind])).toEqual([
      ["barynt-plugin.json", "file"],
      ["dist/", "directory"],
    ]);
  });

  it("reads an empty zip, which has no entries and so no plugin", () => {
    expect(readRelease(zip([]))).toEqual({ ok: true, entries: [] });
  });

  it.each([
    [
      "a tar that is not compressed",
      tar(entry({ name: "barynt-plugin.json", data: "{}" })),
    ],
    ["text", Buffer.from("<html>Not found</html>")],
    ["nothing", Buffer.alloc(0)],
    ["one byte", Buffer.from([0x1f])],
    ["a 7z archive", Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])],
    ["a bzip2 archive", Buffer.from("BZh91AY&SY")],
    [
      "a gzip header with a wrong first byte",
      Buffer.from([0x00, 0x8b, 0x08, 0x00]),
    ],
    ["a zip header with a wrong first byte", Buffer.from("XK\x03\x04")],
    ["a zip header with a wrong second byte", Buffer.from("PX\x03\x04")],
    ["one byte that starts a zip", Buffer.from("P")],
  ])("refuses %s", (_n, bytes) => {
    expect(readRelease(bytes)).toEqual({
      ok: false,
      error: "The release is not a .tgz, .tar.gz or .zip archive.",
    });
  });

  it("says a gzip that is cut off or damaged is not one that can be read", () => {
    const good = tgz(entry({ name: "barynt-plugin.json", data: "{}" }));
    const bad = readRelease(good.subarray(0, good.length - 12));
    expect(bad).toEqual({
      ok: false,
      error: "The release is not a gzip archive that can be read.",
    });
    expect(
      readRelease(Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0])),
    ).toMatchObject({
      ok: false,
    });
  });

  it("does not unpack a gzip that is a bomb", () => {
    const bomb = gzipSync(
      Buffer.alloc(RELEASE_LIMITS.maxTotalBytes * 2 + 1024 * 1024),
    );
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    expect(readRelease(bomb)).toEqual({
      ok: false,
      error: "The release is larger than a plugin may be once unpacked.",
    });
  });

  it("passes on what the tar and zip readers refuse", () => {
    const damaged = gzipSync(
      tar(entry({ name: "a", data: "x", badChecksum: true })),
    );
    expect(readRelease(damaged)).toMatchObject({
      ok: false,
      error: expect.stringContaining("damaged"),
    });
    expect(readRelease(zip([{ name: "a", data: "x", crc: 1 }]))).toMatchObject({
      ok: false,
      error: expect.stringContaining("checksum"),
    });
  });

  it("applies the limits of a release to both readers", () => {
    const many = Array.from(
      { length: RELEASE_LIMITS.maxEntries + 1 },
      (_, n) => ({
        name: `d${n}/`,
        dosAttributes: 0x10,
      }),
    );
    expect(readRelease(zip(many))).toMatchObject({
      ok: false,
      error: `The archive has more than ${RELEASE_LIMITS.maxEntries} entries.`,
    });
    const tarMany = Array.from(
      { length: RELEASE_LIMITS.maxEntries + 1 },
      (_, n) => entry({ name: `d${n}/`, flag: "5" }),
    );
    expect(readRelease(tgz(...tarMany))).toMatchObject({
      ok: false,
      error: `The archive has more than ${RELEASE_LIMITS.maxEntries} entries.`,
    });
  });
});

describe("what a plugin is", () => {
  it("is its files, by path, with the manifest at the root", () => {
    const files = planned(
      file("dist/b.js", "b"),
      manifest,
      file("dist/a.js", "a"),
      file("README.md", "r"),
    );
    expect(files.map((f) => f.path)).toEqual([
      "README.md",
      RELEASE_MANIFEST,
      "dist/a.js",
      "dist/b.js",
    ]);
    expect(files.find((f) => f.path === "dist/a.js")?.data.toString()).toBe(
      "a",
    );
  });

  it("has no manifest at the root when it is in a directory, as an archive of a repository has it", () => {
    expect(
      error(
        file("plugin-1.0.0/barynt-plugin.json", "{}"),
        file("plugin-1.0.0/index.js"),
      ),
    ).toBe(
      "The release has no barynt-plugin.json at its root, so it is not a plugin.",
    );
    expect(error()).toBe(
      "The release has no barynt-plugin.json at its root, so it is not a plugin.",
    );
    expect(error(other(RELEASE_MANIFEST, "directory"))).toContain(
      "no barynt-plugin.json",
    );
  });

  it("takes what `tar czf plugin.tgz .` writes: an entry for the directory, and names that start with ./", () => {
    const files = planned(
      other("./", "directory"),
      other(".", "directory"),
      file("./barynt-plugin.json", "{}"),
      other("./dist/", "directory"),
      file("./dist/index.js"),
    );
    expect(files.map((f) => f.path)).toEqual([
      "barynt-plugin.json",
      "dist/index.js",
    ]);
  });

  it("takes directories that name where files go, and leaves them out", () => {
    expect(
      planned(
        other("dist/", "directory"),
        other("empty/", "directory"),
        manifest,
      ).map((f) => f.path),
    ).toEqual([RELEASE_MANIFEST]);
  });

  it("takes files that start with a dot, and a directory that is a file's neighbour", () => {
    expect(
      planned(
        manifest,
        file(".hidden"),
        file("a/.env"),
        file("a b/c d.txt"),
      ).map((f) => f.path),
    ).toEqual([".hidden", "a b/c d.txt", "a/.env", RELEASE_MANIFEST]);
  });
});

describe("what a plugin may not have", () => {
  it.each([
    ["a symlink", other("link", "symlink"), "link (link)"],
    ["a hard link", other("hard", "hardlink"), "link (hard)"],
    ["a device or a pipe", other("fifo", "other"), "special file (fifo)"],
  ])("refuses %s, even one that points nowhere", (_n, bad, words) => {
    expect(error(manifest, bad)).toBe(
      `The release has a ${words}, which a plugin may not have.`,
    );
  });

  it("refuses a link that is written to look like a directory or a file the plugin has", () => {
    expect(
      error(manifest, file("dist/index.js"), other("dist/index.js", "symlink")),
    ).toContain("link");
  });

  it.each([
    ["a parent directory", "../evil.js"],
    ["a parent directory in the middle", "a/../../evil.js"],
    ["an absolute path", "/etc/passwd"],
    ["a backslash", "a\\b.js"],
    ["a control character", "a\u0007b.js"],
    ["nothing", ""],
  ])("refuses a name with %s", (_n, path) => {
    expect(error(manifest, file(path))).toBe(
      "The release has a file with a name that cannot be used.",
    );
    expect(error(manifest, other(path, "directory"))).toBe(
      "The release has a file with a name that cannot be used.",
    );
  });

  it("refuses a name that is refused even where it would not be written, so the rest is not trusted", () => {
    expect(error(manifest, other("../x/", "directory"))).toContain(
      "cannot be used",
    );
  });

  it("refuses a file that is in it twice, and does not choose", () => {
    expect(error(manifest, file("a.js", "1"), file("a.js", "2"))).toBe(
      "The release holds a.js twice.",
    );
    expect(error(file(RELEASE_MANIFEST, "{}"), manifest)).toBe(
      "The release holds barynt-plugin.json twice.",
    );
    expect(error(manifest, file("./a.js", "1"), file("a.js", "2"))).toBe(
      "The release holds a.js twice.",
    );
  });

  it("refuses two files whose names differ only in case, as one file on some systems", () => {
    expect(error(manifest, file("index.js"), file("Index.js"))).toBe(
      "The release has two files whose names differ only in case (Index.js).",
    );
    expect(error(manifest, file("Index.js"), file("index.js"))).toBe(
      "The release has two files whose names differ only in case (index.js).",
    );
    expect(error(file("Barynt-Plugin.json", "{}"), manifest)).toContain(
      "differ only in case",
    );
    expect(error(manifest, file("Dist/a.js"), file("dist/a.js"))).toContain(
      "differ only in case",
    );
  });

  it("refuses a file that is called . or ./, which is no file", () => {
    expect(error(manifest, file("."))).toContain("cannot be used");
    expect(error(manifest, file("./"))).toContain("cannot be used");
  });

  it("refuses a name that is a file and a directory", () => {
    const both = (path: string) =>
      `The release has ${path} as a file and as a directory.`;
    expect(error(manifest, file("a"), file("a/b"))).toBe(both("a"));
    expect(error(manifest, file("a/b"), file("a"))).toBe(both("a"));
    expect(error(manifest, file("a"), other("a/", "directory"))).toBe(
      both("a"),
    );
    expect(error(manifest, other("a/", "directory"), file("a"))).toBe(
      both("a"),
    );
    expect(error(manifest, file("x/a"), file("x/a/b"))).toBe(both("x/a"));
    // And in another case.
    expect(error(manifest, file("a"), file("A/b"))).toBe(both("A"));
    expect(error(manifest, file("A/b"), file("a"))).toBe(both("a"));
    expect(error(manifest, file("a/b"), file("A"))).toBe(both("A"));
  });

  it("takes two directories that differ only in case, which is harmless: they hold different files", () => {
    expect(
      planned(manifest, file("A/x.js"), file("a/y.js")).map((f) => f.path),
    ).toContain("A/x.js");
  });
});

describe("the limits", () => {
  const deep = (levels: number, name = "f.js") =>
    `${Array(levels).fill("d").join("/")}${levels ? "/" : ""}${name}`;

  it("takes 12 directories deep and no more, for a file and for a directory", () => {
    expect(planned(manifest, file(deep(12))).length).toBe(2);
    expect(error(manifest, file(deep(13)))).toBe(
      "The release has a file more than 12 directories deep.",
    );
    expect(
      planned(
        manifest,
        other(`${deep(12, "")}`.replace(/\/$/, ""), "directory"),
      ).length,
    ).toBe(1);
    expect(
      error(manifest, other(`${deep(13, "")}`.replace(/\/$/, ""), "directory")),
    ).toBe("The release has a file more than 12 directories deep.");
  });

  it("takes 5000 files and no more, the manifest included", () => {
    const files = (count: number) =>
      Array.from({ length: count - 1 }, (_, n) => file(`f${n}.js`));
    expect(planned(manifest, ...files(5000)).length).toBe(5000);
    expect(error(manifest, ...files(5001))).toBe(
      "The release has more than 5000 files.",
    );
  });

  it("does not count directories as files", () => {
    const dirs = Array.from({ length: 6000 }, (_, n) =>
      other(`d${n}/`, "directory"),
    );
    expect(planned(manifest, ...dirs).length).toBe(1);
  });

  it("takes a file of 32 MiB and no more", () => {
    const size = RELEASE_LIMITS.maxFileBytes;
    const big = (n: number): TarEntry => ({
      path: "big.bin",
      kind: "file",
      data: Buffer.alloc(n),
    });
    expect(planned(manifest, big(size)).length).toBe(2);
    expect(error(manifest, big(size + 1))).toBe(
      "big.bin is larger than 32 MiB.",
    );
  });

  it("takes 128 MiB in all, and no more", () => {
    const big = (path: string, n: number): TarEntry => ({
      path,
      kind: "file",
      data: Buffer.alloc(n),
    });
    const third = RELEASE_LIMITS.maxFileBytes;
    const four = [
      big("a", third),
      big("b", third),
      big("c", third),
      big("d", third - 2),
    ];
    expect(planned(manifest, ...four).length).toBe(5);
    expect(error(manifest, ...four.slice(0, 3), big("d", third - 1))).toBe(
      "The release is larger than 128 MiB once unpacked.",
    );
  });

  it("are these, in numbers", () => {
    expect({ ...RELEASE_LIMITS }).toEqual({
      maxDownloadBytes: 50 * 1024 * 1024,
      maxFiles: 5000,
      maxEntries: 10_000,
      maxDepth: 12,
      maxFileBytes: 32 * 1024 * 1024,
      maxTotalBytes: 128 * 1024 * 1024,
    });
  });

  it("is the limits of the hash of an installed plugin, so nothing is accepted that could not be approved", async () => {
    const { INTEGRITY_LIMITS } = await import("@/lib/plugins/integrity");
    expect(Number(RELEASE_LIMITS.maxFiles)).toBe(INTEGRITY_LIMITS.maxFiles);
    expect(Number(RELEASE_LIMITS.maxDepth)).toBe(INTEGRITY_LIMITS.maxDepth);
    expect(Number(RELEASE_LIMITS.maxFileBytes)).toBe(
      INTEGRITY_LIMITS.maxFileBytes,
    );
    expect(Number(RELEASE_LIMITS.maxTotalBytes)).toBe(
      INTEGRITY_LIMITS.maxTotalBytes,
    );
  });
});
