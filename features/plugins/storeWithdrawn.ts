import "server-only";
import { storeCloneDir } from "@/lib/plugins/store/paths";
import { readStoreDirectory } from "@/lib/plugins/store/reader";
import { normalizeStoreUrl } from "@/lib/plugins/storeUrl";

/**
 * Whether the store a plugin came from has withdrawn `version` of it, as a sentence with the
 * store's reason, or `null`. Read from the store's clone, by the address the plugin row says it
 * came from, so it is that store's word and nobody else's. **Any doubt is `null`**: the store
 * is not connected any more, its clone is gone or cannot be read, it does not list the version.
 * This is for going back to an earlier version, which is what one does when something is wrong,
 * and the files still need their own approval to run; it only stops one that the store itself
 * called unsafe.
 */
export async function withdrawnByItsStore(input: {
  dir: string;
  origin: string | null;
  pluginId: string;
  version: string;
}): Promise<string | null> {
  const key = normalizeStoreUrl(input.origin);
  if (!key) return null;
  const snapshot = await readStoreDirectory(storeCloneDir(input.dir, key));
  if (!snapshot.ok) return null;
  const listed = snapshot.entries
    .find((e) => e.id === input.pluginId)
    ?.versions.find((v) => v.version === input.version);
  if (!listed?.revoked) return null;
  return `${input.version} was withdrawn by ${snapshot.store.name}${listed.revokedReason ? `: ${listed.revokedReason}` : ""}, so it is not brought back.`;
}
