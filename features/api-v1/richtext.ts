import "server-only";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/richtext/date";
import { fromMarkdown } from "@/lib/richtext/fromMarkdown";
import type { PMDoc, PMMark, PMNode } from "@/lib/richtext/types";

/**
 * `@handle`, `#PREFIX-123`, `//date`, and `[label|url]` inside API/MCP-
 * authored `description`/`body` text — the write-path counterpart to the
 * in-app editor's `@`/`#`/`//` suggestion popups and "Insert link" form
 * (`components/ui/layout/RichTextEditor`), for callers that only ever send
 * Markdown and have no popup or form to pick from.
 *
 * Deliberately not part of `lib/richtext/fromMarkdown.ts`: that converter
 * is pure and dependency-free ("runs everywhere: tests, seed, scripts") by
 * design, mirroring the retired Markdown renderer's grammar exactly — none
 * of these four were ever part of that grammar. Resolving `@`/`#` also
 * needs a database and a workspace to scope the lookup to (an issue ref is
 * only unique per workspace, `features/api-v1/mutations.ts`'s
 * `uniquePrefix`), which `fromMarkdown` deliberately has neither of.
 *
 * A token that doesn't resolve — typo, wrong workspace, invalid date, no
 * recognized URL scheme — is left exactly as typed, same fallback as an
 * unsafe link URL in `fromMarkdown.ts`: quietly not a chip, never a
 * rejected request.
 *
 * Entry point is `richTextFromApiMarkdown()`, not `fromMarkdown()` plus a
 * post-pass like the other three tokens: see `extractLinkBrackets()`'s own
 * comment for why `[label|url]` has to be pulled out of the raw string
 * *before* `fromMarkdown` ever sees it.
 */

const TOKEN =
  /@([a-z0-9]{1,32})|#([A-Za-z0-9]{1,4}-\d{1,6})|\/\/(\S{1,10})|(L\d+)/g;

const LINK_BRACKET = /\[([^[\]]{1,300})\]/g;
const LINK_SCHEME = /^(?:https?:\/\/|mailto:)/i;
/** Every stand-alone placeholder still present after `rewrite()` — the
 *  ones that survived because they landed inside a code span/block or an
 *  existing link, where nothing walks in to resolve them. Matches
 *  `TOKEN`'s own placeholder alternative exactly. */
const STRAY_PLACEHOLDER = /L\d+/g;

interface LinkBracket {
  href: string;
  label: string;
  /** The bracket exactly as typed, e.g. `[docs|https://x]` — what a
   *  placeholder reverts to if it's never actually resolved into a chip
   *  (`revertStrayPlaceholders`). */
  original: string;
}

/**
 * U+E000 is Unicode Private Use Area — no font renders it meaningfully, no
 * keyboard produces it, nobody's real Markdown will ever contain it, and
 * unlike `\0` it's a perfectly ordinary character as far as Postgres's
 * `text`/`jsonb` columns are concerned (`\0` isn't storable there at all,
 * which would turn a missed placeholder into a hard write failure instead
 * of a cosmetic one).
 */
function placeholderFor(index: number): string {
  return `L${index}`;
}

/** `label|url` or just `url`. `null` when the URL part isn't a scheme this
 *  resolves (see the file comment) — kept as plain bracket text then,
 *  rather than guessed at. */
function resolveLinkBracket(
  content: string,
): { href: string; label: string } | null {
  const bar = content.indexOf("|");
  const label = bar === -1 ? "" : content.slice(0, bar).trim();
  const href = (bar === -1 ? content : content.slice(bar + 1)).trim();
  return LINK_SCHEME.test(href) ? { href, label } : null;
}

/**
 * Pulls every resolvable `[label|url]`/`[url]` out of the raw Markdown and
 * replaces each with an inert placeholder, before `fromMarkdown()` gets to
 * run at all.
 *
 * Why not just look for `[label|url]` in the resulting *document* like the
 * other three tokens do: `fromMarkdown`'s own bare-URL rule
 * (`https?://[^\s<>()[\]]+`) fires on the `url` part independently of the
 * surrounding brackets — a bare URL is a bare URL to that scanner no
 * matter what sits next to it — and wraps it in its own `link`-marked text
 * node, splitting `[label|` and `url]` across sibling nodes before this
 * file ever gets a look. Extracting first, while the whole thing is still
 * one plain string, sidesteps that split entirely.
 */
function extractLinkBrackets(markdown: string): {
  text: string;
  links: Map<string, LinkBracket>;
} {
  const links = new Map<string, LinkBracket>();
  let index = 0;

  const text = markdown.replace(LINK_BRACKET, (whole, content: string) => {
    const resolved = resolveLinkBracket(content);
    if (!resolved) return whole;
    const placeholder = placeholderFor(index++);
    links.set(placeholder, { ...resolved, original: whole });
    return placeholder;
  });

  return { text, links };
}

function hasSkippedMark(marks: PMMark[] | undefined): boolean {
  // `code`: same reasoning `fromMarkdown` has for never interpreting markup
  // inside inline code. `link`: text already means "go to this other URL"
  // — splitting a mention/date chip out of it would be confusing, not
  // useful. A placeholder landing in either case is swept back to its
  // original bracket text by `revertStrayPlaceholders` instead of staying
  // as raw private-use characters.
  return !!marks?.some((m) => m.type === "code" || m.type === "link");
}

/** `2026-08-14.` at the end of a sentence should still resolve — the
 *  trailing period is sentence punctuation, not part of the date, but
 *  `parseDateInput` doesn't know that. Tried first as typed (an explicit
 *  trailing dot is valid day-first notation, e.g. `1.2.`), then with one
 *  trailing dot stripped. */
function resolveDate(candidate: string): string | null {
  return (
    parseDateInput(candidate) ?? parseDateInput(candidate.replace(/\.$/, ""))
  );
}

/** Every `@handle`/`#REF` candidate in the doc, minus anything inside a
 *  code block, inline code, or an existing link — same reasoning
 *  `fromMarkdown` has for never interpreting markup there. `//date` and
 *  the link placeholders need no such collection: nothing to batch-fetch,
 *  they're resolved locally in `splitTextNode` instead. `hasAny`
 *  short-circuits the whole rewrite for the common case — a document with
 *  none of the four token shapes anywhere. */
function collectTokens(nodes: PMNode[] | undefined): {
  handles: Set<string>;
  refs: Set<string>;
  hasAny: boolean;
} {
  const handles = new Set<string>();
  const refs = new Set<string>();
  let hasAny = false;

  const walk = (list: PMNode[] | undefined) => {
    for (const node of list ?? []) {
      if (node.type === "codeBlock") continue;
      if (node.type === "text" && !hasSkippedMark(node.marks)) {
        for (const match of node.text?.matchAll(TOKEN) ?? []) {
          hasAny = true;
          if (match[1]) handles.add(match[1]);
          else if (match[2]) refs.add(match[2].toUpperCase());
        }
      }
      walk(node.content);
    }
  };
  walk(nodes);

  return { handles, refs, hasAny };
}

/** Resolves every candidate handle to a workspace member and every
 *  candidate ref to an issue in the same workspace — both in one batch
 *  query each, same idea as `resolveLabels` in `features/api-v1/queries.ts`
 *  (collect every id/key across the whole document first, fetch once, look
 *  each one up afterward) rather than a query per token. */
async function resolveTokens(
  workspaceId: string,
  handles: Set<string>,
  refs: Set<string>,
): Promise<{
  mentions: Map<string, { id: string; label: string }>;
  issueLinks: Map<string, string>;
}> {
  const mentions = new Map<string, { id: string; label: string }>();
  const issueLinks = new Map<string, string>();

  if (handles.size > 0) {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId, user: { handle: { in: [...handles] } } },
      select: {
        user: {
          select: { id: true, handle: true, firstName: true, lastName: true },
        },
      },
    });
    for (const { user } of members) {
      mentions.set(user.handle, {
        id: user.id,
        label: `${user.firstName} ${user.lastName}`.trim(),
      });
    }
  }

  if (refs.size > 0) {
    const prefixes = [...new Set([...refs].map((ref) => ref.split("-")[0]))];
    const projects = await db.project.findMany({
      where: { workspaceId, prefix: { in: prefixes } },
      select: { id: true, prefix: true },
    });
    const projectByPrefix = new Map(projects.map((p) => [p.prefix, p.id]));

    const wanted = [...refs]
      .map((ref) => {
        const i = ref.lastIndexOf("-");
        const prefix = ref.slice(0, i);
        const key = Number(ref.slice(i + 1));
        const projectId = projectByPrefix.get(prefix);
        return projectId ? { ref, projectId, key } : null;
      })
      .filter((w) => w != null);

    if (wanted.length > 0) {
      const issues = await db.issue.findMany({
        where: { OR: wanted.map(({ projectId, key }) => ({ projectId, key })) },
        select: { id: true, key: true, projectId: true },
      });
      const issueByProjectKey = new Map(
        issues.map((i) => [`${i.projectId}:${i.key}`, i.id]),
      );
      for (const { ref, projectId, key } of wanted) {
        const id = issueByProjectKey.get(`${projectId}:${key}`);
        if (id) issueLinks.set(ref, id);
      }
    }
  }

  return { mentions, issueLinks };
}

/** Splits a text node on every resolved token into `text`/chip siblings; a
 *  node with no resolved token comes back untouched (same array, no new
 *  object) — the common case, on every paragraph that isn't the one
 *  someone actually mentioned, linked, dated, or attached a URL to. */
function splitTextNode(
  node: PMNode,
  mentions: Map<string, { id: string; label: string }>,
  issueLinks: Map<string, string>,
  links: Map<string, LinkBracket>,
): PMNode[] {
  const value = node.text ?? "";
  const marks = node.marks;
  const out: PMNode[] = [];
  let last = 0;
  let matched = false;

  for (const match of value.matchAll(TOKEN)) {
    const handle = match[1];
    const ref = match[2]?.toUpperCase();
    const dateCandidate = match[3];
    const placeholder = match[4];

    const mention = handle ? mentions.get(handle) : undefined;
    const issueId = ref ? issueLinks.get(ref) : undefined;
    const date = dateCandidate ? resolveDate(dateCandidate) : null;
    const link = placeholder ? links.get(placeholder) : undefined;
    if (!mention && !issueId && !date && !link) continue;

    matched = true;
    if (match.index > last) {
      out.push({
        type: "text",
        text: value.slice(last, match.index),
        ...(marks && { marks }),
      });
    }
    out.push(
      mention
        ? { type: "mention", attrs: { id: mention.id, label: mention.label } }
        : issueId
          ? { type: "issueLink", attrs: { id: issueId, identifier: ref } }
          : date
            ? { type: "dateChip", attrs: { date } }
            : {
                type: "linkChip",
                attrs: { href: link?.href, label: link?.label },
              },
    );
    last = match.index + match[0].length;
  }

  if (!matched) return [node];
  if (last < value.length) {
    out.push({
      type: "text",
      text: value.slice(last),
      ...(marks && { marks }),
    });
  }
  return out;
}

function rewrite(
  nodes: PMNode[] | undefined,
  mentions: Map<string, { id: string; label: string }>,
  issueLinks: Map<string, string>,
  links: Map<string, LinkBracket>,
): PMNode[] | undefined {
  return nodes?.flatMap((node) => {
    if (node.type === "codeBlock") return [node];
    if (node.type === "text" && !hasSkippedMark(node.marks)) {
      return splitTextNode(node, mentions, issueLinks, links);
    }
    if (node.content) {
      return [
        {
          ...node,
          content: rewrite(node.content, mentions, issueLinks, links),
        },
      ];
    }
    return [node];
  });
}

/** Restores any placeholder that `rewrite()` skipped over (inside a code
 *  span/block or an existing link) back to its original `[label|url]`
 *  text — walks every node regardless of type or mark, unlike `rewrite`,
 *  specifically so nothing carrying a private-use placeholder can reach
 *  the database. A no-op, structurally unchanged tree in the overwhelming
 *  common case (`links.size === 0`, or every placeholder already resolved
 *  into a chip). */
function revertStrayPlaceholders(
  nodes: PMNode[] | undefined,
  links: Map<string, LinkBracket>,
): PMNode[] | undefined {
  if (links.size === 0) return nodes;
  return nodes?.map((node) => {
    if (node.type === "text" && node.text?.includes("")) {
      return {
        ...node,
        text: node.text.replace(
          STRAY_PLACEHOLDER,
          (whole) => links.get(whole)?.original ?? whole,
        ),
      };
    }
    if (node.content) {
      return { ...node, content: revertStrayPlaceholders(node.content, links) };
    }
    return node;
  });
}

/**
 * The full pipeline for an API/MCP-authored `description`/`body`: Markdown
 * in, a document with real `mention`/`issueLink`/`dateChip`/`linkChip`
 * chips out (`@handle`, `#PREFIX-123`, `//date`, `[label|url]`
 * respectively), scoped to `workspaceId`.
 */
export async function richTextFromApiMarkdown(
  markdown: string,
  workspaceId: string,
): Promise<PMDoc> {
  const { text, links } = extractLinkBrackets(markdown);
  const doc = fromMarkdown(text);

  const { handles, refs, hasAny } = collectTokens(doc.content);
  if (!hasAny && links.size === 0) return doc;

  const { mentions, issueLinks } = await resolveTokens(
    workspaceId,
    handles,
    refs,
  );

  return {
    ...doc,
    content: revertStrayPlaceholders(
      rewrite(doc.content, mentions, issueLinks, links),
      links,
    ),
  };
}
