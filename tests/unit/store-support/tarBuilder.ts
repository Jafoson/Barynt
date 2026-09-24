import { gzipSync } from "node:zlib";

// A tar writer for tests, with everything a hostile or odd archive can do: any type flag,
// a symlink, a path that leaves the directory, a long name, a `prefix`, a PAX header, a wrong
// checksum, a cut-off end. Not for use outside tests.

const BLOCK = 512;

export interface Header {
  name: string;
  data?: Buffer | string;
  /** The type flag, as a character. Default "0" (a file). */
  flag?: string;
  linkname?: string;
  /** Put this in the ustar `prefix` field instead of in the name. */
  prefix?: string;
  /** Leave the checksum wrong. */
  badChecksum?: boolean;
  /** The size field as text, when it should not be the size of the data. */
  sizeField?: string;
  /** Write no `ustar` magic (the classic header). */
  classic?: boolean;
}

const field = (
  target: Buffer,
  value: string,
  start: number,
  length: number,
) => {
  target.write(value.slice(0, length), start, "utf8");
};

export function header(h: Header): Buffer {
  const data = Buffer.isBuffer(h.data) ? h.data : Buffer.from(h.data ?? "");
  const block = Buffer.alloc(BLOCK);
  field(block, h.name, 0, 100);
  field(block, "0000644", 100, 8);
  field(block, "0000000", 108, 8);
  field(block, "0000000", 116, 8);
  field(
    block,
    h.sizeField ?? `${data.length.toString(8).padStart(11, "0")}`,
    124,
    12,
  );
  field(block, "00000000000", 136, 12);
  block.fill(0x20, 148, 156);
  block[156] = (h.flag ?? "0").charCodeAt(0);
  if (h.linkname) field(block, h.linkname, 157, 100);
  if (!h.classic) {
    field(block, "ustar", 257, 6);
    field(block, "00", 263, 2);
    if (h.prefix) field(block, h.prefix, 345, 155);
  }
  let sum = 0;
  for (const byte of block) sum += byte;
  field(
    block,
    `${(h.badChecksum ? sum + 1 : sum).toString(8).padStart(6, "0")}\0 `,
    148,
    8,
  );
  return block;
}

const pad = (data: Buffer): Buffer => {
  const rest = data.length % BLOCK;
  return rest === 0 ? data : Buffer.concat([data, Buffer.alloc(BLOCK - rest)]);
};

/** One entry: its header and its content, padded. */
export function entry(h: Header): Buffer {
  const data = Buffer.isBuffer(h.data) ? h.data : Buffer.from(h.data ?? "");
  return Buffer.concat([header(h), pad(data)]);
}

/** A PAX extended header with the records `{ path, size, ... }`. */
export function pax(records: Record<string, string>, flag = "x"): Buffer {
  const lines = Object.entries(records).map(([key, value]) => {
    const body = ` ${key}=${value}\n`;
    const size = Buffer.byteLength(body);
    // The length counts its own digits, so it is found by trying.
    let length = size + 1;
    while (Buffer.byteLength(`${length}${body}`) !== length) {
      length = Buffer.byteLength(`${length}${body}`);
    }
    return `${length}${body}`;
  });
  return entry({ name: "pax", flag, data: lines.join("") });
}

/** A GNU long name for the entry that follows. */
export function longName(name: string): Buffer {
  return entry({ name: "././@LongLink", flag: "L", data: `${name}\0` });
}

const END = Buffer.alloc(BLOCK * 2);

export const tar = (...parts: Buffer[]): Buffer =>
  Buffer.concat([...parts, END]);
export const tgz = (...parts: Buffer[]): Buffer => gzipSync(tar(...parts));

/** Writes the right checksum into a header block that was changed by hand. */
export function fixChecksum(block: Buffer): Buffer {
  block.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return block;
}
