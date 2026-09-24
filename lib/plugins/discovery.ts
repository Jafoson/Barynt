import "server-only";
import { lstat, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
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

/** The environment variable that moves the plugin directory. Nobody has to set it. */
export const PLUGINS_DIR_ENV = "BARYNT_PLUGINS_DIR";

/** A manifest is a few kilobytes; this only keeps a hostile file from being read whole. */
export const MAX_MANIFEST_BYTES = 256 * 1024;

export type PluginsDirSetting =
  | {
      dir: string;
      /**
       * Nobody named the directory, this is the default. It need not exist:
       * there are simply no plugins yet. A directory that *was* named and is
       * missing is a problem, one that is not was never asked for.
       */
      implicit: boolean;
    }
  | { dir: null; problem?: string };

/**
 * Where plugins live when nobody says otherwise: `~/.barynt/plugins`. The image
 * sets `BARYNT_PLUGINS_DIR=/plugins` itself, outside the app directory (ADR 0001),
 * so this is what a run outside a container uses. It is under the home directory
 * and not in the working directory because the working directory changes with how
 * the app is started (a standalone build runs from inside `.next`, which a rebuild
 * wipes). `null` when there is no usable home directory.
 */
export function defaultPluginsDir(home: string | null): string | null {
  if (!home || !isAbsolute(home)) return null;
  return join(/* turbopackIgnore: true */ home, ".barynt", "plugins");
}

function homeDirectory(): string | null {
  try {
    return homedir() || null;
  } catch {
    // No home directory for this user.
    return null;
  }
}

/**
 * The plugin directory. `BARYNT_PLUGINS_DIR` moves it; without it there is a
 * default, so plugins work without anything being set. A path that is set and
 * relative is refused and does **not** fall back to the default: "relative to what"
 * changes with where the process was started, and a value that was meant to say
 * something must not be quietly replaced by one that says something else.
 */
export function pluginsDirSetting(
  env: Record<string, string | undefined> = process.env,
  home: string | null = homeDirectory(),
): PluginsDirSetting {
  const value = env[PLUGINS_DIR_ENV]?.trim();
  if (value) {
    if (!isAbsolute(value)) {
      return {
        dir: null,
        problem: `${PLUGINS_DIR_ENV} must be an absolute path, got "${value}"`,
      };
    }
    return { dir: value, implicit: false };
  }
  const dir = defaultPluginsDir(home);
  if (dir) return { dir, implicit: true };
  return {
    dir: null,
    problem: `There is no home directory for the default plugin directory, set ${PLUGINS_DIR_ENV}`,
  };
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
  /** The directory itself does not exist, which is also in `issues`. */
  rootMissing: boolean;
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
  onMissing?: () => void,
): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(/* turbopackIgnore: true */ dir, {
      withFileTypes: true,
    });
  } catch (error) {
    if (errorCode(error) === "ENOENT") onMissing?.();
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
export function errorCode(error: unknown): string {
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
  let rootMissing = false;

  for (const id of await subdirectories(
    root,
    isValidId,
    "plugin id",
    issues,
    () => {
      rootMissing = true;
    },
  )) {
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
  return { plugins, issues, rootMissing };
}
