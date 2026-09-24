import "server-only";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { errorCode } from "../discovery";
import { unpackStoreArchive } from "./archive";
import type { DownloadDeps } from "./fetch";
import { storeCloneDir } from "./paths";
import { readStoreDirectory } from "./reader";
import { fetchStoreArchive, type StoreSource } from "./transport";

// Brings one store's clone up to date: download the archive, unpack it into a fresh
// directory of ours, read it as a store, and only then put it where the clone is. Whatever
// goes wrong on the way, the clone that was there stays as it was: the page shows the last
// state that worked ("store not reachable, showing the state from ..."), never an empty
// list and never a half-written store. The clone is data, never code (`reader.ts`), and
// nothing from it is run here.

export type SyncCode = "download" | "unusable" | "disk";

export type SyncResult =
  | { ok: true; entries: number; problems: number }
  | { ok: false; error: string; code: SyncCode };

export interface SyncOptions {
  /** The plugin directory (`pluginsDirSetting().dir`). */
  pluginsDir: string;
  /** The store's normalised address, which names its clone. */
  key: string;
  source: StoreSource;
  /** For the download, redirects included. */
  timeoutMs?: number;
}

export interface SyncDeps extends DownloadDeps {
  /** Runs after the new clone is ready and before it is moved into place. For tests. */
  beforeInstall?: (fresh: string) => Promise<void>;
}

/** Leftovers of a sync that was cut off (a crash, a restart) are removed after this. */
const LEFTOVER_MS = 60 * 60 * 1000;

const failure = (code: SyncCode, error: string): SyncResult => ({
  ok: false,
  error,
  code,
});

/** `.stores` as a real directory of ours, created if it is not there. A symlink is refused. */
async function storesDirectory(pluginsDir: string): Promise<string | null> {
  const dir = join(pluginsDir, ".stores");
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const info = await lstat(/* turbopackIgnore: true */ dir);
  return info.isDirectory() ? dir : null;
}

/** Removes what an earlier sync left behind, when it is old enough not to be one that is running. */
async function removeLeftovers(dir: string, now: number): Promise<void> {
  for (const name of await readdir(/* turbopackIgnore: true */ dir)) {
    if (!name.startsWith(".tmp-") && !name.includes(".old-")) continue;
    const path = join(dir, name);
    const info = await stat(/* turbopackIgnore: true */ path).catch(() => null);
    if (info && now - info.mtimeMs > LEFTOVER_MS) {
      await rm(/* turbopackIgnore: true */ path, {
        recursive: true,
        force: true,
      });
    }
  }
}

async function run(options: SyncOptions, deps: SyncDeps): Promise<SyncResult> {
  let stores: string | null;
  try {
    stores = await storesDirectory(options.pluginsDir);
  } catch (error) {
    return failure(
      "disk",
      `The plugin directory cannot be written (${errorCode(error)}).`,
    );
  }
  if (stores === null) {
    return failure("disk", "The store directory is not a directory.");
  }
  await removeLeftovers(stores, Date.now()).catch(() => {});

  const download = await fetchStoreArchive(
    options.source,
    deps,
    options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {},
  );
  if (!download.ok) return failure("download", download.error);

  let fresh: string | null = null;
  try {
    fresh = await mkdtemp(/* turbopackIgnore: true */ join(stores, ".tmp-"));
    const unpacked = await unpackStoreArchive(download.data, fresh);
    if (!unpacked.ok) return failure("unusable", unpacked.error);
    const snapshot = await readStoreDirectory(fresh);
    if (!snapshot.ok) return failure("unusable", snapshot.error);

    await deps.beforeInstall?.(fresh);
    await install(fresh, storeCloneDir(options.pluginsDir, options.key));
    return {
      ok: true,
      entries: snapshot.entries.length,
      problems: snapshot.problems.length,
    };
  } catch (error) {
    return failure(
      "disk",
      `The store could not be put in place (${errorCode(error)}).`,
    );
  } finally {
    // Gone already when it was moved into place, which `force` does not mind.
    if (fresh !== null) {
      await rm(/* turbopackIgnore: true */ fresh, {
        recursive: true,
        force: true,
      }).catch(() => {});
    }
  }
}

/**
 * Moves the fresh directory to `final`, the old clone (or whatever is there: a file or a
 * symlink is moved, not followed) out of the way first. If the fresh one cannot be moved in,
 * the old one goes back.
 */
async function install(fresh: string, final: string): Promise<void> {
  const old = `${final}.old-${process.pid}-${Date.now()}`;
  let moved = false;
  try {
    await rename(/* turbopackIgnore: true */ final, old);
    moved = true;
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  try {
    await rename(/* turbopackIgnore: true */ fresh, final);
  } catch (error) {
    if (moved)
      await rename(/* turbopackIgnore: true */ old, final).catch(() => {});
    throw error;
  }
  if (moved) {
    await rm(/* turbopackIgnore: true */ old, {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
}

// Syncs of one store that are running, on `global` like the registry's state: the page and
// the action are bundled apart, and two copies of this module would each think nothing is
// running. A second request for a store that is being synced waits for that one and gets
// its result instead of downloading the archive again.
const RUNNING = Symbol.for("barynt.plugins.storeSyncs");
type Running = Map<string, Promise<SyncResult>>;

function running(): Running {
  const holder = globalThis as unknown as { [RUNNING]?: Running };
  holder[RUNNING] ??= new Map();
  return holder[RUNNING];
}

/**
 * Updates the clone of one store. Never throws: a failure is a result with the reason, and
 * the clone that was there is left as it was.
 */
export async function syncStoreClone(
  options: SyncOptions,
  deps: SyncDeps = {},
): Promise<SyncResult> {
  try {
    const key = storeCloneDir(options.pluginsDir, options.key);
    const map = running();
    const already = map.get(key);
    if (already) return await already;
    const started = run(options, deps);
    map.set(key, started);
    try {
      return await started;
    } finally {
      map.delete(key);
    }
  } catch {
    return failure("disk", "The store could not be updated.");
  }
}

/**
 * Removes the clone of a store that is gone, so that connecting the same address again does not
 * show a state from before it. Never throws; a clone that cannot be removed stays where it is and
 * is replaced by the next sync.
 */
export async function removeStoreClone(
  pluginsDir: string,
  key: string,
): Promise<void> {
  try {
    await rm(/* turbopackIgnore: true */ storeCloneDir(pluginsDir, key), {
      recursive: true,
      force: true,
    });
  } catch {
    // Nothing to do about it here.
  }
}
