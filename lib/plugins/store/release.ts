import { gunzipSync } from "node:zlib";
import { cleanEntryPath, readTar, type TarEntry } from "./tar";
import { readZip } from "./zip";

// A plugin's release archive, read and checked before anything of it is written: the download
// (already checked against the hash the store pinned) is a `.tgz`, `.tar.gz` or `.zip`, and what
// is in it is a plugin directory with `barynt-plugin.json` at its root. Unlike the archive of a
// store, where everything but three kinds of file is left out, a release is *all* code that may
// run, so anything that is not a plain file or directory refuses the whole archive: a symlink, a
// hard link, a device, a path that leaves the directory, two entries for one file. The limits are
// the ones `hashPluginDirectory` enforces (`lib/plugins/integrity.ts`), so what is accepted here
// can be hashed and approved, and nothing is accepted that could not be.
//
// Pure: no filesystem, no `server-only`. Writing the files is `stageRelease.ts`.

export const RELEASE_LIMITS = {
  /** The archive as downloaded. The store asks authors for at most this much. */
  maxDownloadBytes: 50 * 1024 * 1024,
  /** Files, as `hashPluginDirectory` counts them. */
  maxFiles: 5000,
  /** Everything in the archive, directories included. */
  maxEntries: 10_000,
  /** Directory levels below the plugin directory. */
  maxDepth: 12,
  maxFileBytes: 32 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
} as const;

/** The manifest, which every release has at its root. */
export const RELEASE_MANIFEST = "barynt-plugin.json";

export type ReleaseEntries =
  | { ok: true; entries: TarEntry[] }
  | { ok: false; error: string };

/** The entries of a `.tgz` or a `.zip`, by what the first bytes say it is. */
export function readRelease(archive: Buffer): ReleaseEntries {
  if (archive[0] === 0x1f && archive[1] === 0x8b) {
    let tar: Buffer;
    try {
      tar = gunzipSync(archive, {
        maxOutputLength: RELEASE_LIMITS.maxTotalBytes * 2,
      });
    } catch (error) {
      const tooBig =
        (error as { code?: string } | null)?.code === "ERR_BUFFER_TOO_LARGE";
      return {
        ok: false,
        error: tooBig
          ? "The release is larger than a plugin may be once unpacked."
          : "The release is not a gzip archive that can be read.",
      };
    }
    return readTar(tar, {
      maxEntries: RELEASE_LIMITS.maxEntries,
      maxTotalBytes: RELEASE_LIMITS.maxTotalBytes,
    });
  }
  if (archive[0] === 0x50 && archive[1] === 0x4b) {
    return readZip(archive, {
      maxEntries: RELEASE_LIMITS.maxEntries,
      maxTotalBytes: RELEASE_LIMITS.maxTotalBytes,
      maxEntryBytes: RELEASE_LIMITS.maxFileBytes,
    });
  }
  return {
    ok: false,
    error: "The release is not a .tgz, .tar.gz or .zip archive.",
  };
}

export interface ReleaseFile {
  /** Relative, with `/`, cleaned. */
  path: string;
  data: Buffer;
}

export type ReleasePlan =
  | { ok: true; files: ReleaseFile[] }
  | { ok: false; error: string };

const refuse = (error: string): ReleasePlan => ({ ok: false, error });

/**
 * The files to write for a release's entries, or why the archive is refused. Directories only
 * name where files go (an empty one is not part of a plugin's hash), so they are checked and
 * then left out.
 */
export function planRelease(entries: readonly TarEntry[]): ReleasePlan {
  const files = new Map<string, ReleaseFile>();
  // Lower case, so that names that differ only in case, which are one on some systems, are found.
  const loweredFiles = new Set<string>();
  const loweredDirectories = new Set<string>();
  let total = 0;

  /** Notes that `directory` is one; `false` if it is a file, however it is spelled. */
  const addDirectory = (directory: string): boolean => {
    if (loweredFiles.has(directory.toLowerCase())) return false;
    loweredDirectories.add(directory.toLowerCase());
    return true;
  };

  for (const entry of entries) {
    // `tar czf plugin.tgz .` writes an entry for the directory itself.
    if (entry.kind === "directory" && /^(?:\.\/?)+$/.test(entry.path)) continue;
    const path = cleanEntryPath(entry.path);
    if (path === null) {
      return refuse("The release has a file with a name that cannot be used.");
    }
    if (entry.kind !== "file" && entry.kind !== "directory") {
      return refuse(
        `The release has a ${entry.kind === "other" ? "special file" : "link"} (${path}), which a plugin may not have.`,
      );
    }
    const parts = path.split("/");
    const levels = parts.length - (entry.kind === "file" ? 1 : 0);
    if (levels > RELEASE_LIMITS.maxDepth) {
      return refuse(
        `The release has a file more than ${RELEASE_LIMITS.maxDepth} directories deep.`,
      );
    }
    // Every directory above it, and the entry itself if it is one.
    const directories = parts.slice(0, entry.kind === "file" ? -1 : undefined);
    for (let n = 1; n <= directories.length; n++) {
      const directory = directories.slice(0, n).join("/");
      if (!addDirectory(directory)) {
        return refuse(
          `The release has ${directory} as a file and as a directory.`,
        );
      }
    }
    if (entry.kind === "directory") continue;

    if (files.has(path)) {
      return refuse(`The release holds ${path} twice.`);
    }
    if (loweredDirectories.has(path.toLowerCase())) {
      return refuse(`The release has ${path} as a file and as a directory.`);
    }
    if (loweredFiles.has(path.toLowerCase())) {
      return refuse(
        `The release has two files whose names differ only in case (${path}).`,
      );
    }
    if (files.size >= RELEASE_LIMITS.maxFiles) {
      return refuse(
        `The release has more than ${RELEASE_LIMITS.maxFiles} files.`,
      );
    }
    if (entry.data.length > RELEASE_LIMITS.maxFileBytes) {
      return refuse(
        `${path} is larger than ${RELEASE_LIMITS.maxFileBytes / (1024 * 1024)} MiB.`,
      );
    }
    total += entry.data.length;
    if (total > RELEASE_LIMITS.maxTotalBytes) {
      return refuse(
        `The release is larger than ${RELEASE_LIMITS.maxTotalBytes / (1024 * 1024)} MiB once unpacked.`,
      );
    }
    loweredFiles.add(path.toLowerCase());
    files.set(path, { path, data: entry.data });
  }

  if (!files.has(RELEASE_MANIFEST)) {
    return refuse(
      `The release has no ${RELEASE_MANIFEST} at its root, so it is not a plugin.`,
    );
  }
  return {
    ok: true,
    files: [...files.values()].sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
}
