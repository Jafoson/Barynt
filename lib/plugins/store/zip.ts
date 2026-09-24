import { inflateRawSync } from "node:zlib";
import type { TarEntry, TarKind } from "./tar";

// A reader for zip archives, for archives another person made (a plugin's release, when the
// author published a `.zip`). Like `tar.ts` it never writes anything: it turns bytes into a list
// of entries for the caller to look at, and says no to anything it does not understand or that is
// too big. Understood: stored and deflated entries, sizes and names from the central directory
// (which is where every reader looks, so this one cannot be shown something else than the rest of
// the world sees), UTF-8 names, and the Unix file type in the attributes, so a symlink is a
// symlink. Not understood, so refused: zip64, archives in more than one part, encrypted entries,
// any other compression method, a checksum that is wrong, a name in the local header that is not
// the one in the central directory, entries whose data overlap, and an entry that inflates to more
// or less than it says.
//
// Pure: no filesystem, no `server-only`, so it is tested to the last case.

export type ZipEntry = TarEntry;

export interface ZipLimits {
  /** Entries in the archive, directories included. */
  maxEntries: number;
  /** The sum of the sizes of the files once inflated. */
  maxTotalBytes: number;
  /** One file once inflated. */
  maxEntryBytes: number;
}

export type ZipResult =
  | { ok: true; entries: ZipEntry[] }
  | { ok: false; error: string };

const END_OF_DIRECTORY = 0x06054b50;
const CENTRAL_ENTRY = 0x02014b50;
const LOCAL_ENTRY = 0x04034b50;
const END_LENGTH = 22;
const CENTRAL_LENGTH = 46;
const LOCAL_LENGTH = 30;
/** The comment after the end record may be this long. */
const MAX_COMMENT = 0xffff;

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 zip uses, of `data`. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** What kind of entry it is, by the Unix mode in the attributes when there is one. */
function kindOf(name: string, madeBy: number, attributes: number): TarKind {
  const unix = madeBy >>> 8 === 3;
  if (unix) {
    switch ((attributes >>> 16) & 0xf000) {
      case 0xa000:
        return "symlink";
      case 0x4000:
        return "directory";
      case 0x8000:
      case 0:
        break;
      default:
        return "other";
    }
  } else if ((attributes & 0x10) !== 0) {
    return "directory";
  }
  return name.endsWith("/") ? "directory" : "file";
}

interface Central {
  name: string;
  kind: TarKind;
  flags: number;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
}

const cutOff = { ok: false, error: "The archive is cut off." } as const;

/**
 * The entries of a zip archive, or why it cannot be read. Never throws.
 */
export function readZip(archive: Buffer, limits: ZipLimits): ZipResult {
  try {
    return parse(archive, limits);
  } catch {
    // Every read is checked against the length first; this is for the one that was not.
    return { ok: false, error: "The archive is damaged." };
  }
}

function parse(archive: Buffer, limits: ZipLimits): ZipResult {
  // The end record is the last thing in the file, before a comment that may be up to 64 KiB.
  // Only one whose comment reaches exactly to the end of the file is the end record: bytes that
  // look like one inside a comment, or something after the archive, are not what every other
  // reader would take for it either.
  let end = -1;
  const from = Math.max(0, archive.length - END_LENGTH - MAX_COMMENT);
  for (let at = archive.length - END_LENGTH; at >= from; at--) {
    if (
      archive.readUInt32LE(at) === END_OF_DIRECTORY &&
      at + END_LENGTH + archive.readUInt16LE(at + 20) === archive.length
    ) {
      end = at;
      break;
    }
  }
  if (end < 0) return { ok: false, error: "The archive is not a zip archive." };

  const disk = archive.readUInt16LE(end + 4);
  const directoryDisk = archive.readUInt16LE(end + 6);
  const onThisDisk = archive.readUInt16LE(end + 8);
  const total = archive.readUInt16LE(end + 10);
  const directorySize = archive.readUInt32LE(end + 12);
  const directoryOffset = archive.readUInt32LE(end + 16);
  if (disk !== 0 || directoryDisk !== 0 || onThisDisk !== total) {
    return { ok: false, error: "The archive is in more than one part." };
  }
  if (
    total === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    return {
      ok: false,
      error: "The archive is a zip64 archive, which is not read.",
    };
  }
  if (total > limits.maxEntries) {
    return {
      ok: false,
      error: `The archive has more than ${limits.maxEntries} entries.`,
    };
  }
  if (directoryOffset + directorySize > end) return cutOff;

  // The central directory: what every entry is, in one place.
  const centrals: Central[] = [];
  let at = directoryOffset;
  for (let index = 0; index < total; index++) {
    if (at + CENTRAL_LENGTH > end) return cutOff;
    if (archive.readUInt32LE(at) !== CENTRAL_ENTRY) {
      return {
        ok: false,
        error: "The archive is damaged (its directory does not add up).",
      };
    }
    const madeBy = archive.readUInt16LE(at + 4);
    const flags = archive.readUInt16LE(at + 8);
    const method = archive.readUInt16LE(at + 10);
    const crc = archive.readUInt32LE(at + 16);
    const compressed = archive.readUInt32LE(at + 20);
    const size = archive.readUInt32LE(at + 24);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const diskStart = archive.readUInt16LE(at + 34);
    const attributes = archive.readUInt32LE(at + 38);
    const offset = archive.readUInt32LE(at + 42);
    const next = at + CENTRAL_LENGTH + nameLength + extraLength + commentLength;
    if (next > end) return cutOff;
    if (diskStart !== 0) {
      return { ok: false, error: "The archive is in more than one part." };
    }
    if (
      compressed === 0xffffffff ||
      size === 0xffffffff ||
      offset === 0xffffffff
    ) {
      return {
        ok: false,
        error: "The archive is a zip64 archive, which is not read.",
      };
    }
    const name = archive
      .subarray(at + CENTRAL_LENGTH, at + CENTRAL_LENGTH + nameLength)
      .toString("utf8");
    if (name.includes("\uFFFD")) {
      return {
        ok: false,
        error: "The archive has a file name that cannot be read.",
      };
    }
    centrals.push({
      name,
      kind: kindOf(name, madeBy, attributes),
      flags,
      method,
      crc,
      compressed,
      size,
      offset,
    });
    at = next;
  }

  const entries: ZipEntry[] = [];
  let totalBytes = 0;
  // The places the entries' data lie, to see that no two share a byte.
  const spans: [number, number][] = [];
  for (const central of centrals) {
    if ((central.flags & 1) !== 0) {
      return {
        ok: false,
        error: "The archive has an encrypted file, which is not read.",
      };
    }
    if (central.method !== 0 && central.method !== 8) {
      return {
        ok: false,
        error: `The archive has a file compressed in a way that is not read (method ${central.method}).`,
      };
    }
    if (central.offset + LOCAL_LENGTH > directoryOffset) return cutOff;
    if (archive.readUInt32LE(central.offset) !== LOCAL_ENTRY) {
      return {
        ok: false,
        error:
          "The archive is damaged (a file is not where the directory says).",
      };
    }
    const nameLength = archive.readUInt16LE(central.offset + 26);
    const extraLength = archive.readUInt16LE(central.offset + 28);
    const localName = archive
      .subarray(
        central.offset + LOCAL_LENGTH,
        central.offset + LOCAL_LENGTH + nameLength,
      )
      .toString("utf8");
    if (localName !== central.name) {
      return {
        ok: false,
        error:
          "The archive names a file in two ways, so it cannot be told what it holds.",
      };
    }
    const start = central.offset + LOCAL_LENGTH + nameLength + extraLength;
    const stop = start + central.compressed;
    if (stop > directoryOffset) return cutOff;
    spans.push([central.offset, stop]);

    if (central.kind !== "file") {
      // A directory, a link or a special file has no content that is ever used.
      entries.push({
        path: central.name,
        kind: central.kind,
        data: archive.subarray(start, start),
      });
      continue;
    }
    if (central.size > limits.maxEntryBytes) {
      return {
        ok: false,
        error: `The archive has a file larger than ${limits.maxEntryBytes} bytes.`,
      };
    }
    totalBytes += central.size;
    if (totalBytes > limits.maxTotalBytes) {
      return {
        ok: false,
        error: `The archive holds more than ${limits.maxTotalBytes} bytes.`,
      };
    }
    const stored = archive.subarray(start, stop);
    let data: Buffer;
    if (central.method === 0) {
      data = stored;
    } else {
      try {
        // Never more than it says it is: a small entry cannot inflate to gigabytes.
        data = inflateRawSync(stored, {
          maxOutputLength: Math.max(central.size, 1),
        });
      } catch {
        return {
          ok: false,
          error:
            "The archive has a file that does not inflate to what it says.",
        };
      }
    }
    if (data.length !== central.size || crc32(data) !== central.crc) {
      return {
        ok: false,
        error:
          "The archive is damaged (a file does not match its checksum or size).",
      };
    }
    entries.push({ path: central.name, kind: "file", data });
  }

  spans.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) {
    if (
      (spans[i] as [number, number])[0] < (spans[i - 1] as [number, number])[1]
    ) {
      return {
        ok: false,
        error: "The archive is damaged (two files share the same bytes).",
      };
    }
  }
  return { ok: true, entries };
}
