// A store's address, and the one store the project itself manages. In a file of
// its own with no imports: the bootstrap script that seeds the official store
// runs in the migrate image, which copies only the few files it needs, and the
// policy (`policy.ts`) and the store settings share this logic without one
// pulling in the other.

/**
 * The official store, managed by the project. It is the one store that is on by
 * default. Whether it stays on is the platform admin's choice, so this is the
 * *default entry* of the list of active stores, not a rule of its own. If the
 * store moves, this changes in code.
 */
export const OFFICIAL_STORE_URL =
  "https://github.com/Jafoson/barynt-plugin-store";

export const OFFICIAL_STORE_NAME = "Barynt (official)";

/**
 * A store address in one form for comparing: `host/path`, lowercase, without
 * `.git` and a trailing slash. Only a plain `https://host/path` qualifies. Anything
 * else (another scheme, credentials, a port, a query or fragment, the `git@host:`
 * form, text that is no URL) gives `null`, which is never equal to anything.
 */
export function normalizeStoreUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }
  const path = parsed.pathname.replace(/\/+$/, "").replace(/\.git$/i, "");
  return path ? `${parsed.hostname}${path}`.toLowerCase() : null;
}
