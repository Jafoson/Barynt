import {
  CHANGES_END,
  CHANGES_START,
  GITHUB_ONLY_END,
  GITHUB_ONLY_START,
} from "@/scripts/release/notes";

/**
 * A release file (`releases/<version>.md`) as the in-app window shows it: the
 * hand-written part only. The generated change list stays on GitHub (the
 * window links to it), the leading `# Barynt x.y.z` heading is dropped — the
 * tab already says which version it is — HTML comments (the template hint)
 * go, and relative image paths point at the asset route.
 *
 * Pure, so tests and `lib/releases/index.ts` share it. The markers come from
 * `scripts/release/notes.ts`, which writes them.
 */

export const ASSET_ROUTE = "/api/release-assets";

/** Repeated, so `<!<!-- x -->-- y -->` can't leave a comment behind. */
function stripComments(markdown: string): string {
  const comment = /<!--[\s\S]*?-->/g;
  let text = markdown;
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(comment, "");
  }
  return text;
}

/** Drops every `github-only` block, content included. */
function stripGithubOnly(markdown: string): string {
  let text = markdown;
  for (;;) {
    const start = text.indexOf(GITHUB_ONLY_START);
    if (start === -1) return text;
    const end = text.indexOf(GITHUB_ONLY_END, start);
    // An unclosed block hides everything after it, never leaks into the app.
    text =
      text.slice(0, start) +
      (end === -1 ? "" : text.slice(end + GITHUB_ONLY_END.length));
  }
}

export function toAppMarkdown(markdown: string): string {
  let text = stripGithubOnly(markdown);
  const start = text.indexOf(CHANGES_START);
  const end = text.indexOf(CHANGES_END);
  if (start !== -1 && end > start) {
    text = text.slice(0, start) + text.slice(end + CHANGES_END.length);
  }
  return stripComments(text)
    .replace(/^# .*\n+/, "")
    .replaceAll("](./assets/", `](${ASSET_ROUTE}/`)
    .replaceAll("](assets/", `](${ASSET_ROUTE}/`)
    .trim();
}
