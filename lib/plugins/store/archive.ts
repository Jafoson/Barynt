import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { STORE_PLUGIN_ID } from "./format";
import { MAX_STORE_ENTRIES, MAX_STORE_FILE_BYTES } from "./reader";
import { cleanEntryPath, readTar } from "./tar";

// Unpacks a store's archive into a directory of ours, **only what a store is made of**:
// `store.json` and, for each plugin, `barynt-plugin.json` and `source.json`. Everything else
// in the archive (the readme, workflows, other files, symlinks, whatever the repository
// holds) is not written at all, so nothing in it can end up on the disk of the instance, be
// followed, or be run. Where a file goes is decided here from the names we allow, never
// from a path the archive wrote, so there is no `../` and no absolute path to be careful about.

/** A store's archive, unpacked: it is a few hundred small files, so this is generous. */
const MAX_UNPACKED_BYTES = 128 * 1024 * 1024;

export type Unpacked =
  | { ok: true; files: number }
  | { ok: false; error: string };

/** `store.json`, or `plugins/<id>/<file>`, for the part of the path after the archive's root directory. */
function target(relative: string): string | null {
  if (relative === "store.json") return relative;
  const match = relative.match(
    /^plugins\/([^/]+)\/(barynt-plugin\.json|source\.json)$/,
  );
  if (match && STORE_PLUGIN_ID.test(match[1] as string)) return relative;
  return null;
}

/**
 * Writes the files of a store from the gzipped tar `archive` into `dest`, which has to be
 * an empty directory that is ours. Never throws.
 */
export async function unpackStoreArchive(
  archive: Buffer,
  dest: string,
  options: { maxUnpackedBytes?: number } = {},
): Promise<Unpacked> {
  const maxUnpacked = options.maxUnpackedBytes ?? MAX_UNPACKED_BYTES;
  let tar: Buffer;
  try {
    tar = gunzipSync(archive, { maxOutputLength: maxUnpacked });
  } catch (error) {
    const tooBig =
      (error as { code?: string } | null)?.code === "ERR_BUFFER_TOO_LARGE";
    return {
      ok: false,
      error: tooBig
        ? "The store's archive is larger than a store may be once unpacked."
        : "The store's archive is not a gzip archive.",
    };
  }

  const read = readTar(tar, {
    // A repository can hold far more than the store's own files; those are skipped.
    maxEntries: 200_000,
    maxTotalBytes: maxUnpacked,
  });
  if (!read.ok) return { ok: false, error: read.error };

  // A repository's archive has one directory at the top; everything is below it.
  let root: string | null = null;
  const wanted = new Map<string, Buffer>();
  for (const entry of read.entries) {
    const clean = cleanEntryPath(entry.path);
    if (clean === null) {
      return {
        ok: false,
        error:
          "The store's archive has a file with a name that cannot be used.",
      };
    }
    const [top, ...rest] = clean.split("/") as [string, ...string[]];
    if (root === null) root = top;
    else if (top !== root) {
      return {
        ok: false,
        error: "The store's archive has more than one top-level directory.",
      };
    }
    if (entry.kind !== "file" || rest.length === 0) continue;
    const place = target(rest.join("/"));
    if (place === null) continue;
    if (wanted.has(place)) {
      return { ok: false, error: `The store's archive holds ${place} twice.` };
    }
    if (entry.data.length > MAX_STORE_FILE_BYTES) {
      return {
        ok: false,
        error: `${place} is larger than ${MAX_STORE_FILE_BYTES / 1024} KiB.`,
      };
    }
    if (wanted.size >= MAX_STORE_ENTRIES * 2 + 1) {
      return {
        ok: false,
        error: `The store's archive has more than ${MAX_STORE_ENTRIES} entries.`,
      };
    }
    wanted.set(place, entry.data);
  }
  if (!wanted.has("store.json")) {
    return {
      ok: false,
      error: "The archive is no store: it has no store.json.",
    };
  }

  try {
    for (const [place, data] of wanted) {
      const file = join(/* turbopackIgnore: true */ dest, place);
      await mkdir(/* turbopackIgnore: true */ dirname(file), {
        recursive: true,
      });
      await writeFile(/* turbopackIgnore: true */ file, data, {
        mode: 0o644,
        flag: "wx",
      });
    }
  } catch {
    return { ok: false, error: "The store's files could not be written." };
  }
  return { ok: true, files: wanted.size };
}
