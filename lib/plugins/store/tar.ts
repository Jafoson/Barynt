// A reader for tar archives, for archives another person made. It never writes anything:
// it turns bytes into a list of entries (path, kind, content) for the caller to look at, and
// it says no to anything it does not understand or that is too big. Understood: the classic
// and the ustar header, the `prefix` of ustar, PAX extended headers (`path`, `size`) and the
// GNU long name. Not understood, so refused: sizes in base-256, sparse files, and a header
// whose checksum is wrong. What each entry may be, and where it may go, is for the caller.
//
// Pure: no filesystem, no `server-only`, so the store's archive and a plugin's release are read
// by the same code and both are tested to the last case.

export type TarKind = "file" | "directory" | "symlink" | "hardlink" | "other";

export interface TarEntry {
  /** As the archive wrote it, joined with `prefix` and after a long name or a PAX `path`. */
  path: string;
  kind: TarKind;
  /** The content of a file. A view into the archive, not a copy. */
  data: Buffer;
}

export interface TarLimits {
  /** Entries that count (headers of extended records do not). */
  maxEntries: number;
  /** The sum of the sizes of all entries. */
  maxTotalBytes: number;
}

export type TarResult =
  | { ok: true; entries: TarEntry[] }
  | { ok: false; error: string };

const BLOCK = 512;

const text = (buffer: Buffer, start: number, length: number): string => {
  const slice = buffer.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end < 0 ? slice.length : end).toString("utf8");
};

/**
 * An octal field, or `null` for one that is not. Base-256, which is how a size beyond 8 GiB is
 * written, starts with a byte that is no digit, so it is refused here like any other text.
 */
function octal(buffer: Buffer, start: number, length: number): number | null {
  const raw = text(buffer, start, length).trim();
  if (raw === "") return 0;
  return /^[0-7]+$/.test(raw) ? Number.parseInt(raw, 8) : null;
}

/** The sum of the header's bytes, the checksum field counted as spaces, is what it says it is. */
function checksumOk(header: Buffer): boolean {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) {
    sum += i >= 148 && i < 156 ? 0x20 : (header[i] as number);
  }
  return sum === octal(header, 148, 8);
}

function isZeroBlock(block: Buffer): boolean {
  for (let i = 0; i < BLOCK; i++) if (block[i] !== 0) return false;
  return true;
}

/** The records of a PAX extended header: `len key=value\n`, each. Only `path` and `size` are kept. */
function paxRecords(data: Buffer): { path?: string; size?: number } | null {
  const out: { path?: string; size?: number } = {};
  let at = 0;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    if (space < 0) return null;
    const length = Number(data.subarray(at, space).toString("ascii"));
    if (!Number.isInteger(length) || length < 1 || at + length > data.length)
      return null;
    const record = data.subarray(space + 1, at + length - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals >= 0) {
      const key = record.slice(0, equals);
      const value = record.slice(equals + 1);
      if (key === "path") out.path = value;
      if (key === "size") {
        const size = Number(value);
        if (!Number.isSafeInteger(size) || size < 0) return null;
        out.size = size;
      }
    }
    at += length;
  }
  return out;
}

const KINDS: Record<string, TarKind> = {
  "0": "file",
  "\0": "file",
  "7": "file", // a "contiguous file" is a file
  "5": "directory",
  "2": "symlink",
  "1": "hardlink",
};

/**
 * The entries of a tar archive, or why it cannot be read. Never throws.
 */
export function readTar(archive: Buffer, limits: TarLimits): TarResult {
  const entries: TarEntry[] = [];
  let total = 0;
  let longName: string | null = null;
  let pax: { path?: string; size?: number } = {};
  let at = 0;

  while (at + BLOCK <= archive.length) {
    const header = archive.subarray(at, at + BLOCK);
    if (isZeroBlock(header)) return { ok: true, entries };
    if (!checksumOk(header)) {
      return {
        ok: false,
        error: `The archive is damaged (the header at ${at} does not add up).`,
      };
    }
    const flag = String.fromCharCode(header[156] as number);
    let size = octal(header, 124, 12);
    if (size === null) {
      return {
        ok: false,
        error: "The archive has a file size in a form that is not read.",
      };
    }
    // A PAX `size` overrides the field, for entries of 8 GiB and more; which this refuses below.
    if (pax.size !== undefined && flag !== "x" && flag !== "g") size = pax.size;
    const dataStart = at + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > archive.length)
      return { ok: false, error: "The archive is cut off." };
    const data = archive.subarray(dataStart, dataEnd);
    const next = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (flag === "x") {
      const records = paxRecords(data);
      if (!records)
        return {
          ok: false,
          error: "The archive has an extended header that cannot be read.",
        };
      pax = records;
      at = next;
      continue;
    }
    if (flag === "g") {
      // Global extended headers (GitHub writes the commit there) carry nothing that is used.
      if (!paxRecords(data))
        return {
          ok: false,
          error: "The archive has an extended header that cannot be read.",
        };
      at = next;
      continue;
    }
    if (flag === "L") {
      longName = text(data, 0, data.length);
      at = next;
      continue;
    }
    if (flag === "K") {
      at = next;
      continue;
    }

    if (entries.length >= limits.maxEntries) {
      return {
        ok: false,
        error: `The archive has more than ${limits.maxEntries} entries.`,
      };
    }
    const kind: TarKind = KINDS[flag] ?? "other";
    total += kind === "file" ? size : 0;
    if (total > limits.maxTotalBytes) {
      return {
        ok: false,
        error: `The archive holds more than ${limits.maxTotalBytes} bytes.`,
      };
    }
    let path = text(header, 0, 100);
    const magic = text(header, 257, 6);
    if (magic.startsWith("ustar")) {
      const prefix = text(header, 345, 155);
      if (prefix) path = `${prefix}/${path}`;
    }
    if (longName !== null) path = longName;
    if (pax.path !== undefined) path = pax.path;
    longName = null;
    pax = {};

    entries.push({
      path,
      kind,
      data: kind === "file" ? data : archive.subarray(dataStart, dataStart),
    });
    at = next;
  }
  // No end-of-archive block: tolerated at a block boundary (some writers leave it out).
  return at === archive.length
    ? { ok: true, entries }
    : { ok: false, error: "The archive is cut off." };
}

/**
 * A path from an archive, made safe to use below a directory of ours: one that is relative,
 * without `..`, without a backslash or a control character, not too long or too deep. `.`
 * and empty parts are dropped. `null` for one that cannot be made safe.
 */
export function cleanEntryPath(path: string): string | null {
  if (path.length > 512) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: this is exactly what is refused
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return null;
  if (path.startsWith("/")) return null;
  const parts = path.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.length === 0 || parts.length > 32) return null;
  if (parts.some((part) => part === ".." || part.length > 255)) return null;
  return parts.join("/");
}
