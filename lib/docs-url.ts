/** The documentation (barynt.dev, built from `docs/` of this repository),
 *  in the reader's language. Linked from the user menu. A file of its own,
 *  without `server-only` and without `package.json` (`lib/app-info.ts`
 *  imports it), so a client component can use it. */
export function docsUrl(locale: string): string {
  return locale === "de"
    ? "https://barynt.dev/de/docs/"
    : "https://barynt.dev/docs/";
}
