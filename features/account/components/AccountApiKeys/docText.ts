import { useLocale } from "next-intl";

/**
 * A piece of documentation prose in both languages (API and MCP docs,
 * BARY-172). Kept beside the docs data rather than in `messages/*.json`:
 * the texts are full of `{id}` paths and JSON snippets that next-intl
 * would read as placeholders. What a caller actually sends — paths, field
 * names, JSON, scopes, error codes — stays as it is in both.
 *
 * A plain string is for text that's the same in every language (an empty
 * description, a list of keys).
 */
export type DocText = string | { en: string; de: string };

/** The reader's version of a `DocText` — German for `de`, else English. */
export function useDocText(): (text: DocText) => string {
  const locale = useLocale();
  return (text) =>
    typeof text === "string" ? text : locale === "de" ? text.de : text.en;
}
