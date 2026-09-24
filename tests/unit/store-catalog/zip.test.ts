import { describe, expect, it } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { crc32, readZip } from "@/lib/plugins/store/zip";
import { localEntry, zip } from "../store-support/zipBuilder";

// A zip archive made by someone else. What matters: what is in it is read exactly, as every other
// reader would read it, and anything it does not understand, or that is too big, or that has been
// tampered with, or that a reader could be made to see differently, is refused rather than guessed
// at. It never throws, and it never looks past the end of what it was given.

const LIMITS = { maxEntries: 100, maxTotalBytes: 10_000, maxEntryBytes: 5_000 };
const read = (buffer: Buffer, limits = LIMITS) => readZip(buffer, limits);
const ok = (buffer: Buffer, limits = LIMITS) => {
  const result = read(buffer, limits);
  if (!result.ok) throw new Error(result.error);
  return result.entries;
};
const refused = (buffer: Buffer, limits = LIMITS) => {
  const result = read(buffer, limits);
  return result.ok ? null : result.error;
};

describe("what is read", () => {
  it("gives each entry with its path, its kind and, for a file, its content", () => {
    const entries = ok(
      zip([
        { name: "barynt-plugin.json", data: '{"id":"notes"}' },
        { name: "dist/", data: "", method: 0 },
        { name: "dist/index.js", data: "console.log(1)", method: 0 },
        { name: "empty.txt", data: "" },
      ]),
    );
    expect(entries.map((e) => [e.path, e.kind])).toEqual([
      ["barynt-plugin.json", "file"],
      ["dist/", "directory"],
      ["dist/index.js", "file"],
      ["empty.txt", "file"],
    ]);
    expect(entries[0]?.data.toString()).toBe('{"id":"notes"}');
    expect(entries[2]?.data.toString()).toBe("console.log(1)");
    expect(entries[3]?.data.length).toBe(0);
  });

  it("inflates what is deflated, and gives what is stored as it is", () => {
    const text = "a plugin ".repeat(200);
    const entries = ok(
      zip([
        { name: "deflated", data: text, method: 8 },
        { name: "stored", data: text, method: 0 },
      ]),
    );
    expect(entries.map((e) => e.data.toString())).toEqual([text, text]);
  });

  it("reads an archive of no entries, and one with a comment", () => {
    expect(ok(zip([]))).toEqual([]);
    expect(
      ok(zip([{ name: "a", data: "x" }], { comment: "x".repeat(65_535) })).map(
        (e) => e.path,
      ),
    ).toEqual(["a"]);
  });

  it("reads non-ASCII names as UTF-8", () => {
    expect(ok(zip([{ name: "über/ñ.json", data: "1" }]))[0]?.path).toBe(
      "über/ñ.json",
    );
  });

  it("reads a file whose sizes are in a data descriptor, from the directory, where they always are", () => {
    const entries = ok(
      zip([{ name: "a", data: "hello world", descriptor: true }]),
    );
    expect(entries[0]?.data.toString()).toBe("hello world");
  });

  it("gives content as a view into the archive when it is stored, not a copy", () => {
    const archive = zip([{ name: "a", data: "hello", method: 0 }]);
    expect(ok(archive)[0]?.data.buffer).toBe(archive.buffer);
  });

  it("finds the end of the archive from the back, so bytes in a comment that look like one do not matter", () => {
    const fake = Buffer.alloc(22);
    fake.writeUInt32LE(0x06054b50, 0);
    const archive = zip([{ name: "a", data: "x" }], {
      comment: `hi${fake.toString("latin1")}tail`,
    });
    expect(ok(archive).map((e) => e.path)).toEqual(["a"]);
  });

  it("is not fooled by something after the archive that looks like the end of another one", () => {
    const fake = Buffer.alloc(22);
    fake.writeUInt32LE(0x06054b50, 0);
    const archive = Buffer.concat([
      zip([{ name: "a", data: "x" }]),
      Buffer.from("x"),
      fake,
    ]);
    // The last thing that is an end record by every rule is the one that counts, as for any reader.
    expect(ok(archive)).toEqual([]);
    expect(
      refused(
        Buffer.concat([zip([{ name: "a", data: "x" }]), Buffer.from("x")]),
      ),
    ).toBe("The archive is not a zip archive.");
  });

  it("is not a zip archive with bytes after it that are not a comment", () => {
    const archive = Buffer.concat([
      zip([{ name: "a", data: "x" }]),
      Buffer.from("trailing"),
    ]);
    expect(refused(archive)).toBe("The archive is not a zip archive.");
  });
});

describe("the kind of an entry", () => {
  it.each([
    ["a symlink", 0o120777, "symlink"],
    ["a regular file", 0o100644, "file"],
    ["an executable file", 0o100755, "file"],
    ["a directory", 0o040755, "directory"],
    ["a fifo", 0o010644, "other"],
    ["a character device", 0o020644, "other"],
    ["a block device", 0o060644, "other"],
    ["a socket", 0o140644, "other"],
    ["no type at all", 0o000644, "file"],
  ])("is %s when the Unix mode says so", (_n, unixMode, kind) => {
    expect(
      String(ok(zip([{ name: "x", data: "target", unixMode }]))[0]?.kind),
    ).toBe(kind);
  });

  it("is a symlink with no content taken from it, whatever it holds", () => {
    const entry = ok(
      zip([{ name: "link", data: "/etc/passwd", unixMode: 0o120777 }]),
    )[0];
    expect(entry?.data.length).toBe(0);
  });

  it("is a directory when a DOS attribute or a trailing slash says so", () => {
    expect(ok(zip([{ name: "d", dosAttributes: 0x10 }]))[0]?.kind).toBe(
      "directory",
    );
    expect(ok(zip([{ name: "d/" }]))[0]?.kind).toBe("directory");
  });

  it("is a file otherwise", () => {
    expect(
      ok(zip([{ name: "f", data: "x", dosAttributes: 0x20 }]))[0]?.kind,
    ).toBe("file");
  });

  it("does not take a DOS attribute for a Unix mode, or the other way round", () => {
    // 0x10 in the low byte is a directory only where the archive was not made on Unix.
    expect(
      ok(zip([{ name: "f", data: "x", unixMode: 0o100644 | 0x10 }]))[0]?.kind,
    ).toBe("file");
    // Bits that look like a symlink in the high half mean nothing for a DOS archive.
    expect(
      ok(
        zip([{ name: "f", data: "x", dosAttributes: (0o120777 << 16) >>> 0 }]),
      )[0]?.kind,
    ).toBe("file");
  });
});

describe("an archive that is refused", () => {
  const good = () => zip([{ name: "a", data: "hello" }]);

  it("is not a zip archive when there is no end record", () => {
    for (const bytes of [
      Buffer.alloc(0),
      Buffer.from("just text"),
      Buffer.alloc(21),
      Buffer.alloc(100),
    ]) {
      expect(refused(bytes)).toBe("The archive is not a zip archive.");
    }
    expect(refused(zip([{ name: "a", data: "x" }], { noEnd: true }))).toBe(
      "The archive is not a zip archive.",
    );
  });

  it("is refused for zip64, in each of the three places it shows", () => {
    expect(refused(zip([{ name: "a" }], { zip64: true }))).toContain("zip64");
    const more = Buffer.from(good());
    more.writeUInt16LE(0xffff, more.length - 22 + 10);
    more.writeUInt16LE(0xffff, more.length - 22 + 8);
    expect(refused(more)).toContain("zip64");
    const size = Buffer.from(good());
    size.writeUInt32LE(0xffffffff, size.length - 22 + 12);
    expect(refused(size)).toContain("zip64");
  });

  it("is refused for an entry that says zip64 in its own sizes or offset", () => {
    for (const field of [20, 24, 42]) {
      const archive = Buffer.from(good());
      const at = archive.readUInt32LE(archive.length - 22 + 16);
      archive.writeUInt32LE(0xffffffff, at + field);
      expect(refused(archive)).toContain("zip64");
    }
  });

  it("is refused when it is in more than one part", () => {
    expect(refused(zip([{ name: "a" }], { disk: 1 }))).toBe(
      "The archive is in more than one part.",
    );
    const archive = Buffer.from(good());
    const at = archive.readUInt32LE(archive.length - 22 + 16);
    archive.writeUInt16LE(1, at + 34);
    expect(refused(archive)).toBe("The archive is in more than one part.");
    const count = Buffer.from(good());
    count.writeUInt16LE(2, count.length - 22 + 8);
    expect(refused(count)).toBe("The archive is in more than one part.");
  });

  it("is refused for an encrypted entry", () => {
    expect(refused(zip([{ name: "a", data: "x", flags: 1 }]))).toContain(
      "encrypted",
    );
  });

  it.each([1, 6, 9, 12, 14, 93, 99])(
    "is refused for compression method %i",
    (method) => {
      expect(refused(zip([{ name: "a", data: "x", method }]))).toContain(
        `method ${method}`,
      );
    },
  );

  it("is refused when the number of entries is more than allowed, before anything is read", () => {
    const files = Array.from({ length: 6 }, (_, i) => ({
      name: `f${i}`,
      data: "x",
    }));
    expect(refused(zip(files), { ...LIMITS, maxEntries: 5 })).toBe(
      "The archive has more than 5 entries.",
    );
    expect(read(zip(files), { ...LIMITS, maxEntries: 6 }).ok).toBe(true);
    expect(
      refused(zip([{ name: "a" }], { count: 60_000 }), {
        ...LIMITS,
        maxEntries: 50_000,
      }),
    ).toBe("The archive has more than 50000 entries.");
  });

  it("is refused when a file is larger than allowed, by what it says and not only by what it holds", () => {
    const big = "x".repeat(5_001);
    expect(refused(zip([{ name: "a", data: big }]))).toContain(
      "larger than 5000 bytes",
    );
    expect(read(zip([{ name: "a", data: "x".repeat(5_000) }])).ok).toBe(true);
  });

  it("is refused when the files together are larger than allowed", () => {
    const files = [
      { name: "a", data: "x".repeat(4_000) },
      { name: "b", data: "x".repeat(4_000) },
      { name: "c", data: "x".repeat(2_001) },
    ];
    expect(refused(zip(files))).toContain("more than 10000 bytes");
    files[2] = { name: "c", data: "x".repeat(2_000) };
    expect(read(zip(files)).ok).toBe(true);
  });

  it("does not count directories, links and special files as bytes", () => {
    const archive = zip([
      { name: "d/", data: "x".repeat(4_000), dosAttributes: 0x10 },
      { name: "l", data: "x".repeat(4_000), unixMode: 0o120777 },
      { name: "p", data: "x".repeat(4_000), unixMode: 0o010644 },
    ]);
    expect(
      read(archive, { ...LIMITS, maxTotalBytes: 0, maxEntryBytes: 0 }).ok,
    ).toBe(true);
  });

  it("does not inflate a bomb: what an entry becomes is what it says, not more", () => {
    const bomb = deflateRawSync(Buffer.alloc(3_000_000));
    expect(bomb.length).toBeLessThan(5_000);
    const archive = zip([
      { name: "a", raw: bomb, size: 100, crc: 0, compressed: bomb.length },
    ]);
    expect(refused(archive)).toBe(
      "The archive has a file that does not inflate to what it says.",
    );
  });

  it("is refused for an entry that inflates to less than it says", () => {
    const data = Buffer.from("hello");
    expect(
      refused(zip([{ name: "a", data, size: 50, crc: crc32(data) }])),
    ).toContain("does not match");
  });

  it("is refused for a stored entry whose size is not the size of its data", () => {
    expect(
      refused(zip([{ name: "a", data: "hello", method: 0, size: 4 }])),
    ).toContain("does not match");
    expect(
      refused(zip([{ name: "a", data: "hello", method: 0, size: 6 }])),
    ).toContain("does not match");
  });

  it("is refused for a checksum that is wrong", () => {
    expect(refused(zip([{ name: "a", data: "hello", crc: 1 }]))).toContain(
      "checksum",
    );
    const good = zip([{ name: "a", data: "hello", method: 0 }]);
    const flipped = Buffer.from(good);
    flipped[flipped.indexOf("hello")] ^= 1;
    expect(refused(flipped)).toContain("checksum");
  });

  it("is refused for a name that is not the same in the directory and in the local header", () => {
    expect(
      refused(
        zip([{ name: "harmless.txt", localName: "../../evil", data: "x" }]),
      ),
    ).toContain("two ways");
    expect(refused(zip([{ name: "a", localName: "b", data: "x" }]))).toContain(
      "two ways",
    );
  });

  it("is refused for a name that cannot be read as text", () => {
    const archive = Buffer.from(zip([{ name: "ab", data: "x" }]));
    const at = archive.indexOf("ab");
    archive[at] = 0xff;
    archive[archive.lastIndexOf("ab")] = 0xff;
    const twice = archive;
    for (let i = 0; i < twice.length - 1; i++) {
      if (twice[i] === 0x61 && twice[i + 1] === 0x62) twice[i] = 0xff;
    }
    expect(refused(twice)).toBe(
      "The archive has a file name that cannot be read.",
    );
  });

  it("is refused for an entry that starts inside another one's data, which is how a zip bomb reuses bytes", () => {
    const inner = localEntry("b", "hello world");
    const archive = zip([
      {
        name: "a",
        raw: inner,
        method: 0,
        size: inner.length,
        crc: crc32(inner),
        compressed: inner.length,
      },
      {
        name: "b",
        data: "hello world",
        method: 0,
        skipLocal: true,
        offset: 30 + 1,
      },
    ]);
    expect(refused(archive)).toContain("share the same bytes");
    // The same two entries side by side are fine.
    expect(
      read(
        zip([
          { name: "a", data: "hello world", method: 0 },
          { name: "b", data: "hello world", method: 0 },
        ]),
      ).ok,
    ).toBe(true);
  });

  it("is refused for an entry that starts inside another one's header, not only inside its data", () => {
    const inner = localEntry("b", "hello world");
    const archive = zip([
      { name: "a", data: "x", method: 0, localExtra: inner },
      {
        name: "b",
        data: "hello world",
        method: 0,
        skipLocal: true,
        offset: 30 + 1,
      },
    ]);
    expect(refused(archive)).toContain("share the same bytes");
  });

  it("reads an archive whose directory lists the entries in another order than they lie", () => {
    const archive = zip(
      [
        { name: "first", data: "one", method: 0 },
        { name: "second", data: "two", method: 0 },
        { name: "third", data: "three" },
      ],
      { reverseDirectory: true },
    );
    expect(ok(archive).map((e) => [e.path, e.data.toString()])).toEqual([
      ["third", "three"],
      ["second", "two"],
      ["first", "one"],
    ]);
  });

  it("reads an entry with an extra field after its name in the local header, which is not the directory's", () => {
    const archive = zip([
      { name: "a", data: "hello", method: 0, localExtra: Buffer.alloc(10, 7) },
      { name: "b", data: "world", localExtra: Buffer.alloc(3, 1) },
    ]);
    expect(ok(archive).map((e) => e.data.toString())).toEqual([
      "hello",
      "world",
    ]);
  });

  it("reads an entry with no name, which the caller then refuses, and its header may end where the directory starts", () => {
    expect(
      ok(zip([{ name: "", data: "", method: 0 }])).map((e) => e.path),
    ).toEqual([""]);
  });

  it("is cut off when the directory says more entries than there are, or a name longer than the directory", () => {
    expect(refused(zip([{ name: "a" }], { count: 2 }))).toBe(
      "The archive is cut off.",
    );
    const archive = Buffer.from(zip([{ name: "a", data: "x" }]));
    const at = archive.readUInt32LE(archive.length - 22 + 16);
    archive.writeUInt16LE(60_000, at + 28);
    expect(refused(archive)).toBe("The archive is cut off.");
  });

  it("is cut off when an entry starts too close to the directory to hold its header, or its data run into it", () => {
    const archive = Buffer.from(zip([{ name: "a", data: "hello", method: 0 }]));
    const at = archive.readUInt32LE(archive.length - 22 + 16);
    const short = Buffer.from(archive);
    short.writeUInt32LE(at - 10, at + 42);
    expect(refused(short)).toBe("The archive is cut off.");
    const long = Buffer.from(archive);
    long.writeUInt32LE(500, at + 20);
    expect(refused(long)).toBe("The archive is cut off.");
    // One byte more than there is.
    const exact = Buffer.from(archive);
    exact.writeUInt32LE(5 + 1, at + 20);
    expect(refused(exact)).toBe("The archive is cut off.");
  });

  it("is refused when the directory says it is on another disk", () => {
    const archive = Buffer.from(zip([{ name: "a" }]));
    archive.writeUInt16LE(1, archive.length - 22 + 6);
    expect(refused(archive)).toBe("The archive is in more than one part.");
  });

  it("is refused when the directory does not add up", () => {
    expect(
      refused(zip([{ name: "a", data: "x" }], { directoryShift: -3 })),
    ).toContain("damaged");
    expect(
      refused(zip([{ name: "a", data: "x" }], { directoryShift: 3 })),
    ).toBe("The archive is cut off.");
    const archive = Buffer.from(zip([{ name: "a", data: "hello", method: 0 }]));
    const at = archive.readUInt32LE(archive.length - 22 + 16);
    archive.writeUInt32LE(5, at + 42); // an entry that points into the middle of nothing
    expect(refused(archive)).toContain("not where the directory says");
  });

  it("is refused when it is cut off, wherever", () => {
    const archive = zip([
      { name: "a", data: "hello world ".repeat(20) },
      { name: "b", data: "more", method: 0 },
    ]);
    for (let cut = 0; cut < archive.length - 1; cut++) {
      const result = read(archive.subarray(0, cut));
      expect(result.ok).toBe(false);
    }
    expect(read(archive).ok).toBe(true);
  });

  it("says the directory is cut off when the end record points past the file", () => {
    const archive = Buffer.from(zip([{ name: "a", data: "x" }]));
    archive.writeUInt32LE(archive.length + 100, archive.length - 22 + 16);
    expect(refused(archive)).toBe("The archive is cut off.");
    const size = Buffer.from(zip([{ name: "a", data: "x" }]));
    size.writeUInt32LE(size.length, size.length - 22 + 12);
    expect(refused(size)).toBe("The archive is cut off.");
  });

  it("does not throw for anything at all", () => {
    for (const bytes of [
      Buffer.alloc(0),
      Buffer.from("not a zip"),
      Buffer.alloc(22),
      Buffer.alloc(200, 0xff),
      Buffer.alloc(2048),
    ]) {
      expect(typeof read(bytes).ok).toBe("boolean");
    }
  });

  it("does not throw for random bytes, or for a good archive with a byte changed", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const bytes = Buffer.alloc(3000);
      let x = seed;
      for (let i = 0; i < bytes.length; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        bytes[i] = x & 0xff;
      }
      expect(typeof read(bytes).ok).toBe("boolean");
    }
    const archive = zip([
      { name: "a", data: "hello world ".repeat(30) },
      { name: "b/", dosAttributes: 0x10 },
      { name: "b/c", data: "more", method: 0 },
    ]);
    for (let i = 0; i < archive.length; i++) {
      const changed = Buffer.from(archive);
      changed[i] = (changed[i] as number) ^ 0xff;
      expect(typeof read(changed).ok).toBe("boolean");
    }
  });
});

describe("the checksum", () => {
  it("is the CRC-32 that zip uses", () => {
    expect(crc32(Buffer.from(""))).toBe(0);
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.from("hello"))).toBe(0x3610a686);
    expect(crc32(Buffer.alloc(1000, 0xff))).toBe(
      crc32(Buffer.alloc(1000, 0xff)),
    );
  });
});
