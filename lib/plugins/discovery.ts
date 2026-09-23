import "server-only";
import { lstat, readdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { compare } from "semver";
import {
  MANIFEST_FILE,
  type PluginManifest,
  pluginIdSchema,
  pluginVersionSchema,
} from "./manifest";
import { formatIssues, parseManifest } from "./validate";

// Which plugins are on disk. The plugin directory holds one directory per
// installed version, `<dir>/<id>/<version>/`, and in it `barynt-plugin.json`
// (docs/plugins/adr-0001-runtime-loading.md). This reads those manifests and
// checks them; it runs no plugin code and knows nothing about the database, so
// what is *installed* is a different question from what is *lying there*.
//
// Everything in the directory is outside the host's control: names, symlinks,
// oversized or broken files. Like the manifest validator, discovery reports what
// it finds wrong and never throws, and one broken plugin never hides another.
//
// Every filesystem call with a variable path carries
// `/* turbopackIgnore: true */`. Without it Turbopack traces the whole project
// into the standalone output (+10 MB and a build warning), see ADR 0001.

/** The environment variable that names the plugin directory. */
export const PLUGINS_DIR_ENV = "BARYNT_PLUGINS_DIR";

/** A manifest is a few kilobytes; this only keeps a hostile file from being read whole. */
export const MAX_MANIFEST_BYTES = 256 * 1024;

export type PluginsDirSetting =
  | { dir: string }
  | { dir: null; problem?: string };

/**
 * The plugin directory from the environment. Without the variable plugins are
 * off, no problem; with a relative path they are off too, because "relative to
 * what" changes with where the process was started.
 */
export function pluginsDirSetting(
  env: Record<string, string | undefined> = process.env,
): PluginsDirSetting {
  const value = env[PLUGINS_DIR_ENV]?.trim();
  if (!value) return { dir: null };
  if (!isAbsolute(value)) {
    return {
      dir: null,
      problem: `${PLUGINS_DIR_ENV} must be an absolute path, got "${value}"`,
    };
  }
  return { dir: value };
}

export type DiscoveredPlugin = {
  /** From the directory name, which the manifest has to agree with. */
  id: string;
  version: string;
  /** Absolute path of `<dir>/<id>/<version>`. */
  dir: string;
} & ({ ok: true; manifest: PluginManifest } | { ok: false; issues: string[] });

export interface Discovery {
  /** Every version directory found, valid or not, by id and then by version. */
  plugins: DiscoveredPlugin[];
  /** Problems with the directory itself or with entries that are no plugin. */
  issues: string[];
}

/** Hidden and `_` entries are staging areas and switched-off plugins: ignored, not reported. */
function isIgnored(name: string): boolean {
  return name.startsWith(".") || name.startsWith("_");
}

const isValidId = (name: string) => pluginIdSchema.safeParse(name).success;
const isValidVersion = (name: string) =>
  pluginVersionSchema.safeParse(name).success;

/**
 * The subdirectories of `dir` whose names are valid. A symlink is reported and
 * not followed, a plain file is ignored, a directory with a wrong name is
 * reported: it is probably a plugin someone put in the wrong place.
 */
async function subdirectories(
  dir: string,
  isValid: (name: string) => boolean,
  what: string,
  issues: string[],
): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(/* turbopackIgnore: true */ dir, {
      withFileTypes: true,
    });
  } catch (error) {
    issues.push(`${dir}: cannot be read (${errorCode(error)})`);
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue;
    const path = join(/* turbopackIgnore: true */ dir, entry.name);
    if (entry.isSymbolicLink()) {
      issues.push(`${path}: is a symlink, which is not followed`);
    } else if (!entry.isDirectory()) {
      // A stray file, such as a README, is not a problem.
    } else if (!isValid(entry.name)) {
      issues.push(`${path}: "${entry.name}" is not a valid ${what}`);
    } else {
      names.push(entry.name);
    }
  }
  return names.sort();
}

/** `ENOENT`, `EACCES` and so on, never the message: it can contain the path twice. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown error";
}

async function readManifest(
  dir: string,
  id: string,
  version: string,
): Promise<
  { ok: true; manifest: PluginManifest } | { ok: false; issues: string[] }
> {
  const file = join(/* turbopackIgnore: true */ dir, MANIFEST_FILE);
  try {
    const info = await lstat(/* turbopackIgnore: true */ file);
    if (!info.isFile()) {
      return { ok: false, issues: [`${MANIFEST_FILE}: is not a regular file`] };
    }
    if (info.size > MAX_MANIFEST_BYTES) {
      return {
        ok: false,
        issues: [
          `${MANIFEST_FILE}: is larger than ${MAX_MANIFEST_BYTES} bytes`,
        ],
      };
    }
    const text = await readFile(/* turbopackIgnore: true */ file, "utf8");
    const parsed = parseManifest(text);
    if (!parsed.ok) return { ok: false, issues: formatIssues(parsed.issues) };

    // The directory names are what the host trusts for paths, so the manifest
    // has to say the same, or an id could be claimed from the wrong directory.
    const mismatches: string[] = [];
    if (parsed.manifest.id !== id) {
      mismatches.push(
        `id: the manifest says "${parsed.manifest.id}" but the directory is "${id}"`,
      );
    }
    if (parsed.manifest.version !== version) {
      mismatches.push(
        `version: the manifest says "${parsed.manifest.version}" but the directory is "${version}"`,
      );
    }
    return mismatches.length > 0
      ? { ok: false, issues: mismatches }
      : { ok: true, manifest: parsed.manifest };
  } catch (error) {
    const code = errorCode(error);
    return {
      ok: false,
      issues: [
        code === "ENOENT"
          ? `${MANIFEST_FILE}: is missing`
          : `${MANIFEST_FILE}: cannot be read (${code})`,
      ],
    };
  }
}

/**
 * Reads every `<id>/<version>/barynt-plugin.json` under `root`. Never throws:
 * an unreadable directory, a broken manifest or a wrong name is reported and
 * the rest is still found.
 */
export async function discoverPlugins(root: string): Promise<Discovery> {
  const issues: string[] = [];
  const plugins: DiscoveredPlugin[] = [];

  for (const id of await subdirectories(root, isValidId, "plugin id", issues)) {
    const idDir = join(/* turbopackIgnore: true */ root, id);
    const versions = (
      await subdirectories(idDir, isValidVersion, "plugin version", issues)
    ).sort(compare);
    for (const version of versions) {
      const dir = join(/* turbopackIgnore: true */ idDir, version);
      plugins.push({
        id,
        version,
        dir,
        ...(await readManifest(dir, id, version)),
      });
    }
  }
  return { plugins, issues };
}
