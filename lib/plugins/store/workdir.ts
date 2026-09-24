import "server-only";
import { lstat, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

// Working directories inside the plugin directory (`.stores/`, `.staging/`): a real directory of
// ours where fresh things are made and moved into place, and the clearing of what a run that was
// cut off left behind. The plugin directory is outside the host's control (a symlink in it must
// not send a write somewhere else), so `.`-directories are checked before anything is put in them
// and are never followed. Discovery does not look at names that start with a dot.

/** Leftovers are removed when they are older than this: a run that is still going is not touched. */
export const LEFTOVER_MS = 60 * 60 * 1000;

/** `path` as a real directory, created if it is not there, or `null` if it is a symlink or a file. */
export async function realDirectory(path: string): Promise<string | null> {
  await mkdir(/* turbopackIgnore: true */ path, { recursive: true });
  const info = await lstat(/* turbopackIgnore: true */ path);
  return info.isDirectory() ? path : null;
}

/**
 * Removes what an earlier run left in `dir`, when `isLeftover(name)` says so and it is over an
 * hour old. Never throws.
 */
export async function removeLeftovers(
  dir: string,
  isLeftover: (name: string) => boolean,
  now: number,
): Promise<void> {
  try {
    for (const name of await readdir(/* turbopackIgnore: true */ dir)) {
      if (!isLeftover(name)) continue;
      const path = join(dir, name);
      const info = await stat(/* turbopackIgnore: true */ path).catch(
        () => null,
      );
      if (info && now - info.mtimeMs > LEFTOVER_MS) {
        await rm(/* turbopackIgnore: true */ path, {
          recursive: true,
          force: true,
        });
      }
    }
  } catch {
    // The next run tries again.
  }
}
