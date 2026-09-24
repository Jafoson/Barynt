import { describe, expect, it } from "bun:test";
import { cleanEntryPath, readTar } from "@/lib/plugins/store/tar";
import {
  entry,
  fixChecksum,
  header,
  longName,
  pax,
  tar,
} from "../store-support/tarBuilder";

// A tar archive made by someone else. What matters: what is in it is read exactly, and
// anything it does not understand, or that is too big, or that has been tampered with, is
// refused rather than guessed at. It never throws, and it never looks past the end of what
// it was given.

const LIMITS = { maxEntries: 100, maxTotalBytes: 10_000 };
const read = (buffer: Buffer, limits = LIMITS) => readTar(buffer, limits);
const ok = (buffer: Buffer, limits = LIMITS) => {
  const result = read(buffer, limits);
  if (!result.ok) throw new Error(result.error);
  return result.entries;
};

describe("what is read", () => {
  it("gives each entry with its path, its kind and, for a file, its content", () => {
    const entries = ok(
      tar(
        entry({ name: "root/", flag: "5" }),
        entry({ name: "root/store.json", data: '{"a":1}' }),
        entry({ name: "root/link", flag: "2", linkname: "/etc/passwd" }),
        entry({ name: "root/hard", flag: "1", linkname: "root/store.json" }),
        entry({ name: "root/fifo", flag: "6" }),
      ),
    );
    expect(entries.map((e) => [e.path, e.kind])).toEqual([
      ["root/", "directory"],
      ["root/store.json", "file"],
      ["root/link", "symlink"],
      ["root/hard", "hardlink"],
      ["root/fifo", "other"],
    ]);
    expect(entries[1]?.data.toString()).toBe('{"a":1}');
    expect(entries[2]?.data.length).toBe(0);
  });

  it("reads a file whose size is not a multiple of a block, and the one after it", () => {
    const entries = ok(
      tar(
        entry({ name: "a", data: "x".repeat(700) }),
        entry({ name: "b", data: "y" }),
      ),
    );
    expect(entries.map((e) => e.data.length)).toEqual([700, 1]);
    expect(entries[1]?.data.toString()).toBe("y");
  });

  it("reads an empty file, and an archive with nothing in it", () => {
    expect(ok(tar(entry({ name: "empty" })))[0]?.data.length).toBe(0);
    expect(ok(tar())).toEqual([]);
    expect(ok(Buffer.alloc(1024))).toEqual([]);
  });

  it("takes the old format (no ustar) and the type flag NUL as a file", () => {
    const entries = ok(
      tar(entry({ name: "old", classic: true, data: "x", flag: "\0" })),
    );
    expect(entries[0]).toMatchObject({ path: "old", kind: "file" });
  });

  it("puts the prefix of ustar in front of the name", () => {
    const entries = ok(
      tar(entry({ name: "file.txt", prefix: "a/very/long/prefix", data: "x" })),
    );
    expect(entries[0]?.path).toBe("a/very/long/prefix/file.txt");
  });

  it("ignores the prefix in the old format, where those bytes are something else", () => {
    const block = header({ name: "file.txt", classic: true });
    block.write("junk", 345);
    fixChecksum(block);
    expect(ok(Buffer.concat([block, Buffer.alloc(1024)]))[0]?.path).toBe(
      "file.txt",
    );
  });

  it("takes a GNU long name for the entry after it, and only for that one", () => {
    const name = `root/${"d/".repeat(60)}file.txt`;
    const entries = ok(
      tar(
        longName(name),
        entry({ name: "truncated-name", data: "x" }),
        entry({ name: "next", data: "y" }),
      ),
    );
    expect(entries.map((e) => e.path)).toEqual([name, "next"]);
  });

  it("takes a PAX path and size for the entry after it, and only for that one", () => {
    const entries = ok(
      tar(
        pax({ path: "root/from-pax.txt" }),
        entry({ name: "short", data: "x" }),
        entry({ name: "next", data: "y" }),
      ),
    );
    expect(entries.map((e) => e.path)).toEqual(["root/from-pax.txt", "next"]);
  });

  it("skips a global PAX header, where a host writes the commit", () => {
    const entries = ok(
      tar(pax({ comment: "0123abcd" }, "g"), entry({ name: "a", data: "x" })),
    );
    expect(entries.map((e) => e.path)).toEqual(["a"]);
  });

  it("reads non-ASCII names as UTF-8", () => {
    const entries = ok(
      tar(
        pax({ path: "root/über-plugin.json" }),
        entry({ name: "x", data: "1" }),
      ),
    );
    expect(entries[0]?.path).toBe("root/über-plugin.json");
  });

  it("does not give a GNU long link name to the next entry", () => {
    const entries = ok(
      tar(
        entry({ name: "././@LongLink", flag: "K", data: "target\0" }),
        entry({ name: "a", data: "x" }),
      ),
    );
    expect(entries.map((e) => e.path)).toEqual(["a"]);
  });

  it("gives content as a view into the archive, not a copy", () => {
    const archive = tar(entry({ name: "a", data: "hello" }));
    const [first] = ok(archive);
    expect(first?.data.buffer).toBe(archive.buffer);
  });
});

describe("an archive that is damaged or hostile", () => {
  it("is refused when a header's checksum is wrong", () => {
    const result = read(
      tar(entry({ name: "a", data: "x", badChecksum: true })),
    );
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.error).toContain("damaged");
  });

  it("is refused when one byte of a header was changed", () => {
    const archive = tar(entry({ name: "a", data: "x" }));
    archive[3] = (archive[3] as number) ^ 0xff;
    expect(read(archive).ok).toBe(false);
  });

  it("is refused when it is cut off in the middle of a file", () => {
    const archive = tar(entry({ name: "a", data: "x".repeat(2000) }));
    const result = read(archive.subarray(0, 512 + 1000));
    expect(result).toMatchObject({
      ok: false,
      error: "The archive is cut off.",
    });
  });

  it("is refused when it is cut off inside a header", () => {
    const archive = entry({ name: "a", data: "x" });
    expect(
      read(Buffer.concat([archive, archive.subarray(0, 100)])),
    ).toMatchObject({ ok: false, error: "The archive is cut off." });
  });

  it("is refused when a size says more than there is", () => {
    expect(
      read(tar(entry({ name: "a", data: "x", sizeField: "77777777777" }))),
    ).toMatchObject({ ok: false });
  });

  it("is refused for a size in base-256, which is how a size beyond 8 GiB is written", () => {
    const block = header({ name: "a" });
    block[124] = 0x80;
    fixChecksum(block);
    expect(read(Buffer.concat([block, Buffer.alloc(1024)]))).toMatchObject({
      ok: false,
      error: expect.stringContaining("not read"),
    });
  });

  it("is refused for a size that is not a number", () => {
    expect(
      read(tar(entry({ name: "a", data: "x", sizeField: "zzzzzzzzzzz" }))),
    ).toMatchObject({ ok: false });
  });

  it("is refused for a PAX header that cannot be read, or that sets a size that does not fit", () => {
    expect(
      read(
        tar(
          entry({ name: "p", flag: "x", data: "no-length-here" }),
          entry({ name: "a" }),
        ),
      ),
    ).toMatchObject({ ok: false });
    expect(
      read(
        tar(
          entry({ name: "p", flag: "x", data: "999999 path=x\n" }),
          entry({ name: "a" }),
        ),
      ),
    ).toMatchObject({ ok: false });
    expect(
      read(tar(pax({ size: "-5" }), entry({ name: "a", data: "x" }))),
    ).toMatchObject({ ok: false });
  });

  it("is refused when a PAX size makes an entry larger than the archive", () => {
    expect(
      read(tar(pax({ size: "99999999" }), entry({ name: "a", data: "x" }))),
    ).toMatchObject({ ok: false, error: "The archive is cut off." });
  });

  it("does not throw for anything at all", () => {
    for (const bytes of [
      Buffer.alloc(0),
      Buffer.from("not a tar"),
      Buffer.alloc(511),
      Buffer.alloc(513, 1),
      Buffer.alloc(2048, 0xff),
    ]) {
      const result = read(bytes);
      expect(typeof result.ok).toBe("boolean");
    }
  });

  it("does not throw for random bytes", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const bytes = Buffer.alloc(3000);
      let x = seed;
      for (let i = 0; i < bytes.length; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        bytes[i] = x & 0xff;
      }
      expect(typeof read(bytes).ok).toBe("boolean");
    }
  });
});

describe("limits", () => {
  it("refuses more entries than allowed, counting the ones that are only directories", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      entry({ name: `d${i}/`, flag: "5" }),
    );
    expect(
      read(tar(...many), { maxEntries: 5, maxTotalBytes: 1000 }),
    ).toMatchObject({
      ok: false,
      error: "The archive has more than 5 entries.",
    });
    expect(read(tar(...many), { maxEntries: 6, maxTotalBytes: 1000 }).ok).toBe(
      true,
    );
  });

  it("does not count the headers of extended records as entries", () => {
    const parts = [
      pax({ path: "a/x" }),
      entry({ name: "s", data: "1" }),
      pax({ path: "a/y" }),
      entry({ name: "s", data: "1" }),
    ];
    expect(read(tar(...parts), { maxEntries: 2, maxTotalBytes: 1000 }).ok).toBe(
      true,
    );
  });

  it("refuses more bytes of files than allowed, and counts each file", () => {
    const archive = tar(
      entry({ name: "a", data: "x".repeat(600) }),
      entry({ name: "b", data: "x".repeat(600) }),
    );
    expect(
      read(archive, { maxEntries: 10, maxTotalBytes: 1199 }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("more than 1199 bytes"),
    });
    expect(read(archive, { maxEntries: 10, maxTotalBytes: 1200 }).ok).toBe(
      true,
    );
  });

  it("does not count links and directories as bytes", () => {
    const archive = tar(
      entry({ name: "l", flag: "2", linkname: "x".repeat(90) }),
      entry({ name: "d/", flag: "5" }),
    );
    expect(read(archive, { maxEntries: 10, maxTotalBytes: 0 }).ok).toBe(true);
  });
});

describe("a path that is to be used below one of our directories", () => {
  it.each([
    ["root/store.json", "root/store.json"],
    ["root//store.json", "root/store.json"],
    ["./root/./store.json", "root/store.json"],
    ["root/plugins/notes/", "root/plugins/notes"],
    ["a", "a"],
    ["über/ñ.json", "über/ñ.json"],
  ])("is %j as %j", (path, clean) => {
    expect(cleanEntryPath(path)).toBe(clean);
  });

  it.each([
    ["nothing", ""],
    ["a parent directory", "../etc/passwd"],
    ["a parent directory in the middle", "root/../../etc"],
    ["a parent directory at the end", "root/.."],
    ["an absolute path", "/etc/passwd"],
    ["a backslash", "root\\..\\evil"],
    ["a NUL", "root/a\0b"],
    ["a newline", "root/a\nb"],
    ["a control character", "root/a\u0007b"],
    ["DEL", "root/a\u007fb"],
    ["only dots and slashes", "./././"],
    ["something too long", `root/${"x".repeat(600)}`],
    ["a part that is too long", `root/${"x".repeat(256)}`],
    ["something too deep", Array(33).fill("d").join("/")],
  ])("is refused: %s", (_n, path) => {
    expect(cleanEntryPath(path)).toBeNull();
  });

  it("allows 32 levels, and 255 characters in a part", () => {
    expect(cleanEntryPath(Array(32).fill("d").join("/"))).not.toBeNull();
    expect(cleanEntryPath(`root/${"x".repeat(255)}`)).not.toBeNull();
  });

  it("does not take `...` or a name that only starts with two dots for a parent", () => {
    expect(cleanEntryPath("root/...")).toBe("root/...");
    expect(cleanEntryPath("root/..hidden")).toBe("root/..hidden");
  });
});

describe("the fields of a header, to the character", () => {
  it("reads a name in the header as UTF-8", () => {
    expect(ok(tar(entry({ name: "über/ñ.json", data: "x" })))[0]?.path).toBe(
      "über/ñ.json",
    );
  });

  it("takes a size that has a space before or after it, or that is empty, for what it is", () => {
    const sized = (sizeField: string, data: string) =>
      ok(tar(entry({ name: "a", data, sizeField })))[0]?.data.toString();
    expect(sized("00000000005 ", "hello")).toBe("hello");
    expect(sized("        5", "hello")).toBe("hello");
    expect(sized("5", "hello")).toBe("hello");
    expect(sized("", "")).toBe("");
    expect(sized("           ", "")).toBe("");
  });

  it.each([
    ["digits that are no octal digits", "00000000018"],
    ["letters after the digits", "7abc"],
    ["letters before the digits", "abc7"],
    ["a sign", "-1"],
    ["a fraction", "1.5"],
    ["a hex number", "0x10"],
  ])("refuses a size with %s", (_n, sizeField) => {
    expect(read(tar(entry({ name: "a", data: "x", sizeField })))).toMatchObject(
      {
        ok: false,
        error: "The archive has a file size in a form that is not read.",
      },
    );
  });

  it("takes a checksum written with seven digits and a NUL, as some writers do", () => {
    const block = header({ name: "a", data: "x" });
    let sum = 0;
    for (let i = 0; i < 512; i++) {
      sum += i >= 148 && i < 156 ? 0x20 : (block[i] as number);
    }
    block.fill(0, 148, 156);
    block.write(`${sum.toString(8).padStart(7, "0")}\0`, 148);
    expect(block[155]).toBe(0);
    const entries = ok(
      Buffer.concat([
        block,
        entry({ name: "a", data: "x" }).subarray(512),
        Buffer.alloc(1024),
      ]),
    );
    expect(entries.map((e) => e.path)).toEqual(["a"]);
  });

  it("is refused when the last byte of a header, which is unused, was changed", () => {
    const archive = tar(entry({ name: "a", data: "x" }));
    archive[511] = 1;
    expect(read(archive)).toMatchObject({ ok: false });
    expect(
      read(archive).ok === false && (read(archive) as { error: string }).error,
    ).toContain("damaged");
  });

  it("does not take a block for the end of the archive that is empty only in part", () => {
    for (const at of [300, 511]) {
      const block = Buffer.alloc(1024);
      block[at] = 1;
      expect(read(block)).toMatchObject({
        ok: false,
        error: expect.stringContaining("damaged"),
      });
    }
  });

  it("takes an archive that is one header and nothing else, without an end", () => {
    const entries = ok(entry({ name: "empty" }));
    expect(entries.map((e) => e.path)).toEqual(["empty"]);
  });

  it("takes the type flag 7, a contiguous file, for a file", () => {
    expect(
      ok(tar(entry({ name: "a", flag: "7", data: "x" })))[0],
    ).toMatchObject({
      kind: "file",
    });
  });
});

describe("extended headers, to the record", () => {
  const badPax = (data: string) =>
    read(tar(entry({ name: "p", flag: "x", data }), entry({ name: "a" })));
  const unreadable = {
    ok: false,
    error: "The archive has an extended header that cannot be read.",
  };

  it.each([
    ["a length that is no number", "xx path=a\n"],
    ["a length with a fraction", "1.5 path=a\n"],
    ["a length of zero, which would never move on", "0 path=a\n"],
    ["a length of one more than there is", "11 path=x\n"],
    ["a length that stops in the middle", "5 path=x\n"],
  ])("refuses %s", (_n, data) => {
    expect(badPax(data)).toMatchObject(unreadable);
  });

  it.each([
    ["is no number", "abc"],
    ["has a fraction", "1.5"],
    ["is negative", "-5"],
    ["is beyond what a number holds", "99999999999999999999999"],
  ])("refuses a PAX size that %s", (_n, size) => {
    expect(
      read(tar(pax({ size }), entry({ name: "a", data: "x" }))),
    ).toMatchObject(unreadable);
  });

  it("refuses a global header that cannot be read, too", () => {
    expect(
      read(
        tar(
          entry({ name: "g", flag: "g", data: "garbage" }),
          entry({ name: "a" }),
        ),
      ),
    ).toMatchObject(unreadable);
  });

  it("reads more than one record, one after the other", () => {
    const entries = ok(
      tar(
        pax({ comment: "hello", path: "root/two.txt" }),
        entry({ name: "short", data: "x" }),
      ),
    );
    expect(entries.map((e) => e.path)).toEqual(["root/two.txt"]);
    expect(
      ok(
        tar(pax({ path: "root/a", comment: "hello" }), entry({ name: "s" })),
      )[0]?.path,
    ).toBe("root/a");
  });

  it("does not let a size from one extended header change the size of the next extended header", () => {
    const entries = ok(
      tar(
        pax({ size: "1" }),
        pax({ path: "root/p" }),
        entry({ name: "n", data: "y" }),
      ),
    );
    expect(entries.map((e) => [e.path, e.data.toString()])).toEqual([
      ["root/p", "y"],
    ]);
  });

  it("does not let it change the size of a global one either", () => {
    const entries = ok(
      tar(
        pax({ size: "1" }),
        pax({ comment: "c" }, "g"),
        entry({ name: "n", data: "y" }),
      ),
    );
    expect(entries.map((e) => [e.path, e.data.toString()])).toEqual([
      ["n", "y"],
    ]);
  });

  it("takes the size of a PAX header for the entry that follows, in place of the field", () => {
    const entries = ok(
      tar(
        pax({ size: "5" }),
        entry({ name: "n", data: "hello", sizeField: "00000000001" }),
      ),
    );
    expect(entries[0]?.data.toString()).toBe("hello");
  });
});

describe("what counts", () => {
  it("does not count the data of a link or a directory, when a writer put some there", () => {
    const archive = tar(
      entry({ name: "l", flag: "2", data: "x".repeat(90) }),
      entry({ name: "h", flag: "1", data: "x".repeat(90) }),
      entry({ name: "d/", flag: "5", data: "x".repeat(90) }),
    );
    const entries = ok(archive, { maxEntries: 10, maxTotalBytes: 0 });
    expect(entries.map((e) => e.data.length)).toEqual([0, 0, 0]);
  });

  it("counts a file's data once, and the total is of all of them together", () => {
    const archive = tar(
      entry({ name: "a", data: "x".repeat(10) }),
      entry({ name: "b", data: "x".repeat(10) }),
      entry({ name: "c", data: "x".repeat(10) }),
    );
    expect(read(archive, { maxEntries: 10, maxTotalBytes: 29 })).toMatchObject({
      ok: false,
    });
    expect(read(archive, { maxEntries: 10, maxTotalBytes: 30 }).ok).toBe(true);
  });
});

describe("the length of a path", () => {
  it("takes 512 characters and refuses 513", () => {
    const parts = (last: number) =>
      [`${"a".repeat(200)}`, `${"b".repeat(200)}`, "c".repeat(last)].join("/");
    expect(parts(110)).toHaveLength(512);
    expect(cleanEntryPath(parts(110))).toBe(parts(110));
    expect(cleanEntryPath(parts(111))).toBeNull();
  });
});
