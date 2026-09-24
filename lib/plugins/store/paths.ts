import { createHash } from "node:crypto";
import { join } from "node:path";

// Where a store's clone lives: `<plugins>/.stores/<name>`. The `.` keeps the plugin
// discovery away from it (docs/plugins/loading.md), and the directory is in the plugin
// volume, so the clone survives a restart.

/**
 * A name for a store's clone that is safe as one path segment whatever the address
 * says: the address as lowercase words, and a short hash of it, so two addresses never
 * share a name and one that is all symbols still has one.
 */
export function storeDirName(key: string): string {
  const slug = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 10);
  return slug ? `${slug}-${hash}` : hash;
}

/** The clone of the store with this (normalised) address inside the plugin directory. */
export function storeCloneDir(pluginsDir: string, key: string): string {
  return join(pluginsDir, ".stores", storeDirName(key));
}
