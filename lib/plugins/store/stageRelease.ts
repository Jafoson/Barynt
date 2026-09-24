import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { errorCode, MAX_MANIFEST_BYTES } from "../discovery";
import { hashPluginDirectory } from "../integrity";
import {
  type PluginManifest,
  pluginIdSchema,
  pluginVersionSchema,
} from "../manifest";
import { formatIssues, parseManifest } from "../validate";
import { type DownloadDeps, safeDownload } from "./fetch";
import {
  planRelease,
  RELEASE_LIMITS,
  RELEASE_MANIFEST,
  type ReleaseFile,
  readRelease,
} from "./release";
import { realDirectory, removeLeftovers } from "./workdir";

// Getting a plugin's release from a store entry to a directory in the plugin directory, in two
// steps so that nothing is written before everything that can be checked without a disk has been:
//
//  1. `verifyRelease`: download the archive the entry names, check it against the SHA-512 the store
//     pinned (a release that was changed afterwards is refused instead of installed), read it,
//     check what it holds, and check the manifest inside against the manifest the store lists.
//     Nothing is written.
//  2. `placeRelease`: write the files into a fresh directory of ours, hash it the way an installed
//     plugin is hashed (`Plugin.integrity`), and move it to `<plugins>/<id>/<version>` in one step.
//
// Nothing here runs anything from the release, and nothing here decides that it may be installed:
// the action that calls it checks who may, what the plugin needs and what it would break, and
// records it. A plugin from a private store is downloaded without the store's token: a release
// link is not the store's host, and a token is only ever sent to the host it was given for.

/** What a staging directory is called, and so what a leftover of an earlier run is called. */
const STAGING_PREFIX = "release-";

export type StageCode = "download" | "hash" | "archive" | "manifest" | "disk";

export interface VerifiedRelease {
  /** The files, by path, as they are to be written. */
  files: ReleaseFile[];
  /** The manifest inside the release, which is the manifest the store lists. */
  manifest: PluginManifest;
  /** SHA-512 of the archive, hex: what the store pinned, and what it was checked against. */
  archiveSha512: string;
}

export type Verified =
  | { ok: true; release: VerifiedRelease }
  | { ok: false; error: string; code: StageCode };

const failed = (code: StageCode, error: string): Verified => ({
  ok: false,
  error,
  code,
});

/** Whether `hex` (128 hex characters) is the SHA-512 of `data`, compared without leaking where they differ. */
function hashMatches(data: Buffer, hex: string): boolean {
  if (!/^[0-9a-f]{128}$/.test(hex)) return false;
  const actual = createHash("sha512").update(data).digest();
  return timingSafeEqual(actual, Buffer.from(hex, "hex"));
}

/**
 * Downloads and checks a release: `download` and `sha512` are from the store's entry, `expected`
 * is the manifest the store lists for it. Never throws.
 */
export async function verifyRelease(
  input: { download: string; sha512: string; expected: PluginManifest },
  deps?: DownloadDeps,
): Promise<Verified> {
  const download = await safeDownload(
    input.download,
    { maxBytes: RELEASE_LIMITS.maxDownloadBytes, timeoutMs: 120_000 },
    deps,
  );
  if (!download.ok) return failed("download", download.error);

  if (!hashMatches(download.data, input.sha512)) {
    return failed(
      "hash",
      "The release does not match the hash the store pinned for it, so it was not installed. It may have been changed after the store listed it.",
    );
  }

  const read = readRelease(download.data);
  if (!read.ok) return failed("archive", read.error);
  const plan = planRelease(read.entries);
  if (!plan.ok) return failed("archive", plan.error);

  // A plan has the manifest, or there is no plan.
  const file = plan.files.find(
    (f) => f.path === RELEASE_MANIFEST,
  ) as ReleaseFile;
  if (file.data.length > MAX_MANIFEST_BYTES) {
    return failed(
      "manifest",
      `The release's ${RELEASE_MANIFEST} is larger than ${MAX_MANIFEST_BYTES / 1024} KiB.`,
    );
  }
  const parsed = parseManifest(file.data.toString("utf8"));
  if (!parsed.ok) {
    return failed(
      "manifest",
      `The release's ${RELEASE_MANIFEST} is not valid: ${formatIssues(parsed.issues).join("; ")}.`,
    );
  }
  // What the admin was shown is what is installed: any difference, in the version, what it asks
  // for, where it applies, whether it has code, is a release that is not what the store lists.
  if (!isDeepStrictEqual(parsed.manifest, input.expected)) {
    return failed(
      "manifest",
      `The ${RELEASE_MANIFEST} in the release is not the one the store lists for it, so it was not installed.`,
    );
  }
  return {
    ok: true,
    release: {
      files: plan.files,
      manifest: parsed.manifest,
      archiveSha512: input.sha512,
    },
  };
}

export type Placed =
  | {
      ok: true;
      /** `<plugins>/<id>/<version>`. */
      dir: string;
      /** The hash of the files, as `Plugin.integrity` holds it. */
      integrity: string;
      /** `false` when the same files were already there and nothing was written. */
      created: boolean;
    }
  | { ok: false; error: string };

const notPlaced = (error: string): Placed => ({ ok: false, error });

/**
 * Writes a verified release to `<pluginsDir>/<id>/<version>`. It is written next to where it goes
 * (`.staging`), hashed, and moved in with one rename, so a directory that is there is either all
 * of a release or not there. A version that is already there is left alone: the same files are
 * fine (nothing is written), other files are refused, because whoever put them there did not go
 * through this. Never throws.
 */
export async function placeRelease(input: {
  pluginsDir: string;
  id: string;
  version: string;
  files: readonly ReleaseFile[];
}): Promise<Placed> {
  // Both become path parts, so they are checked here and not left to the caller.
  if (
    !pluginIdSchema.safeParse(input.id).success ||
    !pluginVersionSchema.safeParse(input.version).success
  ) {
    return notPlaced("Invalid plugin id or version.");
  }
  let staging: string | null = null;
  try {
    const stagingRoot = await realDirectory(join(input.pluginsDir, ".staging"));
    if (stagingRoot === null) {
      return notPlaced("The staging directory is not a directory.");
    }
    await removeLeftovers(
      stagingRoot,
      (name) => name.startsWith(STAGING_PREFIX),
      Date.now(),
    );

    staging = await mkdtemp(
      /* turbopackIgnore: true */ join(stagingRoot, STAGING_PREFIX),
    );
    for (const file of input.files) {
      const target = join(staging, file.path);
      await mkdir(/* turbopackIgnore: true */ dirname(target), {
        recursive: true,
      });
      await writeFile(/* turbopackIgnore: true */ target, file.data, {
        mode: 0o644,
        flag: "wx",
      });
    }
    const hashed = await hashPluginDirectory(staging);
    if (!hashed.ok) {
      return notPlaced(
        `The plugin's files are not acceptable: ${hashed.issue}.`,
      );
    }

    const pluginDir = await realDirectory(join(input.pluginsDir, input.id));
    if (pluginDir === null) {
      return notPlaced(
        `${input.id} in the plugin directory is not a directory.`,
      );
    }
    const dir = join(pluginDir, input.version);
    const there = await lstat(/* turbopackIgnore: true */ dir).catch(
      (error) => error,
    );
    if (!(there instanceof Error)) {
      const existing = await hashPluginDirectory(dir);
      if (existing.ok && existing.digest === hashed.digest) {
        return { ok: true, dir, integrity: hashed.digest, created: false };
      }
      return notPlaced(
        `A different copy of ${input.id} ${input.version} is already in the plugin directory. Remove it, or install another version.`,
      );
    }
    if (errorCode(there) !== "ENOENT") throw there;

    await rename(/* turbopackIgnore: true */ staging, dir);
    return { ok: true, dir, integrity: hashed.digest, created: true };
  } catch (error) {
    return notPlaced(
      `The plugin could not be put in the plugin directory (${errorCode(error)}).`,
    );
  } finally {
    // Gone already when it was moved into place, which `force` does not mind.
    if (staging !== null) {
      await rm(/* turbopackIgnore: true */ staging, {
        recursive: true,
        force: true,
      }).catch(() => {});
    }
  }
}
