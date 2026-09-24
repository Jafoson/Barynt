import { deflateRawSync } from "node:zlib";
import { crc32 } from "@/lib/plugins/store/zip";

// A zip writer for tests, with everything a hostile or odd archive can do: a symlink, a name that
// is not the same in the two places it is written, a wrong checksum or size, an encrypted flag, a
// method that is not read, a data descriptor, entries that overlap, zip64 markers, a cut-off
// directory. Not for use outside tests.

export interface ZipFile {
  name: string;
  data?: Buffer | string;
  /** 0 stored, 8 deflated (the default). */
  method?: number;
  /** The Unix mode, such as `0o120777` for a symlink. Sets the host to Unix. */
  unixMode?: number;
  /** The MS-DOS attributes, for an archive that was not made on Unix. */
  dosAttributes?: number;
  flags?: number;
  /** A checksum that is not the right one. */
  crc?: number;
  /** A size that is not the right one. */
  size?: number;
  compressed?: number;
  /** The name written in the local header, when it should not be the one in the directory. */
  localName?: string;
  /** Write the sizes as zero in the local header and set the data descriptor flag. */
  descriptor?: boolean;
  /** Write no local entry: the directory points at `offset`, which lies inside another entry. */
  skipLocal?: boolean;
  /** Where the directory says the local entry is. */
  offset?: number;
  /** Bytes in the local header's extra field, after the name. */
  localExtra?: Buffer;
  /** Bytes of data to use as they are, not stored or deflated. */
  raw?: Buffer;
}

export interface ZipOptions {
  comment?: string;
  /** Write a directory offset of 0xffffffff. */
  zip64?: boolean;
  disk?: number;
  /** Leave the end record out. */
  noEnd?: boolean;
  /** The number of entries the end record says. */
  count?: number;
  /** Move the central directory this far, so it does not add up. */
  directoryShift?: number;
  /** List the entries in the directory in the opposite order of where they lie. */
  reverseDirectory?: boolean;
}

export function zip(files: ZipFile[], options: ZipOptions = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data ?? "");
    const method = file.method ?? 8;
    const stored =
      file.raw ??
      (method === 8 ? deflateRawSync(data) : method === 0 ? data : data);
    const name = Buffer.from(file.name);
    const localName = Buffer.from(file.localName ?? file.name);
    const crc = file.crc ?? crc32(data);
    const size = file.size ?? data.length;
    const compressed = file.compressed ?? stored.length;
    const flags = (file.flags ?? 0) | (file.descriptor ? 8 : 0);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    if (!file.descriptor) {
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed, 18);
      local.writeUInt32LE(size, 22);
    }
    local.writeUInt16LE(localName.length, 26);
    const extra = file.localExtra ?? Buffer.alloc(0);
    local.writeUInt16LE(extra.length, 28);
    const at = file.offset ?? offset;
    const body = Buffer.concat([local, localName, extra, stored]);
    const descriptor = file.descriptor
      ? (() => {
          const d = Buffer.alloc(16);
          d.writeUInt32LE(0x08074b50, 0);
          d.writeUInt32LE(crc, 4);
          d.writeUInt32LE(compressed, 8);
          d.writeUInt32LE(size, 12);
          return d;
        })()
      : Buffer.alloc(0);
    if (!file.skipLocal) {
      locals.push(body, descriptor);
      offset += body.length + descriptor.length;
    }

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    const unix = file.unixMode !== undefined;
    central.writeUInt16LE(unix ? (3 << 8) | 20 : 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(
      unix
        ? ((file.unixMode as number) << 16) >>> 0
        : (file.dosAttributes ?? 0),
      38,
    );
    central.writeUInt32LE(at, 42);
    centrals.push(Buffer.concat([central, name]));
  }
  const directory = Buffer.concat(
    options.reverseDirectory ? centrals.reverse() : centrals,
  );
  const end = Buffer.alloc(22);
  const comment = Buffer.from(options.comment ?? "");
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(options.disk ?? 0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(options.count ?? files.length, 8);
  end.writeUInt16LE(options.count ?? files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(
    options.zip64 ? 0xffffffff : offset + (options.directoryShift ?? 0),
    16,
  );
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([
    ...locals,
    directory,
    ...(options.noEnd ? [] : [end, comment]),
  ]);
}

/** A local entry (header and stored data), for one that is written inside the data of another. */
export function localEntry(name: string, data: string): Buffer {
  const bytes = Buffer.from(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt32LE(crc32(bytes), 14);
  header.writeUInt32LE(bytes.length, 18);
  header.writeUInt32LE(bytes.length, 22);
  header.writeUInt16LE(Buffer.byteLength(name), 26);
  return Buffer.concat([header, Buffer.from(name), bytes]);
}
