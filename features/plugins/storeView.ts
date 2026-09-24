import type { CatalogEntry } from "@/lib/plugins/store/catalog";

// What the store page does with the catalog in the browser: search, filter by category
// and by installed, count the categories, pick the entries to feature, and make an avatar
// for a plugin that has no icon. Pure: plain values in and out, so the page and tests
// read the same rules.

export type StoreView = "discover" | "installed";

export interface StoreFilter {
  /** What was typed in the search field. */
  query: string;
  /** A category id, or `null` for all. */
  category: string | null;
  view: StoreView;
}

/** Everything a search looks at, in one lowercase string. */
function haystack(entry: CatalogEntry): string {
  return [
    entry.name,
    entry.id,
    entry.description,
    entry.author,
    entry.storeName,
    ...entry.keywords,
    ...entry.categories,
  ]
    .join("\n")
    .toLowerCase();
}

/** The entries that match the search words: every word has to be somewhere (any order). */
function matches(entry: CatalogEntry, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = haystack(entry);
  return words.every((word) => text.includes(word));
}

export function filterEntries(
  entries: readonly CatalogEntry[],
  filter: StoreFilter,
): CatalogEntry[] {
  return entries.filter(
    (entry) =>
      (filter.view === "discover" || entry.installed !== null) &&
      (filter.category === null ||
        entry.categories.includes(filter.category)) &&
      matches(entry, filter.query),
  );
}

/**
 * How many entries there are in each category, for the chips. Counted over what the
 * search and the view leave (so a chip never promises more than the list would show),
 * but not over the category itself. Only categories that have entries. Most first, then
 * by id.
 */
export function categoryCounts(
  entries: readonly CatalogEntry[],
  filter: Pick<StoreFilter, "query" | "view">,
): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of filterEntries(entries, { ...filter, category: null })) {
    for (const category of entry.categories) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

/** The date the version on offer was released, or `null`. */
export function releasedOf(entry: CatalogEntry): string | null {
  return (
    entry.versions.find((v) => v.version === entry.offered)?.released ?? null
  );
}

/**
 * The entries to put on top: the most recently released, up to three, among the ones
 * that could be installed. None when there are too few entries for it to mean anything
 * (a shelf of everything is no shelf).
 */
export function pickFeatured(
  entries: readonly CatalogEntry[],
  minimum = 4,
): CatalogEntry[] {
  if (entries.length < minimum) return [];
  return entries
    .filter((e) => e.offered !== null && e.compatible && releasedOf(e) !== null)
    .sort(
      (a, b) =>
        (releasedOf(b) ?? "").localeCompare(releasedOf(a) ?? "") ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 3);
}

/** Up to two letters for an avatar: the first letters of the first two words, else of the name. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-_.]+/)
    .filter(Boolean);
  const letters =
    words.length >= 2
      ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
      : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** A hue, 0 to 359, that is the same for the same id: the plugin's colour. */
export function hueOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}
