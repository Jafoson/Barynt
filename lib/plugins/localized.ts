import type { PluginManifest } from "./manifest";

// What a manifest says in words: `name` and `description` are one text or one text
// per language, `author` a name or an object with one. Pure, no database: the admin
// page and tests read them the same way.

type Localized = PluginManifest["name"];

/**
 * The text for a locale: the exact one (`de-CH`), then its language (`de`), then the
 * `en` entry every manifest has to carry, then whatever is there.
 */
export function resolveText(value: Localized, locale: string): string {
  if (typeof value === "string") return value;
  // Own entries only: a locale such as `constructor` must not find `Object.prototype`.
  const own = (key: string): string | undefined =>
    Object.hasOwn(value, key) ? value[key] : undefined;
  const base = locale.split("-")[0] ?? locale;
  return own(locale) ?? own(base) ?? own("en") ?? Object.values(value)[0] ?? "";
}

/** The author's name, whichever way the manifest wrote it. */
export function authorName(author: PluginManifest["author"]): string {
  return typeof author === "string" ? author : author.name;
}
