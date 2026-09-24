import "server-only";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { compare } from "semver";
import { errorCode } from "../discovery";
import type { PluginManifest } from "../manifest";
import { formatIssues, parseManifest } from "../validate";
import {
  issuesOf,
  STORE_PLUGIN_ID,
  sourceFileSchema,
  storeFileSchema,
} from "./format";

// Reads a local clone of a store repository (`<plugins>/.stores/<store>`), which is
// **data, never code**: the reader only parses JSON with the schemas in `format.ts`,
// never runs anything from the clone, and never trusts it. The clone is outside the
// host's control (a store's maintainers write it, a sync put it there), so the rules
// are the ones for the plugin directory: symlinks are not followed, sizes are
// limited, names are checked. Nothing here throws; a problem with one entry is that
// entry's problem and the others carry on.

/** Every file the reader opens: a manifest or an entry is a few kilobytes. */
export const MAX_STORE_FILE_BYTES = 256 * 1024;
/** More entries than this is a store the instance does not read further. */
export const MAX_STORE_ENTRIES = 2000;

export interface StoreVersion {
  version: string;
  download: string;
  /** Hex, of the release archive, as the store pins it. */
  sha512: string;
  released: string | null;
  changelog: string | null;
  revoked: boolean;
  /** Why it was revoked, when the store said. */
  revokedReason: string | null;
}

export interface StoreEntry {
  /** The directory name, which the manifest's id equals. */
  id: string;
  /** The store's copy of the manifest, checked by the same rules as an installed one. */
  manifest: PluginManifest;
  repository: string | null;
  /** Highest first. */
  versions: StoreVersion[];
}

export interface StoreProblem {
  /** The entry's directory name. */
  id: string;
  issues: string[];
}

export type StoreSnapshot =
  | {
      ok: true;
      store: { id: string; name: string };
      entries: StoreEntry[];
      /** Entries that cannot be used, and why. */
      problems: StoreProblem[];
    }
  | { ok: false; error: string };

type Text = { ok: true; text: string } | { ok: false; issue: string };

/** A regular file of at most `MAX_STORE_FILE_BYTES`, as text. A symlink is refused. */
async function readSmallFile(path: string, label: string): Promise<Text> {
  try {
    const info = await lstat(/* turbopackIgnore: true */ path);
    if (info.isSymbolicLink())
      return { ok: false, issue: `${label} is a symlink` };
    if (!info.isFile()) return { ok: false, issue: `${label} is not a file` };
    // Never follows a symlink, even one that appears between the check above and here.
    const handle = await open(
      /* turbopackIgnore: true */ path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const buffer = Buffer.alloc(MAX_STORE_FILE_BYTES + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > MAX_STORE_FILE_BYTES) {
        return {
          ok: false,
          issue: `${label} is larger than ${MAX_STORE_FILE_BYTES / 1024} KiB`,
        };
      }
      return { ok: true, text: buffer.subarray(0, bytesRead).toString("utf8") };
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = errorCode(error);
    return {
      ok: false,
      issue:
        code === "ENOENT"
          ? `${label} is missing`
          : code === "ELOOP"
            ? `${label} is a symlink`
            : `${label} cannot be read (${code})`,
    };
  }
}

function parseJson(
  text: string,
): { ok: true; value: unknown } | { ok: false; issue: string } {
  try {
    return { ok: true, value: JSON.parse(text.replace(/^﻿/, "")) };
  } catch (error) {
    return {
      ok: false,
      issue: `is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function readEntry(
  dir: string,
  id: string,
): Promise<{ entry: StoreEntry } | { issues: string[] }> {
  const [manifestFile, sourceFile] = await Promise.all([
    readSmallFile(join(dir, "barynt-plugin.json"), "barynt-plugin.json"),
    readSmallFile(join(dir, "source.json"), "source.json"),
  ]);
  const issues: string[] = [];

  let manifest: PluginManifest | null = null;
  if (!manifestFile.ok) issues.push(manifestFile.issue);
  else {
    const parsed = parseManifest(manifestFile.text);
    if (!parsed.ok) {
      issues.push(
        ...formatIssues(parsed.issues).map(
          (line) => `barynt-plugin.json ${line}`,
        ),
      );
    } else if (parsed.manifest.id !== id) {
      issues.push(
        `barynt-plugin.json: the id "${parsed.manifest.id}" is not the directory name "${id}"`,
      );
    } else {
      manifest = parsed.manifest;
    }
  }

  let source: ReturnType<typeof sourceFileSchema.parse> | null = null;
  if (!sourceFile.ok) issues.push(sourceFile.issue);
  else {
    const json = parseJson(sourceFile.text);
    if (!json.ok) issues.push(`source.json ${json.issue}`);
    else {
      const parsed = sourceFileSchema.safeParse(json.value);
      if (!parsed.success) {
        issues.push(
          ...issuesOf(parsed.error).map((line) => `source.json ${line}`),
        );
      } else source = parsed.data;
    }
  }

  if (
    manifest &&
    source &&
    !source.versions.some((v) => v.version === manifest?.version)
  ) {
    issues.push(
      `source.json does not list the version ${manifest.version} that the manifest is for`,
    );
  }
  if (!manifest || !source || issues.length > 0) return { issues };

  const versions: StoreVersion[] = source.versions
    .map((v) => ({
      version: v.version,
      download: v.download,
      sha512: v.sha512,
      released: v.released ?? null,
      changelog: v.changelog ?? null,
      revoked: v.revoked !== undefined,
      revokedReason: typeof v.revoked === "string" ? v.revoked : null,
    }))
    .sort((a, b) => compare(b.version, a.version));
  return {
    entry: { id, manifest, repository: source.repository ?? null, versions },
  };
}

/**
 * The entries of the store cloned at `dir`. Never throws: a clone that is not there
 * or not a store is `{ ok: false }` with the reason, so a page can say so instead of
 * showing an empty list as if the store had nothing.
 */
export async function readStoreDirectory(dir: string): Promise<StoreSnapshot> {
  try {
    const root = await lstat(/* turbopackIgnore: true */ dir).catch(
      (error) => error,
    );
    if (root instanceof Error) {
      return {
        ok: false,
        error:
          errorCode(root) === "ENOENT"
            ? "The store has not been fetched yet."
            : `The store cannot be read (${errorCode(root)}).`,
      };
    }
    // `lstat` does not follow a symlink, so one is not a directory here.
    if (!root.isDirectory()) {
      return { ok: false, error: "The store is not a directory." };
    }

    const storeText = await readSmallFile(
      join(dir, "store.json"),
      "store.json",
    );
    if (!storeText.ok)
      return { ok: false, error: `Not a store: ${storeText.issue}.` };
    const storeJson = parseJson(storeText.text);
    if (!storeJson.ok)
      return {
        ok: false,
        error: `Not a store: store.json ${storeJson.issue}.`,
      };
    const storeParsed = storeFileSchema.safeParse(storeJson.value);
    if (!storeParsed.success) {
      return {
        ok: false,
        error: `Not a store: ${issuesOf(storeParsed.error)
          .map((l) => `store.json ${l}`)
          .join("; ")}.`,
      };
    }

    const pluginsDir = join(dir, "plugins");
    let names: import("node:fs").Dirent[];
    try {
      names = await readdir(/* turbopackIgnore: true */ pluginsDir, {
        withFileTypes: true,
      });
    } catch (error) {
      if (errorCode(error) === "ENOENT") names = [];
      else {
        return {
          ok: false,
          error: `The store's plugins cannot be read (${errorCode(error)}).`,
        };
      }
    }

    const entries: StoreEntry[] = [];
    const problems: StoreProblem[] = [];
    // Directories that start with `_` or `.` are reserved (an example, a staging area).
    const candidates = names
      .filter((d) => !d.name.startsWith("_") && !d.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const item of candidates) {
      if (entries.length + problems.length >= MAX_STORE_ENTRIES) {
        problems.push({
          id: "(more)",
          issues: [
            `the store has more than ${MAX_STORE_ENTRIES} entries; the rest is not read`,
          ],
        });
        break;
      }
      const id = item.name;
      if (!STORE_PLUGIN_ID.test(id)) {
        problems.push({
          id,
          issues: ["the directory name is not a plugin id"],
        });
        continue;
      }
      if (item.isSymbolicLink()) {
        problems.push({ id, issues: ["is a symlink"] });
        continue;
      }
      if (!item.isDirectory()) {
        problems.push({ id, issues: ["is not a directory"] });
        continue;
      }
      const read = await readEntry(join(pluginsDir, id), id);
      if ("entry" in read) entries.push(read.entry);
      else problems.push({ id, issues: read.issues });
    }

    return {
      ok: true,
      store: { id: storeParsed.data.id, name: storeParsed.data.name },
      entries,
      problems,
    };
  } catch (error) {
    return {
      ok: false,
      error: `The store could not be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
